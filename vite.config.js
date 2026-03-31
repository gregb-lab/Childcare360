import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    chunkSizeWarningLimit: 800,
    sourcemap: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3003',
      '/auth': 'http://localhost:3003',
    },
  },
});
