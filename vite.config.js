import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

const normalizeBasePath = (value) => {
  const text = String(value || '/').trim();
  const withLeadingSlash = text.startsWith('/') ? text : `/${text}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

const base = normalizeBasePath(process.env.BASE_PATH || '/');

export default defineConfig({
  plugins: [
    preact(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ],
  // Use BASE_PATH environment variable, defaulting to '/' (for local development)
  // GitHub Actions sets BASE_PATH to /repo-name/
  base,
  server: {
    https: false,
    host: true
  }
})
