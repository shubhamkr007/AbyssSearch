/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // CDN bundle: inline NODE_ENV so React doesn't reference `process` in browsers.
  define:
    command === 'build'
      ? { 'process.env.NODE_ENV': JSON.stringify('production') }
      : { 'process.env.NODE_ENV': JSON.stringify('development') },
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
}));
