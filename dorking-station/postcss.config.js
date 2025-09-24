// PostCSS configuration for Tailwind v4 (ESM)
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

export default {
  plugins: [tailwindcss(), autoprefixer()],
};
