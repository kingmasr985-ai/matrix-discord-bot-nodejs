/**
 * configs.js
 * /api/guilds/:id/welcome
 * /api/guilds/:id/auto-responder
 * /api/guilds/:id/logging
 */

import { jsonResponse, errorResponse, ERR } from './helpers.js';
import {
  welcomeDB,
  autoResponderDB,
  logDB,
  guilds,
} from '../database.js';
import { LOG_TYPES } from '../constants.js';

export function registerConfigsRoutes(app, client) {

  // ============ WELCOME ============
  app.get('/api/guilds/:id/welcome', (req, res) => {
    const guildId = req.params.id;
    try {
      const config = welcomeDB.get(guildId);
      jsonResponse(res, { success: true, config: config || {} });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
  });

  app.post('/api/guilds/:id/welcome', (req, res) => {
    const guildId = req.params.id;
    try {
      const ok = welcomeDB.set(guildId, req.body || {});
      jsonResponse(res, { success: !!ok, config: welcomeDB.get(guildId) });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
  });

  // ============ AUTO RESPONDER ============
  app.get('/api/guilds/:id/auto-responder', (req, res) => {
    const guildId = req.params.id;
    try {
      let config = null;
      try {
        config = autoResponderDB.get(guildId);
      } catch {}

      const normalized = {
        enabled: config?.enabled !== false,
        response: config?.response || '',
        scope: config?.scope || 'all',
        channel_ids: Array.isArray(config?.channel_ids) ? config.channel_ids : [],
        cooldown_seconds: config?.cooldown_seconds || 0,
        ignore_bots: config?.ignore_bots !== false,
        ignore_commands: config?.ignore_commands !== false,
        updated_at: config?.updated_at || null,
      };

      jsonResponse(res, { success: true, config: normalized });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
  });

  app.post('/api/guilds/:id/auto-responder', (req, res) => {
    const guildId = req.params.id;
    try {
      const body = req.body || {};

      const data = {
        enabled: body.enabled !== false,
        response: body.response || '',
        scope: body.scope || 'all',
        channel_ids: Array.isArray(body.channel_ids) ? body.channel_ids : [],
        cooldown_seconds: parseInt(body.cooldown_seconds) || 0,
        ignore_bots: body.ignore_bots !== false,
        ignore_commands: body.ignore_commands !== false,
      };

      const ok = autoResponderDB.set(guildId, data);

      jsonResponse(res, {
        success: !!ok,
        config: { ...data, updated_at: new Date().toISOString() },
      });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
  });

  // ============ LOGGING ============
  app.get('/api/guilds/:id/logging', (req, res) => {
    const guildId = req.params.id;
    try {
      // ما المفعّل حالياً؟
      const stored = logDB.getAll(guildId); // { eventType: { enabled, channel_id } }

      // نبني config كامل بكل الأنواع (حتى غير المفعّلة)
      const config = {};
      for (const [eventType, label] of Object.entries(LOG_TYPES)) {
        const cfg = stored[eventType];
        config[eventType] = {
          enabled: cfg ? !!cfg.enabled : false,
          channel_id: cfg?.channel_id ? Number(cfg.channel_id) || cfg.channel_id : null,
          label,                     // ← يساعد الداشبورد يعرض الاسم
          updated_at: cfg?.updated_at || null,
        };
      }

      const log_types = Object.keys(LOG_TYPES);

      jsonResponse(res, { success: true, config, log_types });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
  });

  app.post('/api/guilds/:id/logging', (req, res) => {
    const guildId = req.params.id;
    try {
      const body = req.body || {};
      const configObj = body.config || body;

      if (typeof configObj !== 'object' || configObj === null) {
        return errorResponse(res, 'config required', ERR.BAD_REQUEST, 400);
      }

      for (const [eventType, cfg] of Object.entries(configObj)) {
        if (!cfg || typeof cfg !== 'object') continue;
        if (!LOG_TYPES[eventType]) continue; // تجاهل أي نوع مش معروف
        const enabled = cfg.enabled !== false;
        const channelId = cfg.channel_id || null;
        logDB.set(guildId, eventType, channelId, enabled);
      }

      // نرجّع نفس الشكل
      const stored = logDB.getAll(guildId);
      const config = {};
      for (const [eventType, label] of Object.entries(LOG_TYPES)) {
        const cfg = stored[eventType];
        config[eventType] = {
          enabled: cfg ? !!cfg.enabled : false,
          channel_id: cfg?.channel_id ? Number(cfg.channel_id) || cfg.channel_id : null,
          label,
          updated_at: cfg?.updated_at || null,
        };
      }

      jsonResponse(res, { success: true, config, log_types: Object.keys(LOG_TYPES) });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
  });

  // ============ LANGUAGE ============
  app.get('/api/guilds/:id/language', (req, res) => {
    const guildId = req.params.id;
    const lang = guilds.getLanguage(guildId);
    jsonResponse(res, { success: true, language: lang });
  });

  app.post('/api/guilds/:id/language', (req, res) => {
    const guildId = req.params.id;
    const { language } = req.body || {};
    if (!['ar', 'en'].includes(language)) {
      return errorResponse(res, 'language must be ar or en', ERR.BAD_REQUEST, 400);
    }
    const ok = guilds.setLanguage(guildId, language);
    jsonResponse(res, { success: !!ok });
  });
}

export default { registerConfigsRoutes };
