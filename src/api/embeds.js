/**
 * embeds.js
 * /api/guilds/:id/embeds
 */

import { jsonResponse, errorResponse, ERR } from './helpers.js';
import { embedsDB } from '../database.js';

export function registerEmbedsRoutes(app, client) {

  app.get('/api/guilds/:id/embeds', (req, res) => {
    const guildId = req.params.id;
    const embeds = embedsDB.getAll(guildId);
    jsonResponse(res, { embeds, count: embeds.length });
  });

  app.get('/api/guilds/:id/embeds/:name', (req, res) => {
    const { id: guildId, name } = req.params;
    const embed = embedsDB.get(guildId, name);
    if (!embed) return errorResponse(res, 'Embed not found', ERR.NOT_FOUND, 404);
    jsonResponse(res, { embed });
  });

  app.post('/api/guilds/:id/embeds', (req, res) => {
    const guildId = req.params.id;
    const { name, data } = req.body;

    if (!name || !data) {
      return errorResponse(res, 'name and data required', ERR.BAD_REQUEST, 400);
    }

    const ok = embedsDB.set(guildId, name, data);
    jsonResponse(res, { success: ok });
  });

  app.delete('/api/guilds/:id/embeds/:name', (req, res) => {
    const { id: guildId, name } = req.params;
    const ok = embedsDB.remove(guildId, name);
    jsonResponse(res, { success: ok });
  });
}
