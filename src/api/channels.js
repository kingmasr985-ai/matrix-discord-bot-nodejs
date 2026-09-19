/**
 * channels.js
 * /api/guilds/:id/command-channels
 */

import { jsonResponse } from './helpers.js';
import { channelsDB } from '../database.js';

export function registerChannelsRoutes(app, client) {

  app.get('/api/guilds/:id/command-channels', (req, res) => {
    const guildId = req.params.id;
    const channels = channelsDB.getAll(guildId);
    jsonResponse(res, { channels });
  });
}
