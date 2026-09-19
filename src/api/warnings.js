/**
 * warnings.js
 * /api/guilds/:id/warnings
 */

import { jsonResponse, errorResponse, ERR } from './helpers.js';
import { warnings as warnDB, db } from '../database.js';

export function registerWarningsRoutes(app, client) {

  // GET warnings (all or by user)
  app.get('/api/guilds/:id/warnings', (req, res) => {
    const guildId = req.params.id;
    const userId = req.query.user_id;

    if (userId) {
      const warns = warnDB.get(guildId, userId);
      return jsonResponse(res, { warnings: warns, count: warns.length });
    }

    const rows = db.prepare(`
      SELECT id, user_id, moderator_id, reason, created_at
      FROM warnings
      WHERE guild_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(guildId);

    jsonResponse(res, { warnings: rows, count: rows.length });
  });

  // GET count
  app.get('/api/guilds/:id/warnings/count', (req, res) => {
    const guildId = req.params.id;
    const userId = req.query.user_id;

    let count;
    if (userId) {
      count = warnDB.count(guildId, userId);
    } else {
      count = db.prepare(
        'SELECT COUNT(*) as c FROM warnings WHERE guild_id = ?'
      ).get(guildId).c;
    }

    jsonResponse(res, { count });
  });

  // DELETE warning
  app.delete('/api/guilds/:id/warnings/:warningId', (req, res) => {
    const { id: guildId, warningId } = req.params;

    const result = db.prepare(
      'DELETE FROM warnings WHERE id = ? AND guild_id = ?'
    ).run(warningId, guildId);

    if (result.changes === 0) {
      return errorResponse(res, 'Warning not found', ERR.NOT_FOUND, 404);
    }

    jsonResponse(res, { success: true, deleted: warningId });
  });
}
