/**
 * stats.js
 * GET /api/guilds/:id/stats
 * GET /api/guilds/:id/overview-stats
 * GET /api/bot (public)
 * GET /api/health (public)
 */

import { jsonResponse } from './helpers.js';
import {
  panelDB,
  tempPunishments,
  jailDB,
  afkDB,
  customCmdsDB,
  aliasesDB,
} from '../database.js';

export function registerStatsRoutes(app, client) {

  // GET /api/health
  app.get('/api/health', (req, res) => {
    jsonResponse(res, {
      status: 'ok',
      bot: client.user?.tag || 'offline',
      uptime: process.uptime(),
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/bot
  app.get('/api/bot', (req, res) => {
    if (!client.user) {
      return jsonResponse(res, { error: 'Bot not ready' }, 503);
    }

    jsonResponse(res, {
      id: client.user.id,
      username: client.user.username,
      discriminator: client.user.discriminator,
      avatar: client.user.displayAvatarURL({ size: 256 }),
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
      uptime: client.uptime,
      ping: client.ws.ping,
    });
  });

  // GET /api/guilds/:id/stats
  app.get('/api/guilds/:id/stats', (req, res) => {
    const guildId = req.params.id;
    const guild = client.guilds.cache.get(guildId);

    const stats = {
      warnings: panelDB.getStats(guildId).warnings,
      jailed: jailDB.count(guildId),
      temp_punishments: tempPunishments.count(guildId),
      afk: Object.keys(afkDB.getAll(guildId)).length,
      custom_commands: customCmdsDB.count(guildId),
      aliases: aliasesDB.count(guildId),
      member_count: guild?.memberCount || 0,
    };

    jsonResponse(res, {
      guild_id: guildId,
      guild: guild ? {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ size: 256 }),
        owner_id: guild.ownerId,
        member_count: guild.memberCount,
      } : null,
      stats,
    });
  });

  // GET /api/guilds/:id/overview-stats
  app.get('/api/guilds/:id/overview-stats', (req, res) => {
    const guildId = req.params.id;
    const guild = client.guilds.cache.get(guildId);

    const stats = panelDB.getStats(guildId);
    const daily = panelDB.getDailyStats(guildId, 7);

    jsonResponse(res, {
      success: true,
      stats: {
        ...stats,
        member_count: guild?.memberCount || 0,
      },
      dailyHistory: daily,
    });
  });
}
