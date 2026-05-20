/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react'


// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  },
  server: {
    host: '0.0.0.0', // Force bind to all network interfaces
    allowedHosts: ['cusbert', 'cusbert.tail61df34.ts.net'],
    port: 5173,
    strictPort: true,
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        secure: false,
      },
      '/api/ollama': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Ollama rejects cross-origin requests. Spoof the origin as localhost.
            proxyReq.setHeader('Origin', 'http://localhost:11434');
          });
        },
      },
      '/api/storage': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/read-file': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/list-folder': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/log': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/segments': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/retrieval_feedback': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/api/upload': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      }
    }
  }
})
