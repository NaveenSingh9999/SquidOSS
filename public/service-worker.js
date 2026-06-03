

const CACHE_NAME = 'squidcloud-v11.0.44-1780418345967'; // Dynamic cache name
const API_CACHE = 'api-cache-v2';
const STATIC_CACHE = 'static-cache-v3';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
];

function notifyAssetRecoveryRequired(assetPath) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'ASSET_RECOVERY_REQUIRED',
        assetPath
      });
    });
  }).catch((error) => {
    console.warn('Failed to notify clients for asset recovery:', error);
  });
}

// Install event - cache assets
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('Opened cache');
          // Use absolute URLs to avoid path resolution issues
          const absoluteUrls = urlsToCache.map(url => {
            return new URL(url, self.location.origin).href;
          });
          return cache.addAll(absoluteUrls);
        }),
      caches.open(STATIC_CACHE),
      caches.open(API_CACHE)
    ])
    .catch(error => {
      console.error('Cache installation failed:', error);
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches and ensure update
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  const cacheWhitelist = [CACHE_NAME, STATIC_CACHE, API_CACHE];
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Force refresh all clients to ensure they get the new version
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'FORCE_UPDATE',
            message: 'New version available, refreshing...'
          });
        });
      })
    ]).then(() => {
      // Claim control of all clients
      return self.clients.claim();
    })
  );
});

// Handle explicit skip waiting requests from clients
self.addEventListener('message', event => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event - handle requests with aggressive cache busting
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // Handle different types of requests with appropriate caching strategies
  
  // 1. API requests - Always fetch fresh, short cache
  if (url.pathname.includes('/api/') || 
      url.pathname.includes('/auth/') ||
      url.pathname.includes('/functions/')) {
    event.respondWith(
      caches.open(API_CACHE).then(cache => {
        return fetch(event.request).then(response => {
          // Only cache successful responses briefly (5 minutes)
          if (response.status === 200) {
            const responseClone = response.clone();
            const modifiedRequest = new Request(event.request.url + '?t=' + Date.now());
            cache.put(modifiedRequest, responseClone).then(() => {
              // Clean up old API cache entries
              setTimeout(() => {
                cache.keys().then(keys => {
                  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                  keys.forEach(key => {
                    const timestamp = new URL(key.url).searchParams.get('t');
                    if (timestamp && parseInt(timestamp) < fiveMinutesAgo) {
                      cache.delete(key);
                    }
                  });
                });
              }, 1000);
            });
          }
          return response;
        }).catch(() => {
          // Fallback to cache for API requests
          return cache.match(event.request);
        });
      })
    );
    return;
  }
  
  // 2. Static assets (JS/CSS) - Cache first for immutable Vite assets
  if (url.pathname.match(/\.(js|css|map)$/)) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then(cache => {
              cache.put(event.request, responseClone);
            }).catch(err => {
              console.warn('Cache put failed:', err);
            });
          }
          return response;
        });
      }).catch(() => {
        // Outer catch: handle SW cache API failure gracefully
        // Fall through to network fetch directly
        return fetch(event.request.url, { cache: 'no-store' });
      })
    );
    return;
  }
  
  // 3. Version check requests - Always fetch fresh
  if (url.pathname.includes('version.json')) {
    event.respondWith(
      fetch(event.request.url + '?t=' + Date.now(), {
        cache: 'no-cache'
      })
    );
    return;
  }
  
  // 4. Navigation requests and main documents - Network first with fallback
  if (event.request.mode === 'navigate' || 
      event.request.destination === 'document' ||
      urlsToCache.some(cachedUrl => url.pathname === cachedUrl || url.pathname.endsWith(cachedUrl))) {
    
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          // Clone response BEFORE using it
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          }).catch(err => {
            console.warn('Cache put failed:', err);
          });
        }
        return response;
      }).catch(() => {
        // Fallback to cache
        return caches.match(event.request).then(cachedResponse => {
          return cachedResponse || caches.match('/index.html');
        });
      })
    );
  }
});

// Background sync for uploads
self.addEventListener('sync', event => {
  if (event.tag === 'upload-queue') {
    event.waitUntil(uploadPendingFiles());
  }
});

// Push notification support
self.addEventListener('push', event => {
  if (!event.data) return;
  
  try {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: data.url
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (error) {
    console.error('Push notification error:', error);
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});

// Helper function to upload queued files
async function uploadPendingFiles() {
  console.log('Processing background uploads');
  // This would be implemented with IndexedDB for real functionality
}

// Error handling
self.addEventListener('error', event => {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('Service Worker unhandled rejection:', event.reason);
});
