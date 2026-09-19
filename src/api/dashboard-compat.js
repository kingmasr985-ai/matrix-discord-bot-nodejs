/**
 * dashboard-compat.js
 * Endpoints إضافية للتوافق مع Dashboard
 * (يعتمد على الـ schema الفعلي في database.js)
 */

import { db, commandConfigs, logDB } from '../database.js';
import { logger } from '../utils.js';
import { LOG_TYPES } from '../constants.js';

const ok = (res, data) => res.json({ success: true, ...data });
const fail = (res, code, msg) => res.status(code).json({ success: false, error: msg });

// =========================================================
// Helpers
// =========================================================
function safeJsonParse(str, fallback = []) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function ensureColumn(table, column, type = 'TEXT') {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
    return true;
  } catch {
    return false;
  }
}

// =========================================================
// Main
// =========================================================
export function registerDashboardCompatRoutes(app, client) {

  // ═══════════════════════════════════════════
  // AUDIT LOGS
  // ═══════════════════════════════════════════
  app.get('/api/guilds/:id/audit-logs', (req, res) => {
    try {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);
      const offset = parseInt(req.query.offset) || 0;
      const type = req.query.type ? String(req.query.type) : null;
      const search = req.query.search ? String(req.query.search) : null;

      let where = 'guild_id = ?';
      const params = [id];

      if (type) {
        where += ' AND action_type = ?';
        params.push(type);
      }
      if (search) {
        where += ' AND (details LIKE ? OR actor_id LIKE ? OR target_id LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM action_logs WHERE ${where}`).get(...params);
      const total = totalRow ? totalRow.c : 0;

      const logs = db.prepare(
        `SELECT id, action_type, actor_id, target_id, details, created_at
         FROM action_logs WHERE ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).all(...params, limit, offset);

      ok(res, {
        logs: logs.map((l) => ({
          id: l.id,
          action_type: l.action_type,
          actor_id: l.actor_id,
          target_id: l.target_id === '0' || !l.target_id ? null : l.target_id,
          details: l.details,
          created_at: l.created_at,
        })),
        total, limit, offset,
      });
    } catch (err) {
      logger.error('audit-logs error:', err.message);
      fail(res, 500, 'Failed to fetch audit logs');
    }
  });

  // ═══════════════════════════════════════════
  // AUDIT STATS
  // ═══════════════════════════════════════════
  app.get('/api/guilds/:id/audit-stats', (req, res) => {
    try {
      const { id } = req.params;
      const days = Math.min(parseInt(req.query.days) || 7, 90);
      const since = Math.floor(Date.now() / 1000) - days * 86400;

      const total = db.prepare(
        'SELECT COUNT(*) AS c FROM action_logs WHERE guild_id = ? AND created_at >= ?'
      ).get(id, since).c;

      const byType = db.prepare(
        `SELECT action_type, COUNT(*) AS c FROM action_logs
         WHERE guild_id = ? AND created_at >= ?
         GROUP BY action_type ORDER BY c DESC`
      ).all(id, since);

      const topStaff = db.prepare(
        `SELECT actor_id, COUNT(*) AS c FROM action_logs
         WHERE guild_id = ? AND created_at >= ? AND actor_id != '0'
         GROUP BY actor_id ORDER BY c DESC LIMIT 10`
      ).all(id, since);

      const allTypes = db.prepare(
        'SELECT DISTINCT action_type FROM action_logs WHERE guild_id = ?'
      ).all(id);

      ok(res, {
        stats: {
          total, days,
          by_type: Object.fromEntries(byType.map((r) => [r.action_type, r.c])),
          top_staff: topStaff.map((r) => ({ actor_id: r.actor_id, count: r.c })),
        },
        action_types: [...new Set(allTypes.map((r) => r.action_type))].sort(),
      });
    } catch (err) {
      logger.error('audit-stats error:', err.message);
      fail(res, 500, 'Failed to fetch audit stats');
    }
  });

  // ═══════════════════════════════════════════
  // COMMAND CONFIG — GET  (يعتمد على commandConfigs.getAll)
  // ═══════════════════════════════════════════
  app.get('/api/guilds/:id/commands/config', (req, res) => {
    try {
      const { id } = req.params;

      // ضمان وجود الأعمدة الجديدة (إن لم تكن موجودة)
      ensureColumn('command_configs', 'allowed_channels', 'TEXT');
      ensureColumn('command_configs', 'allowed_roles', 'TEXT');

      const all = commandConfigs.getAll(id); // { name: {...} }

      const configs = {};
      for (const [name, cfg] of Object.entries(all)) {
        configs[name] = {
          enabled: cfg.enabled !== false,
          allowed_channel_ids: safeJsonParse(cfg.allowed_channels, []),
          allowed_role_ids: safeJsonParse(cfg.allowed_roles, []),
          updated_at: cfg.updated_at
            ? new Date(cfg.updated_at * 1000).toISOString()
            : new Date().toISOString(),
        };
      }

      ok(res, {
        configs,
        defaults: {
          unrestricted: true,
          default_channel_ids: [],
          default_role_ids: [],
          blocked_channel_ids: [],
        },
        count: Object.keys(configs).length,
      });
    } catch (err) {
      logger.error('commands/config GET error:', err.message);
      fail(res, 500, 'Failed to fetch command config: ' + err.message);
    }
  });

  // ═══════════════════════════════════════════
  // COMMAND CONFIG — POST /commands/:name/config
  // ═══════════════════════════════════════════
  app.post('/api/guilds/:id/commands/:name/config', (req, res) => {
    try {
      const { id, name } = req.params;
      const { enabled, allowedChannelIds, allowedRoleIds } = req.body || {};

      ensureColumn('command_configs', 'allowed_channels', 'TEXT');
      ensureColumn('command_configs', 'allowed_roles', 'TEXT');

      const existing = db.prepare(
        'SELECT command_name FROM command_configs WHERE guild_id = ? AND command_name = ?'
      ).get(id, name.toLowerCase());

      const chJson = JSON.stringify(Array.isArray(allowedChannelIds) ? allowedChannelIds : []);
      const rlJson = JSON.stringify(Array.isArray(allowedRoleIds) ? allowedRoleIds : []);

      if (existing) {
        db.prepare(
          "UPDATE command_configs SET enabled = ?, allowed_channels = ?, allowed_roles = ?, updated_at = strftime('%s','now') WHERE guild_id = ? AND command_name = ?"
        ).run(enabled !== false ? 1 : 0, chJson, rlJson, id, name.toLowerCase());
      } else {
        db.prepare(
          "INSERT INTO command_configs (guild_id, command_name, enabled, allowed_channels, allowed_roles, created_at, updated_at) VALUES (?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))"
        ).run(id, name.toLowerCase(), enabled !== false ? 1 : 0, chJson, rlJson);
      }

      ok(res, {
        command: name,
        enabled: enabled !== false,
        allowedChannelIds: JSON.parse(chJson),
        allowedRoleIds: JSON.parse(rlJson),
      });
    } catch (err) {
      logger.error('save command config error:', err.message);
      fail(res, 500, 'Failed to save command config');
    }
  });

  // ═══════════════════════════════════════════
  // COMMAND BULK
  // ═══════════════════════════════════════════
  app.post('/api/guilds/:id/commands/bulk', (req, res) => {
    try {
      const { id } = req.params;
      const { commandNames, enabled, allowedChannelIds, allowedRoleIds } = req.body || {};
      const list = Array.isArray(commandNames) ? commandNames : [];

      ensureColumn('command_configs', 'allowed_channels', 'TEXT');
      ensureColumn('command_configs', 'allowed_roles', 'TEXT');

      let updated = 0;
      for (const name of list) {
        try {
          const lower = name.toLowerCase();
          const existing = db.prepare(
            'SELECT command_name FROM command_configs WHERE guild_id = ? AND command_name = ?'
          ).get(id, lower);

          if (existing) {
            const sets = [];
            const vals = [];
            if (typeof enabled === 'boolean') { sets.push('enabled = ?'); vals.push(enabled ? 1 : 0); }
            if (Array.isArray(allowedChannelIds)) { sets.push('allowed_channels = ?'); vals.push(JSON.stringify(allowedChannelIds)); }
            if (Array.isArray(allowedRoleIds)) { sets.push('allowed_roles = ?'); vals.push(JSON.stringify(allowedRoleIds)); }
            sets.push("updated_at = strftime('%s','now')");
            vals.push(id, lower);
            db.prepare(`UPDATE command_configs SET ${sets.join(', ')} WHERE guild_id = ? AND command_name = ?`).run(...vals);
          } else {
            db.prepare(
              "INSERT INTO command_configs (guild_id, command_name, enabled, allowed_channels, allowed_roles, created_at, updated_at) VALUES (?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))"
            ).run(
              id, lower, enabled !== false ? 1 : 0,
              JSON.stringify(Array.isArray(allowedChannelIds) ? allowedChannelIds : []),
              JSON.stringify(Array.isArray(allowedRoleIds) ? allowedRoleIds : [])
            );
          }
          updated++;
        } catch (e) {
          logger.debug('bulk item failed:', e.message);
        }
      }
      ok(res, { updated, total: list.length });
    } catch (err) {
      logger.error('bulk command config error:', err.message);
      fail(res, 500, 'Failed bulk update');
    }
  });

  // ═══════════════════════════════════════════
  // COMMAND BULK TOGGLE
  // ═══════════════════════════════════════════
  app.post('/api/guilds/:id/commands/bulk-toggle', (req, res) => {
    try {
      const { id } = req.params;
      const { commands, enabled } = req.body || {};
      const list = Array.isArray(commands) ? commands : [];
      const flag = enabled ? 1 : 0;

      ensureColumn('command_configs', 'allowed_channels', 'TEXT');
      ensureColumn('command_configs', 'allowed_roles', 'TEXT');

      let updated = 0;
      for (const name of list) {
        try {
          const lower = name.toLowerCase();
          const existing = db.prepare(
            'SELECT command_name FROM command_configs WHERE guild_id = ? AND command_name = ?'
          ).get(id, lower);
          if (existing) {
            db.prepare("UPDATE command_configs SET enabled = ?, updated_at = strftime('%s','now') WHERE guild_id = ? AND command_name = ?")
              .run(flag, id, lower);
          } else {
            db.prepare(
              "INSERT INTO command_configs (guild_id, command_name, enabled, allowed_channels, allowed_roles, created_at, updated_at) VALUES (?, ?, ?, '[]', '[]', strftime('%s','now'), strftime('%s','now'))"
            ).run(id, lower, flag);
          }
          updated++;
        } catch (e) {
          logger.debug('bulk-toggle item failed:', e.message);
        }
      }
      ok(res, { updated, total: list.length });
    } catch (err) {
      logger.error('bulk-toggle error:', err.message);
      fail(res, 500, 'Failed bulk toggle');
    }
  });

  // ═══════════════════════════════════════════
  // COMMAND RESET — POST
  // ═══════════════════════════════════════════
  app.post('/api/guilds/:id/commands/:name/reset', (req, res) => {
    try {
      const { id, name } = req.params;
      const info = db.prepare(
        'DELETE FROM command_configs WHERE guild_id = ? AND command_name = ?'
      ).run(id, name.toLowerCase());
      ok(res, { message: info.changes > 0 ? 'Reset' : 'Nothing to reset', changes: info.changes });
    } catch (err) {
      logger.error('command reset error:', err.message);
      fail(res, 500, 'Failed to reset command');
    }
  });

  // ═══════════════════════════════════════════
  // COMMAND DEFAULTS — GET
  // ═══════════════════════════════════════════
  app.get('/api/guilds/:id/commands/defaults', (req, res) => {
    try {
      const { id } = req.params;
      ensureColumn('guilds', 'command_defaults', 'TEXT');

      const row = db.prepare('SELECT command_defaults FROM guilds WHERE id = ?').get(id);
      let defaults = {
        unrestricted: true,
        default_channel_ids: [],
        default_role_ids: [],
        blocked_channel_ids: [],
      };
      if (row && row.command_defaults) {
        try { defaults = { ...defaults, ...JSON.parse(row.command_defaults) }; } catch {}
      }
      ok(res, { defaults });
    } catch (err) {
      logger.error('commands/defaults GET error:', err.message);
      fail(res, 500, 'Failed to get defaults');
    }
  });

  // ═══════════════════════════════════════════
  // COMMAND DEFAULTS — POST
  // ═══════════════════════════════════════════
  app.post('/api/guilds/:id/commands/defaults', (req, res) => {
    try {
      const { id } = req.params;
      const { unrestricted, defaultChannelIds, defaultRoleIds, blockedChannelIds } = req.body || {};

      const data = {
        unrestricted: !!unrestricted,
        default_channel_ids: Array.isArray(defaultChannelIds) ? defaultChannelIds : [],
        default_role_ids: Array.isArray(defaultRoleIds) ? defaultRoleIds : [],
        blocked_channel_ids: Array.isArray(blockedChannelIds) ? blockedChannelIds : [],
      };

      const exists = db.prepare('SELECT id FROM guilds WHERE id = ?').get(id);
      if (!exists) db.prepare('INSERT INTO guilds (id) VALUES (?)').run(id);

      ensureColumn('guilds', 'command_defaults', 'TEXT');

      db.prepare("UPDATE guilds SET command_defaults = ?, updated_at = strftime('%s','now') WHERE id = ?")
        .run(JSON.stringify(data), id);

      res.json({ success: true, ...data });
    } catch (err) {
      logger.error('commands/defaults POST error:', err.message);
      fail(res, 500, 'Failed to save defaults');
    }
  });

  // ═══════════════════════════════════════════
  // EMBEDS — PUT
  // ═══════════════════════════════════════════
  app.put('/api/guilds/:id/embeds/:name', (req, res) => {
    try {
      const { id, name } = req.params;
      const data = req.body || {};
      const dataStr = JSON.stringify(data);
      const existing = db.prepare('SELECT id FROM embeds WHERE guild_id = ? AND name = ?').get(id, name);

      if (existing) {
        db.prepare("UPDATE embeds SET data = ?, updated_at = strftime('%s','now') WHERE guild_id = ? AND name = ?")
          .run(dataStr, id, name);
      } else {
        db.prepare('INSERT INTO embeds (guild_id, name, data) VALUES (?, ?, ?)').run(id, name, dataStr);
      }
      ok(res, { name });
    } catch (err) {
      logger.error('embeds PUT error:', err.message);
      fail(res, 500, 'Failed to update embed');
    }
  });

  // ═══════════════════════════════════════════
  // OWNER — restart
  // ═══════════════════════════════════════════
  app.post('/api/owner/restart', (req, res) => {
    logger.warn('Restart requested via API');
    ok(res, { message: 'Restart signal received (manual restart required)' });
  });

  // ═══════════════════════════════════════════
  // OWNER — query
  // ═══════════════════════════════════════════
  app.post('/api/owner/query', (req, res) => {
    try {
      const { query } = req.body || {};
      if (!query || typeof query !== 'string') return fail(res, 400, 'Query required');
      const trimmed = query.trim().toLowerCase();
      if (!trimmed.startsWith('select') && !trimmed.startsWith('pragma')) {
        return fail(res, 403, 'Only SELECT queries allowed');
      }
      const rows = db.prepare(query).all();
      const columns = rows.length ? Object.keys(rows[0]) : [];
      ok(res, { rows, count: rows.length, columns });
    } catch (err) {
      logger.error('owner query error:', err.message);
      fail(res, 400, err.message);
    }
  });

  logger.info('Dashboard compat routes registered (12 endpoints)');
}

export default { registerDashboardCompatRoutes };
