/**
 * custom.js
 * /api/guilds/:id/custom-commands
 */

import { jsonResponse } from './helpers.js';
import { customCmdsDB } from '../database.js';

export function registerCustomRoutes(app, client) {

  app.get('/api/guilds/:id/custom-commands', (req, res) => {
    const guildId = req.params.id;
    const commands = customCmdsDB.getAll(guildId);
    jsonResponse(res, { commands, count: commands.length });
  });

  app.get('/api/guilds/:id/custom-commands/count', (req, res) => {
    const guildId = req.params.id;
    const count = customCmdsDB.count(guildId);
    jsonResponse(res, { count });
  });
}
