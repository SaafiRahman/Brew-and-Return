import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // GitHub Pages serves the site from /Brew-and-Return/
  base: process.env.GITHUB_ACTIONS ? '/Brew-and-Return/' : '/',
  plugins: [preact()],
  // Cross-origin isolation, needed for SharedArrayBuffer (Python waits on game commands).
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
