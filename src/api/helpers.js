/**
 * helpers.js
 * JSON response helpers
 */

export function jsonResponse(res, data, status = 200) {
  return res.status(status).json(data);
}

export function errorResponse(res, message, code = 'BAD_REQUEST', status = 400) {
  return res.status(status).json({ error: message, code });
}

export function successResponse(res, data = {}) {
  return res.status(200).json({ success: true, ...data });
}

export const ERR = {
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL: 'INTERNAL_ERROR',
};

// آمن: لو guildId مش رقم
export function parseIntParam(value, fallback = null) {
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}
