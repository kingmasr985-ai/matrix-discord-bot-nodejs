/**
 * guilds.js
 * GET /api/bot/guilds
 * GET /api/guilds
 */

import { jsonResponse } from './helpers.js';

export function registerGuildsRoutes(app, client) {

  // GET /api/bot/guilds
  app.get('/api/bot/guilds', (req, res) => {
    const guilds = client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ size: 128 }),
      member_count: g.memberCount || 0,
      owner_id: g.ownerId,
    }));

    jsonResponse(res, { guilds, count: guilds.length });
  });

  // GET /api/guilds (alias)
  app.get('/api/guilds', (req, res) => {
    const guilds = client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ size: 128 }),
      memberCount: g.memberCount || 0,
      ownerId: g.ownerId,
    }));

    jsonResponse(res, guilds);
  });

  // GET /api/guilds/:id
  app.get('/api/guilds/:id', (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return jsonResponse(res, { error: 'Guild not found' }, 404);

    jsonResponse(res, {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ size: 256 }),
      memberCount: guild.memberCount,
      ownerId: guild.ownerId,
      channels: guild.channels.cache.size,
      roles: guild.roles.cache.size,
      createdAt: guild.createdAt,
    });
  });

  // GET /api/guilds/:id/info
  app.get('/api/guilds/:id/info', (req, res) => {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return jsonResponse(res, { error: 'Guild not found' }, 404);

    jsonResponse(res, {
      success: true,
      info: {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ size: 256 }),
        member_count: guild.memberCount || 0,
        owner_id: guild.ownerId,
        description: guild.description,
        created_at: guild.createdAt?.toISOString(),
      },
    });
  });
}
