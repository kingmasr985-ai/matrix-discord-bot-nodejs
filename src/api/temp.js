/**
 * temp.js
 * /api/guilds/:id/temp-punishments
 */

import { jsonResponse } from './helpers.js';
import { tempPunishments } from '../database.js';

export function registerTempRoutes(app, client) {

  app.get('/api/guilds/:id/temp-punishments', (req, res) => {
    const guildId = req.params.id;
    const punishments = tempPunishments.getAll(guildId);

    const now = Math.floor(Date.now() / 1000);
    const enriched = punishments.map((p) => ({
      ...p,
      remaining_seconds: Math.max(0, p.expires_at - now),
    }));

    jsonResponse(res, { punishments: enriched, count: enriched.length });
  });
}
