/**
 * Service worker: игра должна открываться без сети.
 *
 * Имена собранных файлов содержат хеш, поэтому список для предзагрузки
 * фиксировать бессмысленно — вместо этого всё, что запрошено хоть раз,
 * оседает в кеше и потом отдаётся мгновенно, а свежая версия подтягивается
 * в фоне (stale-while-revalidate). Игра статическая и весит десятки
 * килобайт, так что этой стратегии более чем достаточно.
 */

// Версия приезжает в адресе воркера (см. регистрацию в src/main.ts). Каждая
// сборка получает свой кеш, а старые удаляются в activate — иначе обновление
// беты не доезжало бы до тех, кто уже открывал игру.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `gribochi-${VERSION}`

/** Оболочка, без которой не открыться вовсе. */
const SHELL = ['./', './index.html', './manifest.webmanifest', './fonts/fonts.css']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Отдельные промахи не должны срывать установку целиком.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Переход по адресу: сначала сеть, иначе отдаём сохранённую страницу.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => hit)
      return hit || fresh
    }),
  )
})
