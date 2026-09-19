/**
 * logs.js
 * /api/guilds/:id/logs
 * /api/guilds/:id/log-channels
 */

import { jsonResponse } from './helpers.js';
import { logDB } from '../database.js';

export function registerLogsRoutes(app, client) {

  app.get('/api/guilds/:id/logs', (req, res) => {
    const guildId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const rows = logDB.getRecent(guildId, limit, offset);
    jsonResponse(res, { logs: rows, count: rows.length });
  });

  app.get('/api/guilds/:id/log-channels', (req, res) => {
    const guildId = req.params.id;
    const channels = logDB.getAllChannels(guildId);
    jsonResponse(res, { channels });
  });
}
