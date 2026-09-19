/**
 * aliases.js
 * /api/guilds/:id/aliases
 */

import { jsonResponse, errorResponse, ERR } from './helpers.js';
import { aliasesDB } from '../database.js';

export function registerAliasesRoutes(app, client) {

  app.get('/api/guilds/:id/aliases', (req, res) => {
    const guildId = req.params.id;
    const aliases = aliasesDB.getAll(guildId);
    jsonResponse(res, { aliases, count: aliases.length });
  });

  app.post('/api/guilds/:id/aliases', (req, res) => {
    const guildId = req.params.id;
    const { alias, originalCommand } = req.body;

    if (!alias || !originalCommand) {
      return errorResponse(res, 'alias and originalCommand required', ERR.BAD_REQUEST, 400);
    }

    const ok = aliasesDB.add(guildId, alias, originalCommand, 0);
    if (!ok) {
      return errorResponse(res, 'Alias already exists', ERR.BAD_REQUEST, 400);
    }

    jsonResponse(res, { success: true, alias, original_command: originalCommand });
  });

  app.delete('/api/guilds/:id/aliases/:alias', (req, res) => {
    const { id: guildId, alias } = req.params;
    const ok = aliasesDB.remove(guildId, alias);

    if (!ok) {
      return errorResponse(res, 'Alias not found', ERR.NOT_FOUND, 404);
    }

    jsonResponse(res, { success: true, deleted: alias });
  });
}
