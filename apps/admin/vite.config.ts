import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Admin Console dev server. Port 5174 keeps it clear of the widget dev host (5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
