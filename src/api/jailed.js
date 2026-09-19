/**
 * jailed.js
 * /api/guilds/:id/jailed
 */

import { jsonResponse } from './helpers.js';
import { jailDB } from '../database.js';

export function registerJailedRoutes(app, client) {

  app.get('/api/guilds/:id/jailed', (req, res) => {
    const guildId = req.params.id;
    const jailed = jailDB.getAll(guildId);

    const guild = client.guilds.cache.get(guildId);

    const enriched = jailed.map((j) => {
      const member = guild?.members.cache.get(j.user_id);
      return {
        ...j,
        user_name: member ? member.user.tag : `User ${j.user_id}`,
        user_avatar: member ? member.displayAvatarURL() : null,
      };
    });

    jsonResponse(res, { jailed: enriched, count: enriched.length });
  });
}
