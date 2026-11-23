import { defineConfig } from 'vite';

// Relative base so the same build works at / (dev) and /<repo>/ (GitHub Pages).
export default defineConfig({
  base: './',
});
