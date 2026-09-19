/**
 * settings.js
 * /api/guilds/:id/settings
 */

import { jsonResponse } from './helpers.js';
import { settingsDB, guilds } from '../database.js';

export function registerSettingsRoutes(app, client) {

  app.get('/api/guilds/:id/settings', (req, res) => {
    const guildId = req.params.id;
    try {
      const settings = settingsDB.get(guildId);
      const lang = guilds.getLanguage(guildId);
      jsonResponse(res, {
        success: true,
        settings: {
          guild_id: guildId,
          prefix: settings.prefix || '=',
          locale: settings.locale || 'en-US',
          language: settings.language || lang || 'ar',
          timezone: settings.timezone || 'UTC',
          member_count: settings.member_count,
          icon_url: settings.icon_url || null,
        },
        language: lang,
      });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
  });

  app.post('/api/guilds/:id/settings', (req, res) => {
    const guildId = req.params.id;
    try {
      const body = req.body || {};
      const ok = settingsDB.set(guildId, body);
      jsonResponse(res, { success: !!ok, settings: settingsDB.get(guildId) });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
  });
}

export default { registerSettingsRoutes };
