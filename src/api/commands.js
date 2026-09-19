/**
 * commands.js
 * /api/guilds/:id/commands
 * /api/guilds/:id/commands/:name
 */

import { jsonResponse, errorResponse, ERR } from './helpers.js';
import { commandConfigs } from '../database.js';

export function registerCommandsRoutes(app, client) {

  // GET all commands (from client + configs)
  app.get('/api/guilds/:id/commands', (req, res) => {
    const guildId = req.params.id;
    const configs = commandConfigs.getAll(guildId);

    const commands = [];
    for (const [name, cmd] of client.commands) {
      const config = configs[name] || {};
      commands.push({
        name: cmd.name,
        description: config.custom_description || cmd.description || '',
        usage: config.custom_usage || cmd.usage || `=${cmd.name}`,
        category: config.custom_category || cmd.category || 'General',
        custom_name: config.custom_name || null,
        enabled: config.enabled !== false,
        aliases: cmd.aliases || [],
      });
    }

    commands.sort((a, b) => a.name.localeCompare(b.name));
    jsonResponse(res, { commands, count: commands.length });
  });

  // GET single command (excluding reserved)
  const RESERVED = new Set(['config', 'defaults', 'bulk', 'bulk-toggle']);
  app.get('/api/guilds/:id/commands/:name', (req, res, next) => {
    if (RESERVED.has(req.params.name)) return next('route');
    const { id: guildId, name } = req.params;
    const cmd = client.commands.get(name);
    if (!cmd) return errorResponse(res, 'Command not found', ERR.NOT_FOUND, 404);

    const config = commandConfigs.get(guildId, name);

    jsonResponse(res, {
      command: {
        name: cmd.name,
        description: config?.custom_description || cmd.description || '',
        usage: config?.custom_usage || cmd.usage || `=${cmd.name}`,
        category: config?.custom_category || cmd.category || 'General',
        custom_name: config?.custom_name || null,
        custom_examples: config?.custom_examples || [],
        enabled: config?.enabled !== false,
        aliases: cmd.aliases || [],
      },
    });
  });

  // PATCH update command config (excluding reserved)
  app.patch('/api/guilds/:id/commands/:name', (req, res, next) => {
    if (RESERVED.has(req.params.name)) return next('route');
    const { id: guildId, name } = req.params;
    const cmd = client.commands.get(name);
    if (!cmd) return errorResponse(res, 'Command not found', ERR.NOT_FOUND, 404);

    const ok = commandConfigs.set(guildId, name, req.body);
    jsonResponse(res, { success: ok });
  });

  // DELETE reset command config (excluding reserved)
  app.delete('/api/guilds/:id/commands/:name', (req, res, next) => {
    if (RESERVED.has(req.params.name)) return next('route');
    const { id: guildId, name } = req.params;
    const ok = commandConfigs.remove(guildId, name);
    jsonResponse(res, { success: ok });
  });
}
