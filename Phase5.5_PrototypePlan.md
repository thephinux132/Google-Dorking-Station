# Phase 5.5 Prototype Plan

This document outlines two optional stretch goals for the Google Dorking
Station after Phase 5.

------------------------------------------------------------------------

## 1. Nested / Group Mode Builder

**Goal:** Allow users to create more complex queries with nested logical
groups (AND/OR) instead of a flat linear chip list.

### Prototype Approach

-   **Node Schema:**

    ``` ts
    interface Node {
      id: string;
      type: 'GROUP' | 'CHIP';
      op?: 'AND' | 'OR';   // for groups
      children?: Node[];   // nested structure
      chipType?: ChipType; // if CHIP
      value?: string;
    }
    ```

-   **UI:**

    -   Two modes: **Simple mode** (current linear chips) and **Group
        mode** (nested tree).\
    -   Drag-and-drop chips into groups.\
    -   Groups can be toggled between AND/OR.\
    -   Collapsible tree view for clarity.

-   **Rendering:**\
    Recursively render each group:

    -   `AND` group → space-separated terms.\
    -   `OR` group → wrap in `( … OR … )`.\
    -   Chips render like now.

-   **Benefit:**\
    Power users can express queries like:

        ("Jane Doe" OR "J. Doe") AND (site:.gov OR site:.edu) AND filetype:pdf

------------------------------------------------------------------------

## 2. Sharing / Export-Import for Collections

**Goal:** Let users easily share curated sets of queries with teammates
or students.

### Prototype Approach

-   **Export:**
    -   Each collection exported as JSON file.\
    -   Filename suggestion: `collection_<name>.json`.
-   **Import:**
    -   Upload JSON → validate structure → merge into local
        collections.\
    -   Warn on duplicate names.
-   **UI Updates:**
    -   Add **Export** button next to each collection.\
    -   Add **Import Collection** button in Collections tab.

------------------------------------------------------------------------

## 3. Mock Sandbox in Learning Mode

**Goal:** Provide a safe environment to preview results without hitting
Google or other engines.

### Prototype Approach

-   **Sandbox View:**
    -   Replace live search with simulated results.\
    -   Render dummy result cards showing how operators filter results.\
    -   Example: query `site:.gov filetype:pdf` → mock results show
        `.gov` domains with `.pdf` file endings.
-   **Benefits:**
    -   Keeps tool 100% client-only.\
    -   Good for training sessions and classrooms.\
    -   No risk of ToS violation.

------------------------------------------------------------------------

## Next Steps

1.  Implement toggle between **Simple** and **Group mode** in the
    Builder.\
2.  Add JSON export/import for **Collections**.\
3.  Extend Learning Mode with a **Sandbox tab** that previews simulated
    results.
