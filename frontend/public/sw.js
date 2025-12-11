// 更新版本号，强制清除旧缓存
const CACHE_NAME = 'echo-v2';
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
    event.respondWith(fetch(event.request));
    return;
  }

  // 跳过 API 请求（不应该被缓存）
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 对于 assets 文件（JS、CSS等），使用网络优先策略，不缓存
  // 这样可以确保总是加载最新版本
  if (event.request.url.includes('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // 如果网络请求成功，直接返回，不缓存
          if (response && response.status === 200) {
            return response;
          }
          // 如果网络请求失败，尝试从缓存获取（作为降级方案）
          return caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || response;
          });
        })
        .catch(() => {
          // 网络请求失败，尝试从缓存获取
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // 如果缓存也没有，返回错误
            return new Response('资源加载失败', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
        })
    );
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






