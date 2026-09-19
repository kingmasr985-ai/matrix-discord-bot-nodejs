/**
 * auth.js
 * ============================================
 * HMAC signature verification للـ API
 * ============================================
 */

import crypto from 'crypto';
import { logger } from './utils.js';

const BOT_API_SECRET = (process.env.BOT_API_SECRET || '').trim();
const MAX_TIMESTAMP_AGE = 60; // seconds
const MAX_NONCES_CACHE = 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ============================================
// Nonce Cache
// ============================================
class NonceCache {
  constructor(maxSize = MAX_NONCES_CACHE) {
    this.nonces = new Map();
    this.maxSize = maxSize;
  }

  isUsed(nonce) {
    this.cleanup();
    return this.nonces.has(nonce);
  }

  add(nonce) {
    this.nonces.set(nonce, Date.now());
    if (this.nonces.size > this.maxSize) {
      this.cleanup(true);
    }
  }

  cleanup(force = false) {
    const now = Date.now();
    const cutoff = now - MAX_TIMESTAMP_AGE * 1000;

    for (const [nonce, ts] of this.nonces.entries()) {
      if (ts < cutoff) {
        this.nonces.delete(nonce);
      }
    }

    if (force && this.nonces.size > this.maxSize) {
      const sorted = [...this.nonces.entries()].sort((a, b) => a[1] - b[1]);
      const toDelete = sorted.slice(0, this.nonces.size - this.maxSize);
      for (const [nonce] of toDelete) {
        this.nonces.delete(nonce);
      }
    }
  }
}

const nonceCache = new NonceCache();

// ============================================
// HMAC Signature
// ============================================
export function computeSignature(secret, timestamp, nonce, method, path, body) {
  const bodyHash = crypto
    .createHash('sha256')
    .update(body || '')
    .digest('hex');

  const message = `${timestamp}${nonce}${method.toUpperCase()}${path}${bodyHash}`;

  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
}

// ============================================
// Verify HMAC Middleware
// ============================================
export function verifyHmac(req, rawBody) {
  // Health endpoint مفتوح دايماً
  if (req.originalUrl.split('?')[0] === '/api/health') {
    return { ok: true };
  }

  // لو مفيش SECRET
  if (!BOT_API_SECRET) {
    if (IS_PROD) {
      return { ok: false, error: 'BOT_API_SECRET not configured' };
    }
    logger.warn('⚠️ BOT_API_SECRET not set — API UNPROTECTED (dev mode)');
    return { ok: true };
  }

  const signature = (req.headers['x-matrix-signature'] || '').trim();
  const timestamp = (req.headers['x-matrix-timestamp'] || '').trim();
  const nonce = (req.headers['x-matrix-nonce'] || '').trim();

  if (!signature || !timestamp || !nonce) {
    return { ok: false, error: 'Missing HMAC headers' };
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { ok: false, error: 'Invalid timestamp' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_TIMESTAMP_AGE) {
    return { ok: false, error: `Timestamp expired (${Math.abs(now - ts)}s)` };
  }

  if (nonceCache.isUsed(nonce)) {
    return { ok: false, error: 'Nonce already used' };
  }

  // ✅ استخدم originalUrl (كامل مع /api/...)
  const fullPath = req.originalUrl.split('?')[0];

  const expected = computeSignature(
    BOT_API_SECRET,
    timestamp,
    nonce,
    req.method,
    fullPath,
    rawBody
  );

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return { ok: false, error: 'Signature mismatch' };
  }

  nonceCache.add(nonce);
  return { ok: true };
}

// ============================================
// Express Middleware
// ============================================
export function hmacMiddleware(req, res, next) {
  // ✅ نستخدم originalUrl لأن app.use('/api', ...) بيشيل البادئة
  const fullPath = req.originalUrl.split('?')[0];

  // ✅ Endpoints عامة (بدون HMAC)
  const PUBLIC_ENDPOINTS = [
    '/api/health',
    '/api/bot',
    '/api/bot/guilds',
  ];

  if (PUBLIC_ENDPOINTS.includes(fullPath)) {
    return next();
  }

  // لو مفيش SECRET في dev
  if (!BOT_API_SECRET && !IS_PROD) {
    logger.warn('⚠️ API UNPROTECTED (dev mode)');
    return next();
  }

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const result = verifyHmac(req, rawBody);

  if (!result.ok) {
    logger.warn(`❌ HMAC failed: ${result.error} | ${req.method} ${req.originalUrl.split('?')[0]}`);
    return res.status(401).json({
      error: result.error,
      code: 'UNAUTHORIZED',
    });
  }

  next();
}

// ============================================
// Generate test headers (dev)
// ============================================
export function generateTestHeaders(secret, method, path, body = '') {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = computeSignature(secret, timestamp, nonce, method, path, body);

  return {
    'X-Matrix-Signature': signature,
    'X-Matrix-Timestamp': timestamp,
    'X-Matrix-Nonce': nonce,
  };
}

// ============================================
// Load secret from .env
// ============================================
export function loadSecret() {
  return BOT_API_SECRET;
}

export function isConfigured() {
  return !!BOT_API_SECRET;
}
