/**
 * afk.js
 * /api/guilds/:id/afk
 */

import { jsonResponse } from './helpers.js';
import { afkDB } from '../database.js';

export function registerAfkRoutes(app, client) {

  app.get('/api/guilds/:id/afk', (req, res) => {
    const guildId = req.params.id;
    const afkList = afkDB.getAll(guildId);

    const guild = client.guilds.cache.get(guildId);
    const enriched = Object.entries(afkList).map(([userId, data]) => {
      const member = guild?.members.cache.get(userId);
      return {
        user_id: userId,
        user_name: member ? member.user.tag : `User ${userId}`,
        user_avatar: member ? member.displayAvatarURL() : null,
        reason: data.reason,
        since: data.since,
      };
    });

    jsonResponse(res, { afk: enriched, count: enriched.length });
  });
}
