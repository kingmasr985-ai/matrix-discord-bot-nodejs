/**
 * owner.js
 * /api/owner/* (owner only)
 */

import { jsonResponse, errorResponse, ERR } from './helpers.js';
import { logger } from '../utils.js';

const OWNER_IDS = (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

function isOwner(req) {
  const userId = req.headers['x-discord-user-id'] || req.query.user_id;
  return userId && OWNER_IDS.includes(userId);
}

export function registerOwnerRoutes(app, client) {

  // GET /api/owner/status
  app.get('/api/owner/status', (req, res) => {
    if (!isOwner(req)) {
      return errorResponse(res, 'Owner only', ERR.UNAUTHORIZED, 403);
    }

    jsonResponse(res, {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
      commands: client.commands.size,
      ping: client.ws.ping,
      node_version: process.version,
    });
  });

  // POST /api/owner/presence
  app.post('/api/owner/presence', (req, res) => {
    if (!isOwner(req)) return errorResponse(res, 'Owner only', ERR.UNAUTHORIZED, 403);

    const { status, activity_type, activity_name } = req.body;

    try {
      client.user.setPresence({
        status: status || 'online',
        activities: activity_name ? [{
          name: activity_name,
          type: activity_type || 0,
        }] : [],
      });
      jsonResponse(res, { success: true });
    } catch (err) {
      errorResponse(res, err.message, ERR.INTERNAL, 500);
    }
  });

  // POST /api/owner/broadcast
  app.post('/api/owner/broadcast', async (req, res) => {
    if (!isOwner(req)) return errorResponse(res, 'Owner only', ERR.UNAUTHORIZED, 403);

    const { message, guild_ids } = req.body;
    if (!message) return errorResponse(res, 'message required', ERR.BAD_REQUEST, 400);

    const targets = guild_ids && guild_ids.length
      ? guild_ids.map((id) => client.guilds.cache.get(id)).filter(Boolean)
      : [...client.guilds.cache.values()];

    let sent = 0;
    for (const guild of targets) {
      try {
        const channel = guild.systemChannel
          || guild.channels.cache.find((c) => c.type === 0 && c.permissionsFor(guild.members.me).has('SendMessages'));
        if (channel) {
          await channel.send(message);
          sent++;
        }
      } catch (err) {
        logger.warn(`Broadcast to ${guild.id} failed: ${err.message}`);
      }
    }

    jsonResponse(res, { success: true, sent, total: targets.length });
  });

  // POST /api/owner/reload
  app.post('/api/owner/reload', async (req, res) => {
    if (!isOwner(req)) return errorResponse(res, 'Owner only', ERR.UNAUTHORIZED, 403);

    try {
      const { readdirSync } = await import('fs');
      const { join } = await import('path');
      const { pathToFileURL } = await import('url');
      const { fileURLToPath } = await import('url');

      const __dirname = fileURLToPath(new URL('..', import.meta.url));
      const commandsPath = join(__dirname, 'commands');
      const files = readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

      client.commands.clear();
      client.aliases.clear();

      for (const file of files) {
        const fileUrl = pathToFileURL(join(commandsPath, file)).href + `?t=${Date.now()}`;
        try {
          const mod = await import(fileUrl);
          const cmd = mod.default || mod;
          if (Array.isArray(cmd.commands)) {
            for (const c of cmd.commands) {
              client.commands.set(c.name, c);
              if (c.aliases) c.aliases.forEach((a) => client.aliases.set(a, c.name));
            }
          }
        } catch (err) {
          logger.error(`Reload ${file} failed: ${err.message}`);
        }
      }

      jsonResponse(res, { success: true, commands: client.commands.size });
    } catch (err) {
      errorResponse(res, err.message, ERR.INTERNAL, 500);
    }
  });

  // GET /api/owner/query — استعلام مباشر من DB (للـ debug)
  app.get('/api/owner/query', async (req, res) => {
    if (!isOwner(req)) return errorResponse(res, 'Owner only', ERR.UNAUTHORIZED, 403);

    const { sql } = req.query;
    if (!sql) return errorResponse(res, 'sql required', ERR.BAD_REQUEST, 400);

    // حماية أساسية — قراءة فقط
    const lower = sql.toLowerCase().trim();
    if (!lower.startsWith('select')) {
      return errorResponse(res, 'Only SELECT queries allowed', ERR.BAD_REQUEST, 400);
    }

    try {
      const { db } = await import('../database.js');
      const rows = db.prepare(sql).all();
      jsonResponse(res, { rows, count: rows.length });
    } catch (err) {
      errorResponse(res, err.message, ERR.INTERNAL, 500);
    }
  });
}
