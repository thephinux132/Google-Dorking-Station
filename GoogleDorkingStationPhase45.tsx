import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";

/**
 * Google Dorking Station – Phase 5 (Community & Power-user Features)
 * -------------------------------------------------------------------
 * What this build includes:
 * - Visual Dork Builder v2 (drag‑and‑drop chips) with live preview
 * - Templates for Person / Place / Thing + Built-in & Community Packs
 * - **New:** Community Pack import/export (create packs from favorites)
 * - **New:** Collections for organizing favorites
 * - **New:** Substitution engine for placeholders like {date}, {location}
 * - **New:** Suggestion engine to recommend operators
 * - **New:** Safety guardrails for sensitive queries
 * - **New:** Learning Mode 2.0 with an interactive quiz
 * - **New:** Dark mode theme toggle
 * - Favorites (localStorage), filter, JSON export/import
 * - Learning Mode drawer (operator explainer + quick variants)
 * - Multi‑engine selector (Google, DuckDuckGo, Startpage, Brave)
 */

// -----------------------------
// Phase 1 base templates
// -----------------------------
/** @type {Record<string, { label: string; template: string; hint: string }[]>} */
const BASE_TEMPLATES = {
  Person: [
    { label: "Resumes / CVs", template: 'intitle:resume OR intitle:cv "{q}" -job -jobs', hint: "Looks for pages titled resume/CV mentioning the name; excludes job listings." },
    { label: "PDFs mentioning name", template: '"{q}" filetype:pdf', hint: "Finds PDFs containing the exact phrase." },
    { label: "Profiles on sites (generic)", template: '"{q}" (site:about.me OR site:medium.com OR site:substack.com OR site:linktr.ee)', hint: "Common personal/profile hubs." },
    { label: "Leaked credential mentions (defanged)", template: '"{q}" ("password" OR "pass:" OR "api_key" OR "token") -site:github.com', hint: "Research‑only; filters GitHub noise." },
    { label: "Images tagged with name", template: '"{q}" site:images.google.com', hint: "Open Google Images for the phrase." },
  ],
  Place: [
    { label: "Official .gov references", template: '"{q}" site:.gov', hint: "Results on government domains." },
    { label: "News coverage", template: '"{q}" site:news.google.com', hint: "Open Google News." },
    { label: "Maps & reviews", template: '"{q}" ("hours" OR "reviews" OR "address")', hint: "Surfaces maps/review info." },
    { label: "City/County docs (PDF)", template: '"{q}" filetype:pdf (site:.gov OR site:.us)', hint: "Public planning/permits." },
    { label: "Images of place", template: '"{q}" site:images.google.com', hint: "Open images." },
  ],
  Thing: [
    { label: "Manuals / specs (PDF)", template: '"{q}" (manual OR datasheet OR spec) filetype:pdf', hint: "Technical docs for devices." },
    { label: "Troubleshooting / support", template: '"{q}" (error OR issue OR troubleshooting OR support)', hint: "Community fixes & KBs." },
    { label: "Vulnerabilities (info only)", template: '"{q}" (CVE OR vulnerability OR exploit) -site:exploit-db.com', hint: "Research known issues." },
    { label: "Code samples / repos", template: '"{q}" (site:github.com OR site:gitlab.com OR site:bitbucket.org)', hint: "Open‑source references." },
    { label: "Images of thing", template: '"{q}" site:images.google.com', hint: "Quick visual ID." },
  ],
};

// -----------------------------
// Phase 3 preset packs
// -----------------------------
/** @type {Record<string, Record<string, { label: string; template: string; hint: string }[]>>} */
const PRESET_PACKS = {
  Journalism: {
    Person: [
      { label: "Press mentions (context terms)", template: '"{q}" (interview OR profile OR obituary OR biography)', hint: "Contextual coverage terms." },
      { label: "Major outlets", template: 'site:propublica.org "{q}" OR site:nytimes.com "{q}"', hint: "Swap outlets as needed." },
    ],
    Place: [
      { label: "Budget/meeting agendas", template: '"{q}" (agenda OR minutes OR budget) filetype:pdf site:.gov', hint: "City/county docs." },
      { label: "Public records portals", template: '"{q}" (FOIA OR public records) site:.gov', hint: "Records policy/portals." },
    ],
    Thing: [
      { label: "Consumer safety recalls", template: '"{q}" (recall OR safety notice)', hint: "Recall chatter." },
    ],
  },
  Cybersecurity: {
    Person: [
      { label: "Researcher writeups", template: '"{q}" (site:medium.com OR site:substack.com) (CVE OR exploit OR writeup)', hint: "Find technical writeups." },
    ],
    Place: [
      { label: "Breach reports", template: '"{q}" (breach OR ransomware OR "incident report")', hint: "News/DFIR reports." },
    ],
    Thing: [
      { label: "Official advisories", template: '"{q}" (site:cisa.gov OR site:nvd.nist.gov)', hint: "Primary advisories." },
      { label: "Admin panels (safe research)", template: '"{q}" (inurl:admin OR intitle:"login") -site:github.com', hint: "Do not access without auth." },
    ],
  },
  Academics: {
    Person: [
      { label: "Scholar profiles", template: '"{q}" (site:scholar.google.com OR site:researchgate.net)', hint: "Academic footprints." },
    ],
    Place: [
      { label: "Campus docs PDF", template: '"{q}" filetype:pdf site:.edu', hint: "Syllabi, policies, plans." },
    ],
    Thing: [
      { label: "Papers & preprints", template: '"{q}" (site:arxiv.org OR site:acm.org OR site:ieeexplore.ieee.org)', hint: "Scholarly sources." },
    ],
  },
};

// -----------------------------
// Utilities & constants (no optional chaining)
// -----------------------------
const ENGINES = [
  { key: 'google', label: 'Google', base: 'https://www.google.com/search', param: 'q' },
  { key: 'duck', label: 'DuckDuckGo', base: 'https://duckduckgo.com/', param: 'q' },
  { key: 'startpage', label: 'Startpage', base: 'https://www.startpage.com/do/search', param: 'query' },
  { key: 'brave', label: 'Brave', base: 'https://search.brave.com/search', param: 'q' },
];

const FAVORITES_KEY = "gds_favorites_v2";
const LAST_STATE_KEY = "gds_last_state_v2";
const COMMUNITY_PACKS_KEY = "gds_community_packs_v1";
const COLLECTIONS_KEY = "gds_collections_v1";
const THEME_KEY = 'gds_theme';
const makeId = (category: string, label: string, template: string) => category + '|' + label + '|' + template;

const QUIZ_BANK = [
  { id: 'q1', prompt: 'Which operator excludes Pinterest results?', options: ['site:', '-', 'filetype:', 'intitle:'], correctIndex: 1, explain: 'Use a leading minus ( -example.com ) to exclude hosts or terms.' },
  { id: 'q2', prompt: 'How do you restrict to PDF files?', options: ['inurl:', 'filetype:', 'intitle:', 'site:'], correctIndex: 1, explain: 'Use filetype:pdf to limit results to PDFs.' },
  { id: 'q3', prompt: 'How do you search for an exact phrase?', options: ['()', 'OR', '""', '-'], correctIndex: 2, explain: 'Use double quotes ("exact phrase") to match the words in that specific order.' },
];

function getEngine(engineKey: string) {
  for (var i = 0; i < ENGINES.length; i++) if (ENGINES[i].key === engineKey) return ENGINES[i];
  return ENGINES[0];
}
function getEngineLabel(engineKey: string) { return getEngine(engineKey).label; }

function toSearchUrl(engineKey: string, query: string) {
  const e = getEngine(engineKey);
  const u = new URL(e.base);
  u.searchParams.set(e.param, query);
  return u.toString();
}

function explainOperators(tpl: string) {
  const rules = [
    { op: '"…" (quotes)', desc: "Exact phrase matching; keeps word order." },
    { op: "site:", desc: "Limit to a domain/TLD (e.g., site:.gov)." },
    { op: "filetype:", desc: "Restrict to a file type (pdf/docx/xls)." },
    { op: "intitle:", desc: "Require words in the page title." },
    { op: "inurl:", desc: "Require words in the URL path." },
    { op: "OR", desc: "Match either term on each side of OR." },
    { op: "- (minus)", desc: "Exclude noisy terms/sites." },
    { op: "(parentheses)", desc: "Group logic so OR/excludes apply correctly." },
  ];
  const found = [] as {op: string; desc: string}[];
  const t = String(tpl || '').toLowerCase();
  if (t.indexOf('\"{q}\"') > -1 || /"[^\"]+"/.test(tpl)) found.push(rules[0]);
  if (t.indexOf('site:') > -1) found.push(rules[1]);
  if (t.indexOf('filetype:') > -1) found.push(rules[2]);
  if (t.indexOf('intitle:') > -1) found.push(rules[3]);
  if (t.indexOf('inurl:') > -1) found.push(rules[4]);
  if (/\bOR\b/.test(tpl)) found.push(rules[5]);
  if (/(^|\s)-[a-zA-Z]/.test(tpl)) found.push(rules[6]);
  if (String(tpl).indexOf('(') > -1 && String(tpl).indexOf(')') > -1) found.push(rules[7]);
  return found;
}

function validatePack(p: any) {
  if (!p || typeof p !== 'object') return false;
  if (!p.name || typeof p.name !== 'string') return false;
  const cats = ['Person','Place','Thing'];
  for (var i=0;i<cats.length;i++) {
    var cat = cats[i] as keyof typeof p;
    var arr = p[cat];
    if (arr && !Array.isArray(arr)) return false;
    if (arr) {
      for (var j=0;j<arr.length;j++) {
        var t = arr[j];
        if (!t || typeof t.template !== 'string' || typeof t.label !== 'string') return false;
      }
    }
  }
  return true;
}

function applySubs(str: string, map: Record<string, string>) {
  var out = String(str || '');
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) {
      out = out.split('{' + k + '}').join(map[k] || '');
    }
  }
  return out;
}

function suggestFor(q: string, built: string) {
  var S: { type: 'add' | 'wrap' | 'exclude'; chip?: { type: ChipType; value: string }; value?: string; reason: string }[] = [];
  var ql = String(q || '').toLowerCase();
  // Device‑like tokens suggest PDF manuals
  if (/\b(model|router|xr|mk|pro|plus|series|v\d)\b/.test(ql) && !/filetype:pdf\b/i.test(built)) {
    S.push({ type: 'add', chip: { type: 'FILETYPE', value: 'pdf' }, reason: 'Looks like a device; try manuals/specs.' });
  }
  // Place names suggest .gov
  if (/\b(city|county|dept|department|university|school|district)\b/.test(ql) && !/site:\.gov\b/i.test(built) && !/site:\.edu\b/i.test(built)) {
    S.push({ type: 'add', chip: { type: 'SITE', value: '.gov' }, reason: 'Government domains often have official docs.' });
  }
  // Multi‑word names benefit from quotes
  if (!/"/.test(built) && /\s/.test(q)) {
    S.push({ type: 'wrap', reason: 'Use quotes for exact full‑name matching.' });
  }
  // Remove Pinterest for design/inspiration keywords
  if (!/-pinterest\.com/.test(built) && /photo|design|inspiration/i.test(ql)) {
    S.push({ type: 'exclude', value: 'pinterest.com', reason: 'Remove Pinterest results.' });
  }
  return S.slice(0, 4);
}

function detectSensitive(tpl: string) {
  const t = String(tpl || '').toLowerCase();
  const hits: string[] = [];
  if (/\binurl:\s*(admin|login|signup|register|dashboard)\b/.test(t)) hits.push('admin/login paths');
  if (/\b(password|passwd|api_key|token)\b/.test(t)) hits.push('credential terms');
  if (/\bindex\.of\b/.test(t) || /intitle:"index of"/.test(t)) hits.push('directory listing');
  return hits;
}

function useLocalJSON<T>(key: string, initial: T) {
  const [value, setValue] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; } catch (e) { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }, [key, value]);
  return [value, setValue] as [T, React.Dispatch<React.SetStateAction<T>>];
}

function useHashState() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const onHash = () => { setHash(window.location.hash.slice(1)); };
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('hashchange', onHash); };
  }, []);
  const update = (obj: Record<string, string>) => {
    const next = new URLSearchParams(window.location.hash.slice(1));
    for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) next.set(k, String(obj[k]));
    window.location.hash = next.toString();
  };
  const get = (k: string, fallback?: string) => {
    const v = new URLSearchParams(hash).get(k);
    return v == null ? (fallback == null ? '' : fallback) : v;
  };
  return { get, update };
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  if (!text) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 text-sm px-4 py-2 rounded-xl shadow-lg">
        {text}
        <button onClick={onClose} className="ml-3 text-xs underline">Dismiss</button>
      </div>
    </div>
  );
}

// Clipboard helpers
function legacyCopy(text: string) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch (e) { return false; }
}

// -----------------------------
// Builder chip types
// -----------------------------
type ChipType = "PHRASE" | "OR" | "SITE" | "FILETYPE" | "INURL" | "INTITLE" | "EXCLUDE";
interface Chip {
  id: string;
  type: ChipType;
  value: string;
}

const CHIP_LABEL: Record<ChipType, string> = {
  PHRASE: '"…"',
  OR: 'OR‑group',
  SITE: 'site:',
  FILETYPE: 'filetype:',
  INURL: 'inurl:',
  INTITLE: 'intitle:',
  EXCLUDE: '‑exclude',
};
const CHIP_HELP: Record<ChipType, string> = {
  PHRASE: 'Exact phrase. Leave empty to use {q}.',
  OR: 'Comma‑separated terms; will be wrapped like (a OR b OR c).',
  SITE: 'Domain or TLD, e.g., example.com or .gov',
  FILETYPE: 'pdf, docx, xls, etc.',
  INURL: 'Require term in URL path.',
  INTITLE: 'Require term in page title.',
  EXCLUDE: 'Comma‑separated terms; each becomes -term.',
};

export default function GoogleDorkingStationPhase5() {
  const hash = useHashState();
  const [q, setQ] = useState(hash.get('q', ''));
  const [category, setCategory] = useState(hash.get('cat', 'Person'));
  const [filter, setFilter] = useState('');
  const [pack, setPack] = useState('None');
  const [engine, setEngine] = useState(() => { try { return localStorage.getItem('gds_engine') || 'google'; } catch (e) { return 'google'; } });
  const [favorites, setFavorites] = useLocalJSON<{ id: string; label: string; template: string; category: string }[]>(FAVORITES_KEY, []);
  const [communityPacks, setCommunityPacks] = useLocalJSON<any[]>(COMMUNITY_PACKS_KEY, []);
  const [collections, setCollections] = useLocalJSON<{ id: string; name: string; description: string; items: any[]; createdAt: number; updatedAt: number }[]>(COLLECTIONS_KEY, []);
  const [subs, setSubs] = useState({ q: '', date: '', location: '', filetype: '' });
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; } });
  const [quizState, setQuizState] = useState({ current: 0, correct: 0, answered: null as number | null });
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const [toast, setToast] = useState('');
  const [copyModalText, setCopyModalText] = useState('');
  const [learningOpen, setLearningOpen] = useState(false);
  const [learningQuery, setLearningQuery] = useState('');
  const [chips, setChips] = useState<Chip[]>([
    { id: 'c0', type: 'PHRASE', value: '' },
    { id: 'c1', type: 'SITE', value: '' },
    { id: 'c2', type: 'FILETYPE', value: '' },
  ]);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    const el = document.documentElement;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      el.classList.add('dark');
    } else {
      el.classList.remove('dark');
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
        if (theme === 'system') {
            if (mediaQuery.matches) el.classList.add('dark');
            else el.classList.remove('dark');
        }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  useEffect(() => { try { localStorage.setItem(LAST_STATE_KEY, JSON.stringify({ q, category })); } catch (e) {} }, [q, category]);
  useEffect(() => {
    try { const raw = localStorage.getItem(LAST_STATE_KEY); if (raw) { const s = JSON.parse(raw); if (s && typeof s.q === 'string') setQ(s.q); if (s && typeof s.category === 'string') setCategory(s.category); } } catch (e) {}
  }, []);
  useEffect(() => { try { localStorage.setItem('gds_engine', engine); } catch (e) {} }, [engine]);
  useEffect(() => { hash.update({ q, cat: category }); }, [q, category]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        const first = document.querySelector('a[data-gds-open]') as HTMLAnchorElement | null;
        if (first) first.click();
      }
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        const el = document.getElementById('filter-input');
        if (el && typeof (el as HTMLInputElement).focus === 'function') (el as HTMLInputElement).focus();
      }
      if (e.altKey && String(e.key).toLowerCase() === 'o') {
        e.preventDefault();
        const els = document.querySelectorAll('a[data-gds-open]');
        if (els && els.length && window.confirm('Open all ' + els.length + ' queries?')) {
          els.forEach((el, idx) => { setTimeout(() => { (el as HTMLAnchorElement).click(); }, idx * 200); });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, []);

  const disabled = q.trim().length === 0;
  const renderTemplate = useCallback((tpl: string) => String(tpl).split('{q}').join(q.trim()), [q]);
  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  const favoritesToPack = useCallback((packName: string, author: string) => {
    const byCat: Record<string, { label: string; template: string; hint: string }[]> = { Person: [], Place: [], Thing: [] };
    for (var i=0; i < favorites.length; i++) {
      var f = favorites[i];
      if (byCat[f.category]) {
        (byCat[f.category as keyof typeof byCat] as any).push({
          label: f.label,
          template: f.template,
          hint: 'Saved favorite'
        });
      }
    }
    return {
      name: packName.trim() || 'Untitled',
      author: author || 'Local',
      description: 'Generated from favorites',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      Person: byCat.Person,
      Place: byCat.Place,
      Thing: byCat.Thing
    };
  }, [favorites]);

  const createCollection = useCallback((name: string, description: string) => {
    const c = {
      id: 'COLL_' + Math.random().toString(36).slice(2, 8),
      name,
      description: description || '',
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setCollections(prev => prev.concat([c]));
  }, [setCollections]);

  const addFavoriteToCollection = useCallback((collId: string, fav: { label: string; template: string; category: string }) => {
    setCollections(prev => prev.map(coll => {
      if (coll.id !== collId) return coll;
      const exists = coll.items.some(it => it.label === fav.label && it.template === fav.template);
      if (exists) {
        setToast('Favorite already in this collection');
        setTimeout(() => setToast(''), 1400);
        return coll;
      }
      setToast(`Added to collection: ${coll.name}`);
      setTimeout(() => setToast(''), 1400);
      return { ...coll, items: coll.items.concat([fav]), updatedAt: Date.now() };
    }));
  }, [setCollections]);

  function packRows(cat: string, selectedPack: string) {
    const base = BASE_TEMPLATES[cat as keyof typeof BASE_TEMPLATES] || [];
    if (selectedPack === 'None') return base.slice();
    if (PRESET_PACKS[selectedPack as keyof typeof PRESET_PACKS]) {
      const extra = (PRESET_PACKS[selectedPack as keyof typeof PRESET_PACKS] as any)[cat] || [];
      return base.concat(extra);
    }
    const communityPack = communityPacks.find(p => p.name === selectedPack);
    if (communityPack) {
      const extra = communityPack[cat] || [];
      return base.concat(extra);
    }
    return base.slice();
  }

  const baseRows = useMemo(() => {
    if (category === 'Favorites') {
      return favorites.map((f) => ({ label: f.label, template: f.template, hint: 'Saved from ' + f.category }));
    }
    return packRows(category, pack);
  }, [category, pack, favorites, communityPacks]);

  const rows = useMemo(() => {
    if (!filter.trim()) return baseRows;
    const f = filter.toLowerCase();
    return baseRows.filter((r) => {
      return r.label.toLowerCase().indexOf(f) > -1 || r.template.toLowerCase().indexOf(f) > -1 || r.hint.toLowerCase().indexOf(f) > -1;
    });
  }, [baseRows, filter]);

  const toggleFavorite = (cat: string, label: string, template: string) => {
    const id = makeId(cat, label, template);
    if (favoriteIds.has(id)) {
      setFavorites((prev) => prev.filter((x) => x.id !== id));
      setToast('Removed from favorites');
    } else {
      setFavorites((prev) => prev.concat([{ id, label, template, category: cat }]));
      setToast('Saved to favorites');
    }
    setTimeout(() => { setToast(''); }, 1400);
  };

  const writeClipboard = async (text: string) => {
    if (typeof text !== 'string') text = String(text == null ? '' : text);
    if (!text) return false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setToast('Copied to clipboard');
        setTimeout(() => { setToast(''); }, 1400);
        return true;
      }
    } catch (e) {}
    const ok = legacyCopy(text);
    if (ok) { setToast('Copied to clipboard'); setTimeout(() => { setToast(''); }, 1400); return true; }
    setCopyModalText(text); setToast('Clipboard blocked here. Use manual copy.'); setTimeout(() => { setToast(''); }, 1800); return false;
  };

  const addChip = (type: ChipType) => {
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    setChips((prev) => prev.concat([{ id, type, value: '' }]));
  };
  const updateChip = (id: string, value: string) => {
    setChips((prev) => prev.map((c) => (c.id === id ? { id: c.id, type: c.type, value } : c)));
  };
  const removeChip = (id: string) => { setChips((prev) => prev.filter((c) => c.id !== id)); };
  const onDragStart = (id: string) => { setDragId(id); };
  const onDragOver = (e: React.DragEvent<HTMLLIElement>, overId: string) => { e.preventDefault(); if (dragId == null || dragId === overId) return; };
  const onDrop = (overId: string) => {
    setChips((prev) => {
      if (!dragId || dragId === overId) return prev;
      let srcIdx = -1, dstIdx = -1;
      for (let i = 0; i < prev.length; i++) { if (prev[i].id === dragId) srcIdx = i; if (prev[i].id === overId) dstIdx = i; }
      if (srcIdx < 0 || dstIdx < 0) return prev;
      const next = prev.slice();
      const moved = next.splice(srcIdx, 1)[0];
      next.splice(dstIdx, 0, moved);
      return next;
    });
    setDragId(null);
  };

  const builtTemplate = useMemo(() => {
    const parts: string[] = [];
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      const v = String(c.value || '').trim();
      if (c.type === 'PHRASE') { parts.push('"' + (v || '{q}') + '"'); continue; }
      if (c.type === 'OR') {
        if (!v) continue; const terms = v.split(',').map((s) => s.trim()).filter(Boolean); if (terms.length) parts.push('(' + terms.join(' OR ') + ')'); continue;
      }
      if (c.type === 'SITE' && v) { parts.push('site:' + v); continue; }
      if (c.type === 'FILETYPE' && v) { parts.push('filetype:' + v); continue; }
      if (c.type === 'INURL' && v) { parts.push('inurl:' + v); continue; }
      if (c.type === 'INTITLE' && v) { parts.push('intitle:' + v); continue; }
      if (c.type === 'EXCLUDE' && v) {
        const ex = v.split(',').map((s) => s.trim()).filter(Boolean).map((w) => (w.charAt(0) === '-' ? w : '-' + w));
        if (ex.length) parts.push(ex.join(' '));
        continue;
      }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }, [chips]);

  const renderedQuery = useMemo(() => {
    let t = builtTemplate;
    const subsWithoutQ = { ...subs };
    delete (subsWithoutQ as any).q;
    t = applySubs(t, subsWithoutQ);
    t = t.split('{q}').join((subs.q || q).trim());
    return t.replace(/\s+/g, ' ').trim();
  }, [builtTemplate, subs, q, renderTemplate]);
  const addBuiltToFavorites = () => {
    let phraseChipValue = '';
    for (let i = 0; i < chips.length; i++) if (chips[i].type === 'PHRASE') { phraseChipValue = chips[i].value; break; }
    const label = 'Custom (Visual): ' + (phraseChipValue || '{q}');
    const id = makeId(category, label, builtTemplate);
    for (let j = 0; j < favorites.length; j++) if (favorites[j].id === id) { setToast('Already in favorites'); setTimeout(() => { setToast(''); }, 1400); return; }
    setFavorites((prev) => prev.concat([{ id, label, template: builtTemplate, category }]));
    setToast('Added custom query to favorites');
    setTimeout(() => { setToast(''); }, 1400);
  };

  const InfoIcon = (props: any) => (<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden className="inline align-text-bottom" {...props}><path d="M11 10h2v7h-2zM11 7h2v2h-2z"/><path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2m0 2a8 8 0 1 1-.001 16.001A8 8 0 0 1 12 4"/></svg>);
  const StarIcon = ({ filled }: { filled: boolean }) => (<svg viewBox="0 0 24 24" width="18" height="18" className={'inline ' + (filled ? 'text-yellow-500' : 'text-gray-400')} fill="currentColor" aria-hidden><path d="M12 .587l3.668 7.431 8.2 1.193-5.934 5.787 1.401 8.164L12 18.896l-7.335 3.866 1.401-8.164L.132 9.211l8.2-1.193L12 .587z"/></svg>);
  const XIcon = () => (<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor" className="inline align-text-bottom"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29 10.59 10.6l6.3-6.31z"/></svg>);
  const TabButton = ({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) => (
    <button onClick={onClick} title={title} className={'rounded-2xl px-4 py-3 text-sm font-medium border shadow-sm transition ' + (active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700')}>{children}</button>
  );
  const IconButton = ({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title?: string; disabled?: boolean }) => (
    <button onClick={onClick} title={title} disabled={disabled} className={'rounded-2xl px-3 py-2 text-sm border bg-white hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 ' + (disabled ? 'opacity-60 pointer-events-none' : '')}>{children}</button>
  );

  const learningOps = useMemo(() => explainOperators(learningQuery), [learningQuery]);
  const learningVariants = useMemo(() => {
    if (!learningQuery) return [];
    const v: string[] = [];
    v.push(learningQuery + ' -site:pinterest.com');
    v.push(learningQuery.split('site:.gov').join('site:.edu'));
    if (!/filetype:/.test(learningQuery)) v.push(learningQuery + ' filetype:pdf');
    if (!/intitle:/.test(learningQuery)) v.push('intitle:(report OR resume) ' + learningQuery);
    const seen: Record<string, boolean> = {}; const out: string[] = [];
    for (let i = 0; i < v.length; i++) { if (!seen[v[i]]) { seen[v[i]] = true; out.push(v[i]); } }
    return out.slice(0, 4);
  }, [learningQuery]);

  function CopyModal({ text, onClose }: { text: string; onClose: () => void }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
      const ta = ref.current;
      if (ta && typeof ta.focus === 'function') { ta.focus(); ta.select && ta.select(); }
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => { window.removeEventListener('keydown', onKey); };
    }, [onClose]);
    if (!text) return null;
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(680px,92vw)] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border dark:border-gray-600 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Manual copy</h3>
            <button className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200" onClick={onClose} title="Close"><XIcon /></button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Clipboard is blocked in this environment. Select all and press <kbd>Ctrl/Cmd+C</kbd>.</p>
          <textarea ref={ref} className="w-full h-44 rounded-xl border p-2 text-sm bg-gray-50 dark:bg-gray-700 dark:border-gray-600" defaultValue={text} readOnly />
          <div className="mt-3 text-right">
            <button onClick={onClose} className="rounded-2xl px-3 py-2 text-sm border bg-white hover:bg-gray-100">Close</button>
          </div>
        </div>
      </div>
    );
  }

  function safeFavoriteOrigin(template: string, label: string) {
    for (let i = 0; i < favorites.length; i++) {
      const f = favorites[i];
      if (f.template === template && f.label === label) return f.category || 'Favorites';
    }
    return 'Favorites';
  }
  function packCount(selectedPack: string, cat: string) {
    if (!selectedPack || selectedPack === 'None') return 0;
    const p = PRESET_PACKS[selectedPack];
    if (!p) return 0;
    const arr = (p as any)[cat];
    return arr && arr.length ? arr.length : 0;
  }

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Google Dorking Station · Phase 5</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Community packs, collections, substitutions, suggestions, and more. Educational OSINT only.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTheme(prev => { if (prev === 'light') return 'dark'; if (prev === 'dark') return 'system'; return 'light'; })}
                    className="text-xs rounded-2xl px-3 py-2 border bg-white hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700"
                    title={`Theme: ${theme}`}>
              {theme === 'light' && '💡 Light'}
              {theme === 'dark' && '🌙 Dark'}
              {theme === 'system' && '💻 System'}
            </button>
          </div>
        </header>
        <div className="grid gap-3 md:grid-cols-[1fr,auto] items-end">
          <div>
            <label htmlFor="main-q-input" className="block text-sm font-medium mb-1">Keyword / Name</label>
            <div className="relative">
              <input id="main-q-input" className="w-full rounded-2xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-4 py-3 pr-12 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder='e.g., "Jane Q. Analyst" or "Acme XR-200 Router"' value={q} onChange={(e) => { setQ(e.target.value); }} />
              {q ? (
                <button onClick={() => { setQ(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Clear input" aria-label="Clear input"><XIcon /></button>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {['Person','Place','Thing','Favorites','Community','Collections'].map((c) => (
              <TabButton key={c} active={category === c} onClick={() => { setCategory(c); }} title={'Templates for ' + c.toLowerCase()}>{c}</TabButton>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr,auto,auto,auto] items-end">
          <div>
            <label htmlFor="filter-input" className="block text-sm font-medium mb-1">Filter templates <span className="text-xs text-gray-400">(Ctrl/Cmd+K)</span></label>
            <div className="relative">
              <input id="filter-input" className="w-full rounded-2xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-4 py-2 pr-24 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Type to filter by label, operator, or hint (e.g., filetype:pdf, CVE)" value={filter} onChange={(e) => { setFilter(e.target.value); }} />
              {filter ? (
                <button onClick={() => { setFilter(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" title="Reset filter" aria-label="Reset filter"><XIcon /></button>
              ) : null}
            </div>
          </div>
          {['Person','Place','Thing'].includes(category) ? (
            <div>
              <label className="block text-sm font-medium mb-1">Template pack</label>
              <select className="w-full rounded-2xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={pack} onChange={(e) => { setPack(e.target.value); }}>
                <optgroup label="Built-in">
                  {['None','Journalism','Cybersecurity','Academics'].map((p) => <option key={p} value={p}>{p}</option>)}
                </optgroup>
                {communityPacks.length > 0 ? <optgroup label="Community">
                  {communityPacks.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </optgroup> : null}
              </select>
            </div>
          ) : (<div />)}
          <div>
            <label className="block text-sm font-medium mb-1">Search engine</label>
            <select className="w-full rounded-2xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={engine} onChange={(e) => { setEngine(e.target.value); }} title="Some engines only partially support Google‑style operators.">
              {ENGINES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-end">
            <div className="hidden md:block text-xs text-gray-500 dark:text-gray-400 -mb-1">Favorites: {favorites.length}</div>
            <IconButton onClick={async () => { const lines = rows.map((r) => renderTemplate(r.template)); await writeClipboard(lines.join('\n')); }} title={'Copy visible queries (for ' + getEngineLabel(engine) + ')'}>Copy visible</IconButton>
            <IconButton onClick={() => { const blob = new Blob([JSON.stringify(favorites, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'gds_favorites.json'; a.click(); URL.revokeObjectURL(url); }} title="Download favorites as JSON">Export JSON</IconButton>
            <label className="rounded-2xl px-3 py-2 text-sm border bg-white hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 cursor-pointer" title="Import favorites JSON">
              Import JSON
              <input type="file" accept="application/json" className="hidden" onChange={(e) => {
                const file = e && e.target && e.target.files && e.target.files[0] ? e.target.files[0] : null;
                if (file) {
                  file.text().then((t) => { try { const arr = JSON.parse(t); if (!Array.isArray(arr)) throw new Error('Invalid'); let merged = favorites.slice(); const seen: Record<string, boolean> = {}; for (let i = 0; i < merged.length; i++) seen[merged[i].id] = true; for (let j = 0; j < arr.length; j++) { const it = arr[j]; if (it && it.id && !seen[it.id]) { merged.push(it); seen[it.id] = true; } } setFavorites(merged); setToast('Imported favorites'); setTimeout(() => { setToast(''); }, 1400); } catch (err) { setToast('Import failed'); setTimeout(() => { setToast(''); }, 1400); } });
                }
                if (e && e.currentTarget) (e.currentTarget as HTMLInputElement).value = '';
              }} />
            </label>
          </div>
        </div>
        {['Person', 'Place', 'Thing', 'Favorites'].includes(category) ? (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700">
          <div className="px-4 py-3 border-b dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold">{category} templates {pack !== 'None' && category !== 'Favorites' ? (<span className="text-xs text-gray-500 dark:text-gray-400">(+ {packCount(pack, category)} from {pack})</span>) : null}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">{rows.length} shown</span>
              {rows.length > 0 ? (
                <button
                  onClick={() => { if(!window.confirm('Open all ' + rows.length + ' queries in new tabs? This may be a lot.')) return; rows.forEach((row, idx) => { const query = renderTemplate(row.template); const url = toSearchUrl(engine, query); setTimeout(() => { window.open(url, '_blank'); }, idx*200); }); }}
                  className="text-xs px-2 py-1 rounded-lg border bg-white hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600"
                  title="Open all visible queries in new tabs"
                >Open all</button>
              ) : null}
            </div>
          </div>
          <ul className="divide-y dark:divide-gray-700">
            {rows.map((row, idx) => {
              const query = renderTemplate(row.template);
              const resolvedCat = category === 'Favorites' ? safeFavoriteOrigin(row.template, row.label) : category;
              const id = makeId(resolvedCat, row.label, row.template);
              const isFav = favoriteIds.has(id);
              const ops = explainOperators(row.template);
              const isOpen = expanded.has(id);
              const engineLabel = getEngineLabel(engine);
              return (
                <li key={row.label + '-' + idx} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate" title={row.label}>{row.label}</div>
                        <button className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 text-xs inline-flex items-center gap-1" onClick={() => { setLearningQuery(query); setLearningOpen(true); }} title="Open in Learning Mode"><InfoIcon /> <span className="underline">Learn</span></button>
                        <button className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 text-xs inline-flex items-center gap-1" onClick={() => { setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }} title="Explain operators">Operators</button>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5" title={row.hint}>{row.hint}</div>
                      {isOpen ? (
                        <div className="mt-3 text-sm bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/30 rounded-xl p-3">
                          <div className="font-medium mb-1">Why this works</div>
                          <ul className="list-disc pl-5 space-y-1">
                            {ops.length === 0 ? (<li>Simple keyword search. Add <code>site:</code> or <code>filetype:</code> to tighten results.</li>) : ops.map((o, i) => (<li key={i}><span className="font-medium">{o.op}:</span> {o.desc}</li>))}
                          </ul>
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">Try swapping domains in <code>site:</code>, add <code>-example.com</code> to remove noise, or restrict to <code>filetype:pdf</code>.</div>
                        </div>
                      ) : null}
                      <code className="block mt-2 text-sm bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl px-3 py-2 overflow-x-auto" title={query}>{query}</code>
                    </div>
                    <div className="flex items-start gap-2 shrink-0">
                      <IconButton onClick={() => { writeClipboard(query); }} disabled={disabled} title={disabled ? 'Enter a keyword above first.' : 'Copy the full query'}>Copy</IconButton>
                      <a data-gds-open className={'rounded-2xl px-3 py-2 text-sm border shadow-sm ' + (disabled ? 'pointer-events-none opacity-60 bg-gray-100' : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700')} href={disabled ? undefined : toSearchUrl(engine, query)} target="_blank" rel="noreferrer" title={disabled ? 'Enter a keyword above first.' : 'Open on ' + engineLabel}>{'Open in ' + engineLabel}</a>
                      {category === 'Favorites' && collections.length > 0 && (
                        <div className="relative">
                          <select onChange={(e) => { if (e.target.value) { addFavoriteToCollection(e.target.value, { label: row.label, template: row.template, category: resolvedCat }); (e.target as HTMLSelectElement).value = ''; } }} className="rounded-2xl px-3 py-2 text-sm border bg-white hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 appearance-none" title="Add to collection">
                            <option value="">+ Collection</option>
                            {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      )}
                      <button className={'rounded-2xl px-2.5 py-2 text-sm border bg-white hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 ' + (isFav ? 'ring-1 ring-yellow-300' : '')} onClick={() => { toggleFavorite(resolvedCat, row.label, row.template); }} title={isFav ? 'Remove from favorites' : 'Save to favorites'} aria-label={isFav ? 'Remove from favorites' : 'Save to favorites'}><StarIcon filled={isFav} /></button>
                    </div>
                  </div>
                </li>
              );
            })}
            {rows.length === 0 ? (<li className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No templates match your filter.</li>) : null}
          </ul>
        </div>
        ) : null}
        {category === 'Community' ? (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 p-4">
            <h2 className="font-semibold mb-2">Community Packs</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Import packs from the community or create one from your favorites.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">Create from Favorites</h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 border dark:border-gray-600 rounded-xl p-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Bundle all {favorites.length} of your current favorites into a distributable JSON pack file.</p>
                  <IconButton onClick={() => {
                    const name = window.prompt('Enter a name for your pack:', 'My Favorites Pack');
                    if (!name) return;
                    const author = window.prompt('Enter your name or handle (optional):', 'Local User');
                    const packData = favoritesToPack(name, author || '');
                    const blob = new Blob([JSON.stringify(packData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${name.replace(/\s+/g, '_')}_pack.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }} disabled={favorites.length === 0}>
                    Export Favorites as Pack
                  </IconButton>
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-2">Manage Packs</h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 border dark:border-gray-600 rounded-xl p-3">
                  <label className="w-full text-center cursor-pointer rounded-2xl px-3 py-2 text-sm border bg-white hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 block" title="Import community pack JSON">
                    Import Pack from JSON
                    <input type="file" accept="application/json" className="hidden" onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (file) {
                        file.text().then(text => {
                          try {
                            const data = JSON.parse(text);
                            const packsToImport = Array.isArray(data) ? data : [data];
                            let addedCount = 0;
                            const nextPacks = [...communityPacks];
                            const existingNames = new Set(nextPacks.map(p => p.name));
                            for (const pack of packsToImport) {
                              if (validatePack(pack) && !existingNames.has(pack.name)) {
                                nextPacks.push(pack);
                                existingNames.add(pack.name);
                                addedCount++;
                              }
                            }
                            if (addedCount > 0) { setCommunityPacks(nextPacks); setToast(`Imported ${addedCount} new pack(s).`); }
                            else { setToast('No new valid packs found to import.'); }
                          } catch (err) { setToast('Import failed: Invalid JSON file.'); }
                          finally { setTimeout(() => setToast(''), 1800); }
                        });
                        if (e.currentTarget) e.currentTarget.value = '';
                      }
                    }} />
                  </label>
                  <ul className="mt-3 space-y-2">
                    {communityPacks.map((p, i) => (
                      <li key={i} className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 p-2 rounded-lg border dark:border-gray-600">
                        <span>{p.name} <span className="text-xs text-gray-500 dark:text-gray-400">by {p.author || 'Unknown'}</span></span>
                        <button onClick={() => {
                          if (window.confirm(`Are you sure you want to remove the "${p.name}" pack?`)) {
                            setCommunityPacks(prev => prev.filter(cp => cp.name !== p.name));
                            setToast('Pack removed.'); setTimeout(() => setToast(''), 1400);
                          }
                        }} className="text-red-600 hover:text-red-800" title="Remove pack"><XIcon /></button>
                      </li>
                    ))}
                    {communityPacks.length === 0 && <li className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">No community packs installed.</li>}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {category === 'Collections' ? (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold">Collections</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Organize favorites into shareable sets.</p>
              </div>
              <IconButton onClick={() => { const name = window.prompt('New collection name:'); if (name) createCollection(name, ''); }}>
                + New Collection
              </IconButton>
            </div>
            {collections.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                No collections yet. Create one to get started.
              </div>
            ) : (
              <ul className="space-y-4">
                {collections.map(coll => (
                  <li key={coll.id} className="bg-gray-50 dark:bg-gray-700/50 border dark:border-gray-600 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{coll.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{coll.items.length} items</span>
                        <button onClick={() => { if (window.confirm(`Delete collection "${coll.name}"? This cannot be undone.`)) { setCollections(prev => prev.filter(c => c.id !== coll.id)); } }} className="text-red-600 hover:text-red-800" title="Delete collection"><XIcon /></button>
                      </div>
                    </div>
                    {coll.items.length > 0 ? (
                      <ul className="mt-2 space-y-1 divide-y dark:divide-gray-600">
                        {coll.items.map((item, idx) => (
                          <li key={idx} className="text-sm pt-1 flex justify-between items-center">
                            <span className="truncate" title={item.template}>{item.label}</span>
                            <button onClick={() => { setCollections(prev => prev.map(c => c.id !== coll.id ? c : { ...c, items: c.items.filter((_, i) => i !== idx) })); }} className="text-gray-500 hover:text-red-600" title="Remove from collection"><XIcon /></button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Empty collection. Add favorites from the Favorites tab.</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Note: Engine {getEngineLabel(engine)} may handle operators differently (e.g., DuckDuckGo ignores some <code>filetype:</code> filters).</div>
        {['Person','Place','Thing','Favorites'].includes(category) ? (
          <section className="mt-8 grid lg:grid-cols-[2fr,1fr] gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Dork Builder v2 (drag‑and‑drop)</h3>
                <div className="text-xs text-gray-500 dark:text-gray-400">Reorder chips to change query structure</div>
              </div>
              <div className="mb-3">
                {(suggestFor(q, builtTemplate)).map((s, i) => {
                  let label = '';
                  if (s.type === 'add' && s.chip) label = `+${s.chip.type.toLowerCase()}:${s.chip.value}`;
                  if (s.type === 'wrap') label = 'Wrap in "…"';
                  if (s.type === 'exclude' && s.value) label = `-${s.value}`;
                  return (
                    <button key={i} onClick={() => {
                      if (s.type === 'add' && s.chip) { setChips(prev => prev.concat([{ id: 'c' + Math.random().toString(36).slice(2, 6), type: s.chip.type, value: s.chip.value }])); }
                      if (s.type === 'wrap') {
                        const hasPhrase = chips.some(c => c.type === 'PHRASE');
                        if (hasPhrase) { setChips(prev => { let u = false; return prev.map(c => { if (c.type === 'PHRASE' && !u) { u = true; return { ...c, value: q }; } return c; }); }); }
                        else { setChips(prev => [{ id: 'c' + Math.random().toString(36).slice(2, 6), type: 'PHRASE', value: q }].concat(prev)); }
                      }
                      if (s.type === 'exclude' && s.value) { setChips(prev => prev.concat([{ id: 'c' + Math.random().toString(36).slice(2, 6), type: 'EXCLUDE', value: s.value }])); }
                    }} title={s.reason} className="text-xs mr-2 mb-2 px-2 py-1 rounded-lg border bg-white hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600">
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {([
                  ['PHRASE','Phrase'],
                  ['OR','OR‑group'],
                  ['SITE','site:'],
                  ['FILETYPE','filetype:'],
                  ['INURL','inurl:'],
                  ['INTITLE','intitle:'],
                  ['EXCLUDE','‑exclude'],
                ] as [ChipType, string][]).map(([t, lbl]) => (
                  <button key={t} onClick={() => { addChip(t); }} className="rounded-xl px-3 py-1.5 text-xs border bg-white hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600" title={CHIP_HELP[t]}>{lbl}</button>
                ))}
                <button onClick={() => { setChips([{ id:'c_phrase', type:'PHRASE', value:'' }]); }} className="rounded-xl px-3 py-1.5 text-xs border bg-white hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600" title="Reset to just the phrase chip">Reset</button>
              </div>
              <div className="rounded-xl border dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3 min-h-[88px]">
                {chips.length === 0 ? (<div className="text-xs text-gray-500 dark:text-gray-400">No chips yet. Use the legend above to add parts.</div>) : null}
                <ul className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <li key={c.id}
                        draggable
                        onDragStart={() => { onDragStart(c.id); }}
                        onDragOver={(e) => { onDragOver(e, c.id); }}
                        onDrop={() => { onDrop(c.id); }}
                        className="bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-2xl px-3 py-2 shadow-sm flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{CHIP_LABEL[c.type]}</span>
                      <input className="text-xs border dark:border-gray-600 dark:bg-gray-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={CHIP_HELP[c.type]} value={c.value} onChange={(e) => { updateChip(c.id, e.target.value); }} style={{ minWidth: 140 }} />
                      <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" onClick={() => { removeChip(c.id); }} title="Remove chip"><XIcon/></button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4">
                <div className="text-xs font-semibold mb-1">Substitutions</div>
                <div className="grid md:grid-cols-4 gap-2">
                  {['q','date','location','filetype'].map(k => (
                    <div key={k}>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{'{' + k + '}'}</label>
                      <input value={(subs as any)[k]} onChange={e => setSubs(prev => ({ ...prev, [k]: e.target.value }))} 
                             className="w-full rounded-xl border dark:border-gray-600 dark:bg-gray-700 px-2 py-1 text-sm" placeholder={k === 'q' ? 'keyword override' : k} />
                    </div>
                  ))}
                </div>
              </div>
              {(() => {
                const hits = detectSensitive(builtTemplate);
                if (!hits.length) return null;
                return (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs p-3">
                    <div className="font-semibold mb-1">Heads‑up: sensitive operators detected</div>
                    <div>Flags: {hits.join(', ')}. Use these queries only for legitimate research and never to access systems without permission.</div>
                  </div>
                );
              })()}
              <div className="mt-4">
                <div className="text-xs font-semibold mb-1">Template</div>
                <code className="block text-sm bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl px-3 py-2 overflow-x-auto" title={builtTemplate || '—'}>{builtTemplate || '—'}</code>
                <div className="text-xs font-semibold mt-3 mb-1">Rendered with q</div>
                <code className="block text-sm bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl px-3 py-2 overflow-x-auto" title={renderedQuery || '—'}>{renderedQuery || '—'}</code>
                <div className="flex gap-2 mt-3">
                  <IconButton onClick={addBuiltToFavorites} title="Add this template to Favorites" disabled={!builtTemplate}>Add to Favorites</IconButton>
                  <IconButton onClick={() => { writeClipboard(renderedQuery); }} title="Copy rendered query" disabled={!renderedQuery}>Copy rendered</IconButton>
                  <a className={'rounded-2xl px-3 py-2 text-sm border shadow-sm ' + ((!renderedQuery || disabled) ? 'pointer-events-none opacity-60 bg-gray-100' : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700')} href={!renderedQuery || disabled ? undefined : toSearchUrl(engine, renderedQuery)} target="_blank" rel="noreferrer" title={!renderedQuery || disabled ? 'Enter a keyword above first.' : 'Open on ' + getEngineLabel(engine)}>{'Open in ' + getEngineLabel(engine)}</a>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 shadow-sm p-4">
              <h3 className="font-semibold mb-2">Learning Mode (quick)</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">Select any query’s <span className="font-medium">Learn</span> to open the drawer. Or practice with your built template.</p>
              <div className="mt-3 flex gap-2">
                <IconButton onClick={() => { setLearningQuery(renderTemplate(builtTemplate)); setLearningOpen(true); }} title="Open drawer with built template" disabled={!q.trim() || !builtTemplate}>Practice built query</IconButton>
                <IconButton onClick={() => { const first = rows[0] ? renderTemplate(rows[0].template) : ''; setLearningQuery(first); setLearningOpen(true); }} title="Open drawer with first template" disabled={!rows[0]}>Learn first template</IconButton>
              </div>
            </div>
          </section>
        ) : null}
        <footer className="mt-8 text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <p>Built for learning. Don’t automate scraping; queries open in your browser to respect Google’s ToS.</p>
          <p>Pro‑tip: Reorder chips to test how OR groups interact with site/filetype scopes.</p>
        </footer>
      </div>
      {learningOpen ? (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={() => { setLearningOpen(false); }}></div>
          <aside className="absolute right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-800 shadow-2xl p-5 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Learning Mode</h3>
              <button className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200" onClick={() => { setLearningOpen(false); }} title="Close"><XIcon/></button>
            </div>
            <div className="mt-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">Working query</div>
              <code className="block mt-1 text-sm bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-xl px-3 py-2 overflow-x-auto">{learningQuery || '—'}</code>
            </div>
            <div className="mt-4">
              <div className="font-medium mb-1">Operators detected</div>
              {learningOps.length ? (
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {learningOps.map((o, i) => (<li key={i}><span className="font-medium">{o.op}:</span> {o.desc}</li>))}
                </ul>
              ) : (<div className="text-sm text-gray-600 dark:text-gray-400">No special operators—consider adding <code>site:</code>, <code>filetype:</code>, or <code>-exclude</code>.</div>)}
            </div>
            <div className="mt-4">
              <div className="font-medium mb-1">Try these variants</div>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {learningVariants.map((v, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate" title={v}>{v}</span>
                    <div className="shrink-0 flex gap-2">
                      <IconButton onClick={() => { writeClipboard(v); }} title="Copy variant">Copy</IconButton>
                      <a className="rounded-2xl px-3 py-2 text-sm border shadow-sm bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700" href={toSearchUrl(engine, v)} target="_blank" rel="noreferrer">{'Open in ' + getEngineLabel(engine)}</a>
                    </div>
                  </li>
                ))}
                {learningVariants.length === 0 ? (<li className="text-sm text-gray-600 dark:text-gray-400">Create a query first to see variants.</li>) : null}
              </ul>
            </div>
            <div className="mt-4">
              <div className="font-medium mb-1">Practice task</div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Change exactly one operator. Observe how the result set shifts. Example: switch <code>site:.gov</code> → <code>site:.edu</code>, or add <code>-pinterest.com</code>. Save the better version to Favorites.</p>
            </div>
            <div className="mt-4 border-t dark:border-gray-700 pt-4">
              <h4 className="font-medium mb-2">Quiz</h4>
              {(() => {
                const q = QUIZ_BANK[quizState.current];
                return (
                  <div>
                    <p className="text-sm mb-2">{quizState.current + 1}. {q.prompt}</p>
                    <div className="space-y-2">
                      {q.options.map((opt, idx) => (
                        <label key={idx} className="flex items-center gap-2 text-sm p-2 rounded-lg border dark:border-gray-600 has-[:checked]:bg-indigo-50 has-[:checked]:border-indigo-300 dark:has-[:checked]:bg-indigo-900/50 dark:has-[:checked]:border-indigo-400">
                          <input type="radio" name="quiz-option" value={idx} checked={quizState.answered === idx} onChange={() => setQuizState(s => ({...s, answered: idx}))} />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                    {quizState.answered !== null ? (
                      <div className={`mt-3 text-sm p-2 rounded-lg ${quizState.answered === q.correctIndex ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                        <p className="font-semibold">{quizState.answered === q.correctIndex ? 'Correct!' : 'Not quite.'}</p>
                        <p>{q.explain}</p>
                        <button onClick={() => {
                          const isCorrect = quizState.answered === q.correctIndex;
                          setQuizState(s => ({ current: (s.current + 1) % QUIZ_BANK.length, correct: isCorrect ? s.correct + 1 : s.correct, answered: null }));
                        }} className="mt-2 text-xs underline">Next question</button>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          </aside>
        </div>
      ) : null}
      {copyModalText ? <CopyModal text={copyModalText} onClose={() => { setCopyModalText(''); }} /> : null}
      <Toast text={toast} onClose={() => { setToast(''); }} />
    </div>
  );
}