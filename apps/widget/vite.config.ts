/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    // Single self-contained ESM bundle for CDN embedding; React is bundled in.
    lib: {
      entry: 'src/element.tsx',
      name: 'EnterpriseSearch',
      formats: ['es'],
      fileName: () => 'enterprise-search.js',
    },
    target: 'es2020',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: true,
  },
});
