import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:9000',
    },
  },
  preview: {
    port: 5178,
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:9000',
    },
  },
})
