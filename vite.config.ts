import { defineConfig } from 'vite'

import pkg from './package.json'

export default defineConfig({
  base: './',
  define: {
    // Версия нужна в двух местах: в сводке по СОС, чтобы тестер мог назвать её
    // в отчёте, и в имени кеша service worker, чтобы бета не застревала на
    // старой сборке.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
})
