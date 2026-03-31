import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Railway = '/'  |  self-hosted subdirectory = '/childcare360/'
const BASE = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base: BASE,
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/auth': 'http://localhost:3003',
      '/api':  'http://localhost:3003',
      '/health': 'http://localhost:3003',
      '/uploads': 'http://localhost:3003',
    }
  },
  preview: {
    port: 3003,
    host: '0.0.0.0'
  }
})
