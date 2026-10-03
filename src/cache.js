// Cache Redis opsional; PostgreSQL tetap menjadi sumber data utama.
import { createClient } from 'redis';

const enabled = String(process.env.REDIS_ENABLED || '').toLowerCase() === 'true' && Boolean(process.env.REDIS_URL);
const prefix = process.env.REDIS_KEY_PREFIX || 'merit:';
const defaultTtl = Math.max(Number(process.env.REDIS_DEFAULT_TTL_SECONDS || 60), 1);
let client;
let connectPromise;
const metrics = {
  hits: 0,
  misses: 0,
  writes: 0,
  invalidations: 0,
  errors: 0,
  locksAcquired: 0,
  locksBusy: 0,
};

function redisKey(key) { return `${prefix}${key}`; }

async function getClient() {
  if (!enabled) return null;
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', error => console.error('Redis error:', error.message));
  }
  if (!client.isOpen) {
    connectPromise ||= client.connect().catch(error => {
      connectPromise = null;
      throw error;
    });
    await connectPromise;
  }
  return client;
}

// Dipakai middleware yang membutuhkan store Redis langsung, misalnya rate limit.
// Mengembalikan null saat Redis dinonaktifkan agar pemanggil dapat memakai fallback.
export async function getRedisClient() {
  try {
    return await getClient();
  } catch (error) {
    console.error('Redis client fallback:', error.message);
    return null;
  }
}

export async function getJson(key) {
  try {
    const redis = await getClient();
    if (!redis) {
      metrics.misses += 1;
      return null;
    }
    const value = await redis.get(redisKey(key));
    if (!value) {
      metrics.misses += 1;
      return null;
    }
    metrics.hits += 1;
    return JSON.parse(value);
  } catch (error) {
    metrics.errors += 1;
    console.error('Redis get fallback:', error.message);
    return null;
  }
}

export async function setJson(key, value, ttl = defaultTtl) {
  try {
    const redis = await getClient();
    if (!redis) return false;
    await redis.set(redisKey(key), JSON.stringify(value), { EX: Math.max(Number(ttl) || defaultTtl, 1) });
    metrics.writes += 1;
    return true;
  } catch (error) {
    metrics.errors += 1;
    console.error('Redis set skipped:', error.message);
    return false;
  }
}

export async function getOrSetJson(key, loader, ttl = defaultTtl) {
  const cached = await getJson(key);
  if (cached !== null) return cached;
  const value = await loader();
  await setJson(key, value, ttl);
  return value;
}

export async function invalidateKeys(keys = []) {
  try {
    const redis = await getClient();
    if (!redis || !keys.length) return false;
    await redis.del(keys.map(redisKey));
    metrics.invalidations += keys.length;
    return true;
  } catch (error) {
    metrics.errors += 1;
    console.error('Redis invalidation skipped:', error.message);
    return false;
  }
}

// Lock singkat untuk serialisasi update personel antar instance backend.
export async function withRedisLock(key, work, ttlMs = 15000) {
  const redis = await getClient();
  if (!redis) return work();
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const lockKey = redisKey(`lock:${key}`);
  const acquired = await redis.set(lockKey, token, { NX: true, PX: ttlMs });
  if (!acquired) {
    metrics.locksBusy += 1;
    const error = new Error('Resource sedang diproses oleh request lain.');
    error.code = 'REDIS_LOCK_BUSY';
    throw error;
  }
  metrics.locksAcquired += 1;
  try {
    return await work();
  } finally {
    // Hanya pemilik token yang boleh melepas lock.
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", { keys: [lockKey], arguments: [token] }).catch(() => {});
  }
}

export function redisStatus() {
  return { enabled, connected: Boolean(client?.isReady), keyPrefix: prefix, metrics: { ...metrics } };
}
