// 更新版本号，强制清除旧缓存
const CACHE_NAME = 'echo-v3';
const urlsToCache = [
  '/',
  '/index.html'
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache addAll failed:', error);
      })
  );
  // 强制激活新的 Service Worker
  self.skipWaiting();
});

// 拦截请求，使用缓存
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求（POST, PUT, DELETE 等不应该被缓存）
  if (event.request.method !== 'GET') {
    // 对于非 GET 请求，直接通过网络获取，不进行缓存
    event.respondWith(fetch(event.request).catch(() => {
      // 如果网络请求失败，返回错误，让浏览器处理
      return new Response('Network error', { status: 503 });
    }));
    return;
  }

  // 跳过 API 请求（不应该被缓存）
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request).catch(() => {
      // 如果网络请求失败，返回错误，让浏览器处理
      return new Response('Network error', { status: 503 });
    }));
    return;
  }

  // 对于 assets 文件（JS、CSS等），直接通过网络获取，不拦截
  // 这样可以避免 ServiceWorker 导致的加载问题
  if (event.request.url.includes('/assets/')) {
    // 不拦截 assets 请求，让浏览器直接处理
    return;
  }

  // 对于其他静态资源（HTML、图片等），使用缓存优先策略
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果缓存中有，返回缓存
        if (response) {
          return response;
        }
        // 否则从网络获取
        return fetch(event.request).then((response) => {
          // 检查响应是否有效
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          // 只缓存非 assets 的静态资源
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
      .catch(() => {
        // 如果网络请求失败，可以返回一个离线页面
        return new Response('离线模式', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      })
  );
});

// 激活 Service Worker，清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 立即控制所有客户端
      return self.clients.claim();
    })
  );
});






