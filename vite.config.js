import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    preact(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ],
  // Use BASE_PATH environment variable, defaulting to '/' (for local development)
  // GitHub Actions sets BASE_PATH to /repo-name/
  base: process.env.BASE_PATH || '/',
  server: {
    https: false,
    host: true
  }
})
