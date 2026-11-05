import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  // GitHub Pages serves the site from /Brew-and-Return/
  base: process.env.GITHUB_ACTIONS ? '/Brew-and-Return/' : '/',
  plugins: [preact()],
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
