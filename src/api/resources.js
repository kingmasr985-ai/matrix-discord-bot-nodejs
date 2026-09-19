/**
 * resources.js
 * /api/guilds/:id/roles
 * /api/guilds/:id/channels
 */

import { jsonResponse, errorResponse, ERR } from './helpers.js';

export function registerResourcesRoutes(app, client) {

  // Roles
  app.get('/api/guilds/:id/roles', (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return errorResponse(res, 'Guild not found', ERR.NOT_FOUND, 404);

    const roles = guild.roles.cache
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.hexColor,
        position: r.position,
        members_count: r.members.size,
        managed: r.managed,
      }));

    jsonResponse(res, { roles, count: roles.length });
  });

  // Channels
  app.get('/api/guilds/:id/channels', (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return errorResponse(res, 'Guild not found', ERR.NOT_FOUND, 404);

    const channels = guild.channels.cache
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parent_id: c.parentId,
        position: c.position,
      }));

    jsonResponse(res, { channels, count: channels.length });
  });

  // Full resources
  app.get('/api/guilds/:id/resources', (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return errorResponse(res, 'Guild not found', ERR.NOT_FOUND, 404);

    const roles = guild.roles.cache
      .filter((r) => r.name !== '@everyone')
      .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }));

    const channels = guild.channels.cache
      .map((c) => ({ id: c.id, name: c.name, type: c.type, parent_id: c.parentId }));

    jsonResponse(res, { roles, channels });
  });
}
