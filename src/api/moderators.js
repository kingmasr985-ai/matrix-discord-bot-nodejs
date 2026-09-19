/**
 * moderators.js
 * /api/guilds/:id/moderators
 */

import { jsonResponse } from './helpers.js';
import { commandPermissions } from '../database.js';

export function registerModeratorsRoutes(app, client) {

  app.get('/api/guilds/:id/moderators', (req, res) => {
    const guildId = req.params.id;
    const mods = commandPermissions.getAllModerators(guildId);
    jsonResponse(res, { moderators: mods });
  });
}
