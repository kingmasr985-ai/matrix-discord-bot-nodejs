/**
 * middleware.js
 * Error handling + async wrapper
 */

import { logger } from '../utils.js';
import { errorResponse, ERR } from './helpers.js';

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error(`API Error [${req.method} ${req.path}]:`, err.message);
      errorResponse(res, 'Internal server error', ERR.INTERNAL, 500);
    });
  };
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found', path: req.path });
}
