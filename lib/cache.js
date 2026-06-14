const cacheStore = new Map();

function now() {
  return Date.now();
}

export function getCache(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= now()) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value;
}

export function setCache(key, value, ttlSeconds) {
  if (!ttlSeconds || ttlSeconds <= 0) return;

  cacheStore.set(key, {
    value,
    expiresAt: now() + ttlSeconds * 1000
  });
}

export function clearCache(prefix) {
  if (!prefix) {
    cacheStore.clear();
    return;
  }

  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

