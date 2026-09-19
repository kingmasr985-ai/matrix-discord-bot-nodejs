/**
 * database.js
 * ============================================
 * SQLite Database — Node.js
 * ============================================
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import config from './config.js';
import { logger } from './utils.js';

// ============================================
// إنشاء فولدر الـ DB
// ============================================
const dbDir = dirname(config.database.path);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

// ============================================
// فتح الاتصال
// ============================================
const db = new Database(config.database.path);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ============================================
// Schema
// ============================================
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      prefix TEXT DEFAULT '=',
      language TEXT DEFAULT 'ar',
      locale TEXT DEFAULT 'en-US',
      welcome_channel TEXT,
      welcome_message TEXT,
      goodbye_channel TEXT,
      goodbye_message TEXT,
      log_channel TEXT,
      mute_role TEXT,
      jail_role TEXT,
      jail_channel TEXT,
      auto_role TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_warnings_guild_user ON warnings(guild_id, user_id);

    CREATE TABLE IF NOT EXISTS temp_punishments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      target_id TEXT,
      punishment_type TEXT NOT NULL,
      reason TEXT,
      expires_at INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_temp_guild_user ON temp_punishments(guild_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_temp_expires ON temp_punishments(expires_at, active);

    CREATE TABLE IF NOT EXISTS jailed_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      jailed_by TEXT NOT NULL,
      role_ids TEXT DEFAULT '[]',
      reason TEXT,
      jailed_at INTEGER DEFAULT (strftime('%s', 'now')),
      release_at INTEGER,
      UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS afk_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT DEFAULT 'AFK',
      set_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS custom_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      response TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      command TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, alias)
    );

    CREATE TABLE IF NOT EXISTS auto_responder (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      response TEXT NOT NULL,
      match_type TEXT DEFAULT 'exact',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ar_guild ON auto_responder(guild_id);

    CREATE TABLE IF NOT EXISTS log_settings (
      guild_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      channel_id TEXT,
      PRIMARY KEY (guild_id, event_type)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS command_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      command TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, command, role_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cmd_perm_guild ON command_permissions(guild_id, command);

    CREATE TABLE IF NOT EXISTS command_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, channel_id, channel_type)
    );
    CREATE INDEX IF NOT EXISTS idx_cmd_ch_guild ON command_channels(guild_id, channel_type);

    CREATE TABLE IF NOT EXISTS command_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      original_command TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, alias)
    );
    CREATE INDEX IF NOT EXISTS idx_cmd_alias_guild ON command_aliases(guild_id, alias);

    CREATE TABLE IF NOT EXISTS welcome_config (
      guild_id TEXT PRIMARY KEY,
      welcome_enabled INTEGER DEFAULT 0,
      welcome_channel_id TEXT,
      welcome_message TEXT,
      welcome_embed INTEGER DEFAULT 1,
      welcome_embed_title TEXT,
      welcome_embed_description TEXT,
      welcome_embed_color TEXT DEFAULT '#A855F7',
      welcome_embed_thumbnail TEXT,
      welcome_embed_image TEXT,
      welcome_embed_footer TEXT,
      welcome_auto_delete_seconds INTEGER DEFAULT 0,
      goodbye_enabled INTEGER DEFAULT 0,
      goodbye_channel_id TEXT,
      goodbye_message TEXT,
      goodbye_embed INTEGER DEFAULT 1,
      goodbye_embed_title TEXT,
      goodbye_embed_description TEXT,
      goodbye_embed_color TEXT DEFAULT '#A855F7',
      goodbye_embed_thumbnail TEXT,
      goodbye_embed_image TEXT,
      goodbye_embed_footer TEXT,
      goodbye_auto_delete_seconds INTEGER DEFAULT 0,
      auto_role_enabled INTEGER DEFAULT 0,
      auto_role_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      target_id TEXT DEFAULT '0',
      details TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_action_logs_guild ON action_logs(guild_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_action_logs_type ON action_logs(guild_id, action_type);

    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      date TEXT NOT NULL,
      warnings_count INTEGER DEFAULT 0,
      kicks_count INTEGER DEFAULT 0,
      bans_count INTEGER DEFAULT 0,
      mutes_count INTEGER DEFAULT 0,
      timeouts_count INTEGER DEFAULT 0,
      UNIQUE(guild_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_stats_guild ON daily_stats(guild_id, date DESC);

    CREATE TABLE IF NOT EXISTS auto_responder_config (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      response TEXT,
      scope TEXT DEFAULT 'all',
      channel_ids TEXT DEFAULT '[]',
      cooldown_seconds INTEGER DEFAULT 3,
      ignore_commands INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS command_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      custom_name TEXT,
      custom_description TEXT,
      custom_usage TEXT,
      custom_examples TEXT DEFAULT '[]',
      custom_category TEXT DEFAULT 'General',
      enabled INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, command_name)
    );
    CREATE INDEX IF NOT EXISTS idx_cmd_cfg_guild ON command_configs(guild_id, command_name);

    CREATE TABLE IF NOT EXISTS embeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_embeds_guild ON embeds(guild_id, name);
  `);

  console.log('✅ Database schema initialized');
}

// ============================================
// Guilds
// ============================================
export const guilds = {
  get(guildId) {
    let row = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO guilds (id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    }
    return row;
  },
  update(guildId, data) {
    this.get(guildId);
    const fields = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(data), guildId];
    return db.prepare(`UPDATE guilds SET ${fields}, updated_at = strftime('%s', 'now') WHERE id = ?`).run(...values);
  },
  getPrefix(guildId) {
    const row = db.prepare('SELECT prefix FROM guilds WHERE id = ?').get(guildId);
    return row?.prefix || config.bot.defaultPrefix;
  },
  setPrefix(guildId, prefix) {
    this.get(guildId);
    return db.prepare('UPDATE guilds SET prefix = ? WHERE id = ?').run(prefix, guildId);
  },
  getLanguage(guildId) {
    const row = db.prepare('SELECT language FROM guilds WHERE id = ?').get(guildId);
    return row?.language || config.bot.defaultLanguage;
  },
  setLanguage(guildId, lang) {
    this.get(guildId);
    return db.prepare('UPDATE guilds SET language = ? WHERE id = ?').run(lang, guildId);
  },
};

// ============================================
// Warnings
// ============================================
export const warnings = {
  add(guildId, userId, moderatorId, reason) {
    const r = db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)').run(guildId, userId, moderatorId, reason);
    return r.lastInsertRowid;
  },
  get(guildId, userId) {
    return db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC').all(guildId, userId);
  },
  getAll(guildId) {
    return db.prepare('SELECT * FROM warnings WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
  },
  count(guildId, userId) {
    return db.prepare('SELECT COUNT(*) as c FROM warnings WHERE guild_id = ? AND user_id = ?').get(guildId, userId).c;
  },
  remove(guildId, warningId) {
    return db.prepare('DELETE FROM warnings WHERE id = ? AND guild_id = ?').run(warningId, guildId).changes > 0;
  },
  clear(guildId, userId) {
    return db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes;
  },
};

// ============================================
// Temp Punishments
// ============================================
export const tempPunishments = {
  add(guildId, userId, punishmentType, expiresAt, createdBy, reason, targetId = null) {
    const r = db.prepare('INSERT INTO temp_punishments (guild_id, user_id, punishment_type, expires_at, created_by, reason, target_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(guildId, userId, punishmentType, expiresAt, createdBy, reason, targetId);
    return r.lastInsertRowid;
  },
  get(id) {
    return db.prepare('SELECT * FROM temp_punishments WHERE id = ?').get(id);
  },
  getUserPunishments(guildId, userId) {
    return db.prepare('SELECT * FROM temp_punishments WHERE guild_id = ? AND user_id = ? AND active = 1 ORDER BY created_at DESC').all(guildId, userId);
  },
  getAll(guildId) {
    return db.prepare('SELECT * FROM temp_punishments WHERE guild_id = ? AND active = 1 ORDER BY expires_at ASC').all(guildId);
  },
  getExpired() {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare('SELECT * FROM temp_punishments WHERE active = 1 AND expires_at <= ? ORDER BY expires_at ASC').all(now);
  },
  remove(id) {
    return db.prepare('DELETE FROM temp_punishments WHERE id = ?').run(id).changes > 0;
  },
  deactivate(id) {
    return db.prepare('UPDATE temp_punishments SET active = 0 WHERE id = ?').run(id).changes > 0;
  },
  count(guildId) {
    return db.prepare('SELECT COUNT(*) as c FROM temp_punishments WHERE guild_id = ? AND active = 1').get(guildId).c;
  },
  updateExpiry(id, newExpiresAt) {
    return db.prepare('UPDATE temp_punishments SET expires_at = ? WHERE id = ?').run(newExpiresAt, id).changes > 0;
  },
  clearAll(guildId) {
    return db.prepare('DELETE FROM temp_punishments WHERE guild_id = ?').run(guildId).changes;
  },
};

// ============================================
// Jail
// ============================================
export const jailDB = {
  add(guildId, userId, jailedBy, roleIds, reason) {
    try {
      db.prepare(`INSERT OR REPLACE INTO jailed_users (guild_id, user_id, jailed_by, role_ids, reason, jailed_at, release_at) VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'), NULL)`).run(guildId, userId, jailedBy, JSON.stringify(roleIds || []), reason || null);
      return true;
    } catch (err) {
      logger.error('jailDB.add:', err.message);
      return false;
    }
  },
  get(guildId, userId) {
    const row = db.prepare('SELECT * FROM jailed_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (!row) return null;
    let roleIds = [];
    try { roleIds = JSON.parse(row.role_ids || '[]'); } catch {}
    return { ...row, role_ids: roleIds };
  },
  getAll(guildId) {
    return db.prepare('SELECT * FROM jailed_users WHERE guild_id = ? ORDER BY jailed_at DESC').all(guildId).map((row) => {
      let roleIds = [];
      try { roleIds = JSON.parse(row.role_ids || '[]'); } catch {}
      return { ...row, role_ids: roleIds };
    });
  },
  remove(guildId, userId) {
    return db.prepare('DELETE FROM jailed_users WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes > 0;
  },
  count(guildId) {
    return db.prepare('SELECT COUNT(*) as c FROM jailed_users WHERE guild_id = ?').get(guildId).c;
  },
  setReleaseAt(guildId, userId, releaseAt) {
    return db.prepare('UPDATE jailed_users SET release_at = ? WHERE guild_id = ? AND user_id = ?').run(releaseAt, guildId, userId).changes > 0;
  },
  getExpired() {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare('SELECT * FROM jailed_users WHERE release_at IS NOT NULL AND release_at <= ?').all(now).map((row) => {
      let roleIds = [];
      try { roleIds = JSON.parse(row.role_ids || '[]'); } catch {}
      return { ...row, role_ids: roleIds };
    });
  },
};

// ============================================
// AFK
// ============================================
export const afkDB = {
  set(guildId, userId, reason) {
    db.prepare(`INSERT OR REPLACE INTO afk_users (guild_id, user_id, reason, set_at) VALUES (?, ?, ?, strftime('%s', 'now'))`).run(guildId, userId, reason || null);
    return true;
  },
  get(guildId, userId) {
    const row = db.prepare('SELECT reason, set_at FROM afk_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
    if (!row) return null;
    return { reason: row.reason, since: row.set_at };
  },
  getAll(guildId) {
    const rows = db.prepare('SELECT user_id, reason, set_at FROM afk_users WHERE guild_id = ? ORDER BY set_at DESC').all(guildId);
    const result = {};
    for (const r of rows) result[r.user_id] = { reason: r.reason, since: r.set_at };
    return result;
  },
  remove(guildId, userId) {
    return db.prepare('DELETE FROM afk_users WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes > 0;
  },
};

// ============================================
// Custom Commands
// ============================================
export const customCmdsDB = {
  add(guildId, trigger, response, createdBy) {
    try {
      db.prepare('INSERT INTO custom_commands (guild_id, name, response, created_by) VALUES (?, ?, ?, ?)').run(guildId, trigger.toLowerCase(), response, createdBy);
      return true;
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
      throw err;
    }
  },
  get(guildId, trigger) {
    const row = db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? AND name = ?').get(guildId, trigger.toLowerCase());
    if (!row) return null;
    return { trigger: row.name, response: row.response, created_by: row.created_by, created_at: row.created_at };
  },
  getAll(guildId) {
    return db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY name').all(guildId).map((r) => ({ trigger: r.name, response: r.response, created_by: r.created_by, created_at: r.created_at }));
  },
  update(guildId, trigger, newResponse) {
    return db.prepare('UPDATE custom_commands SET response = ? WHERE guild_id = ? AND name = ?').run(newResponse, guildId, trigger.toLowerCase()).changes > 0;
  },
  remove(guildId, trigger) {
    return db.prepare('DELETE FROM custom_commands WHERE guild_id = ? AND name = ?').run(guildId, trigger.toLowerCase()).changes > 0;
  },
  count(guildId) {
    return db.prepare('SELECT COUNT(*) as c FROM custom_commands WHERE guild_id = ?').get(guildId).c;
  },
  clear(guildId) {
    return db.prepare('DELETE FROM custom_commands WHERE guild_id = ?').run(guildId).changes;
  },
};

// ============================================
// Aliases (old)
// ============================================
export const aliases = {
  add(guildId, alias, command, createdBy) {
    db.prepare('INSERT OR REPLACE INTO aliases (guild_id, alias, command, created_by) VALUES (?, ?, ?, ?)').run(guildId, alias, command, createdBy);
  },
  get(guildId, alias) {
    return db.prepare('SELECT * FROM aliases WHERE guild_id = ? AND alias = ?').get(guildId, alias);
  },
  getAll(guildId) {
    return db.prepare('SELECT * FROM aliases WHERE guild_id = ?').all(guildId);
  },
  remove(guildId, alias) {
    return db.prepare('DELETE FROM aliases WHERE guild_id = ? AND alias = ?').run(guildId, alias);
  },
};

// ============================================
// Command Aliases (aliases.js)
// ============================================
export const aliasesDB = {
  add(guildId, alias, originalCommand, createdBy) {
    try {
      db.prepare('INSERT INTO command_aliases (guild_id, alias, original_command, created_by) VALUES (?, ?, ?, ?)').run(guildId, alias.toLowerCase(), originalCommand.toLowerCase(), createdBy);
      return true;
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
      throw err;
    }
  },
  get(guildId, alias) {
    return db.prepare('SELECT * FROM command_aliases WHERE guild_id = ? AND alias = ?').get(guildId, alias.toLowerCase());
  },
  getAll(guildId) {
    return db.prepare('SELECT * FROM command_aliases WHERE guild_id = ? ORDER BY original_command').all(guildId).map((r) => ({ alias: r.alias, original_command: r.original_command, created_by: r.created_by, created_at: r.created_at }));
  },
  remove(guildId, alias) {
    return db.prepare('DELETE FROM command_aliases WHERE guild_id = ? AND alias = ?').run(guildId, alias.toLowerCase()).changes > 0;
  },
  count(guildId) {
    return db.prepare('SELECT COUNT(*) as c FROM command_aliases WHERE guild_id = ?').get(guildId).c;
  },
  clear(guildId) {
    return db.prepare('DELETE FROM command_aliases WHERE guild_id = ?').run(guildId).changes;
  },
};

// ============================================
// Auto Responder (old)
// ============================================
export const autoResponder = {
  add(guildId, trigger, response, matchType = 'exact') {
    db.prepare('INSERT INTO auto_responder (guild_id, trigger, response, match_type) VALUES (?, ?, ?, ?)').run(guildId, trigger, response, matchType);
  },
  getAll(guildId) {
    return db.prepare('SELECT * FROM auto_responder WHERE guild_id = ?').all(guildId);
  },
  remove(guildId, id) {
    return db.prepare('DELETE FROM auto_responder WHERE guild_id = ? AND id = ?').run(guildId, id);
  },
};

// ============================================
// Auto Responder Config (auto-responder.js)
// ============================================
export const autoResponderDB = {
  get(guildId) {
    let row = db.prepare('SELECT * FROM auto_responder_config WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO auto_responder_config (guild_id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM auto_responder_config WHERE guild_id = ?').get(guildId);
    }
    let channelIds = [];
    try { channelIds = JSON.parse(row.channel_ids || '[]'); } catch {}
    return { ...row, channel_ids: channelIds, enabled: !!row.enabled, ignore_commands: !!row.ignore_commands };
  },
  set(guildId, data) {
    this.get(guildId);
    const updates = { ...data };
    if (Array.isArray(updates.channel_ids)) updates.channel_ids = JSON.stringify(updates.channel_ids);
    if (typeof updates.enabled === 'boolean') updates.enabled = updates.enabled ? 1 : 0;
    if (typeof updates.ignore_commands === 'boolean') updates.ignore_commands = updates.ignore_commands ? 1 : 0;
    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), guildId];
    return db.prepare(`UPDATE auto_responder_config SET ${fields}, updated_at = strftime('%s', 'now') WHERE guild_id = ?`).run(...values).changes > 0;
  },
};

// ============================================
// Sessions
// ============================================
export const sessions = {
  create(token, userId, expiresInMs = 7 * 24 * 60 * 60 * 1000) {
    const expiresAt = Math.floor((Date.now() + expiresInMs) / 1000);
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  },
  get(token) {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, now);
  },
  remove(token) {
    return db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },
  cleanup() {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  },
};

// ============================================
// Command Permissions
// ============================================
export const commandPermissions = {
  addMod(guildId, command, roleId) {
    try {
      const r = db.prepare('INSERT INTO command_permissions (guild_id, command, role_id) VALUES (?, ?, ?)').run(guildId, command.toLowerCase(), roleId);
      return r.changes > 0;
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
      throw err;
    }
  },
  removeMod(guildId, command, roleId) {
    return db.prepare('DELETE FROM command_permissions WHERE guild_id = ? AND command = ? AND role_id = ?').run(guildId, command.toLowerCase(), roleId).changes > 0;
  },
  clearCommand(guildId, command) {
    return db.prepare('DELETE FROM command_permissions WHERE guild_id = ? AND command = ?').run(guildId, command.toLowerCase()).changes;
  },
  getMods(guildId, command) {
    return db.prepare('SELECT role_id FROM command_permissions WHERE guild_id = ? AND command = ?').all(guildId, command.toLowerCase()).map((r) => r.role_id);
  },
  getRoleCommands(guildId, roleId) {
    return db.prepare('SELECT command FROM command_permissions WHERE guild_id = ? AND role_id = ?').all(guildId, roleId).map((r) => r.command);
  },
  getAllModerators(guildId) {
    const rows = db.prepare('SELECT command, role_id FROM command_permissions WHERE guild_id = ?').all(guildId);
    const result = {};
    for (const row of rows) {
      if (!result[row.command]) result[row.command] = [];
      result[row.command].push(row.role_id);
    }
    return result;
  },
};

// ============================================
// Command Channels
// ============================================
export const channelsDB = {
  add(guildId, channelId, channelType) {
    try {
      const r = db.prepare('INSERT INTO command_channels (guild_id, channel_id, channel_type) VALUES (?, ?, ?)').run(guildId, channelId, channelType.toLowerCase());
      return r.changes > 0;
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
      throw err;
    }
  },
  remove(guildId, channelId, channelType) {
    return db.prepare('DELETE FROM command_channels WHERE guild_id = ? AND channel_id = ? AND channel_type = ?').run(guildId, channelId, channelType.toLowerCase()).changes > 0;
  },
  getAll(guildId) {
    const rows = db.prepare('SELECT channel_type, channel_id FROM command_channels WHERE guild_id = ?').all(guildId);
    const result = {};
    for (const r of rows) {
      if (!result[r.channel_type]) result[r.channel_type] = [];
      result[r.channel_type].push(r.channel_id);
    }
    return result;
  },
  clear(guildId, channelType = null) {
    if (channelType) {
      return db.prepare('DELETE FROM command_channels WHERE guild_id = ? AND channel_type = ?').run(guildId, channelType.toLowerCase()).changes;
    }
    return db.prepare('DELETE FROM command_channels WHERE guild_id = ?').run(guildId).changes;
  },
};

// ============================================
// Log Settings
// ============================================
export const logDB = {
  set(guildId, eventType, channelId, enabled = true) {
    db.prepare(`INSERT OR REPLACE INTO log_settings (guild_id, event_type, enabled, channel_id) VALUES (?, ?, ?, ?)`).run(guildId, eventType.toLowerCase(), enabled ? 1 : 0, channelId);
    return true;
  },
  get(guildId, eventType) {
    const row = db.prepare('SELECT channel_id FROM log_settings WHERE guild_id = ? AND event_type = ? AND enabled = 1').get(guildId, eventType.toLowerCase());
    return row ? row.channel_id : null;
  },
  getAll(guildId) {
    const rows = db.prepare('SELECT event_type, enabled, channel_id FROM log_settings WHERE guild_id = ?').all(guildId);
    const result = {};
    for (const r of rows) result[r.event_type] = { enabled: !!r.enabled, channel_id: r.channel_id };
    return result;
  },
  getLogChannels(guildId) {
    const rows = db.prepare('SELECT event_type, channel_id FROM log_settings WHERE guild_id = ? AND enabled = 1').all(guildId);
    const result = {};
    for (const r of rows) result[r.event_type] = r.channel_id;
    return result;
  },
  remove(guildId, eventType) {
    return db.prepare('DELETE FROM log_settings WHERE guild_id = ? AND event_type = ?').run(guildId, eventType.toLowerCase()).changes > 0;
  },
  clear(guildId) {
    return db.prepare('DELETE FROM log_settings WHERE guild_id = ?').run(guildId).changes;
  },
};

// ============================================
// Welcome Config
// ============================================
export const welcomeDB = {
  get(guildId) {
    let row = db.prepare('SELECT * FROM welcome_config WHERE guild_id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO welcome_config (guild_id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM welcome_config WHERE guild_id = ?').get(guildId);
    }
    return row;
  },
  set(guildId, data) {
    this.get(guildId);
    const fields = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(data), guildId];
    return db.prepare(`UPDATE welcome_config SET ${fields}, updated_at = strftime('%s', 'now') WHERE guild_id = ?`).run(...values).changes > 0;
  },
};

// ============================================
// Command Configs (custom-help.js)
// ============================================
export const commandConfigs = {
  get(guildId, commandName) {
    const row = db.prepare('SELECT * FROM command_configs WHERE guild_id = ? AND command_name = ?').get(guildId, commandName.toLowerCase());
    if (!row) return null;
    let examples = [];
    try { examples = JSON.parse(row.custom_examples || '[]'); } catch {}
    return { ...row, custom_examples: examples, enabled: !!row.enabled };
  },
  set(guildId, commandName, data) {
    const existing = this.get(guildId, commandName.toLowerCase());
    const updates = { ...data };
    if (Array.isArray(updates.custom_examples)) updates.custom_examples = JSON.stringify(updates.custom_examples);
    if (typeof updates.enabled === 'boolean') updates.enabled = updates.enabled ? 1 : 0;

    if (!existing) {
      const cols = ['guild_id', 'command_name', ...Object.keys(updates)];
      const vals = [guildId, commandName.toLowerCase(), ...Object.values(updates)];
      const placeholders = cols.map(() => '?').join(', ');
      return db.prepare(`INSERT INTO command_configs (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals).changes > 0;
    }
    const fields = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), guildId, commandName.toLowerCase()];
    return db.prepare(`UPDATE command_configs SET ${fields}, updated_at = strftime('%s', 'now') WHERE guild_id = ? AND command_name = ?`).run(...values).changes > 0;
  },
  getAll(guildId) {
    const rows = db.prepare('SELECT * FROM command_configs WHERE guild_id = ?').all(guildId);
    const result = {};
    for (const row of rows) {
      let examples = [];
      try { examples = JSON.parse(row.custom_examples || '[]'); } catch {}
      result[row.command_name] = { ...row, custom_examples: examples, enabled: !!row.enabled };
    }
    return result;
  },
  remove(guildId, commandName) {
    return db.prepare('DELETE FROM command_configs WHERE guild_id = ? AND command_name = ?').run(guildId, commandName.toLowerCase()).changes > 0;
  },
  clear(guildId) {
    return db.prepare('DELETE FROM command_configs WHERE guild_id = ?').run(guildId).changes;
  },
};

// ============================================
// Embeds (embeds.js API)
// ============================================
export const embedsDB = {
  get(guildId, name) {
    const row = db.prepare('SELECT * FROM embeds WHERE guild_id = ? AND name = ?').get(guildId, name);
    if (!row) return null;
    try { row.data = JSON.parse(row.data); } catch {}
    return row;
  },
  getAll(guildId) {
    const rows = db.prepare('SELECT * FROM embeds WHERE guild_id = ? ORDER BY name').all(guildId);
    return rows.map((row) => {
      try { row.data = JSON.parse(row.data); } catch {}
      return row;
    });
  },
  set(guildId, name, data) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    const existing = db.prepare('SELECT id FROM embeds WHERE guild_id = ? AND name = ?').get(guildId, name);
    if (existing) {
      return db.prepare(`UPDATE embeds SET data = ?, updated_at = strftime('%s', 'now') WHERE guild_id = ? AND name = ?`).run(dataStr, guildId, name).changes > 0;
    }
    return db.prepare('INSERT INTO embeds (guild_id, name, data) VALUES (?, ?, ?)').run(guildId, name, dataStr).changes > 0;
  },
  remove(guildId, name) {
    return db.prepare('DELETE FROM embeds WHERE guild_id = ? AND name = ?').run(guildId, name).changes > 0;
  },
  clear(guildId) {
    return db.prepare('DELETE FROM embeds WHERE guild_id = ?').run(guildId).changes;
  },
};

// ============================================
// Settings (settings.js API)
// ============================================
export const settingsDB = {
  get(guildId) {
    const row = this._ensure(guildId);
    return { guild_id: row.id, prefix: row.prefix || '=', locale: row.locale || 'en-US', language: row.language || 'ar' };
  },
  set(guildId, data) {
    this._ensure(guildId);
    const updates = { ...data };
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), guildId];
    return db.prepare(`UPDATE guilds SET ${fields}, updated_at = strftime('%s', 'now') WHERE id = ?`).run(...values).changes > 0;
  },
  reset(guildId) {
    db.prepare(`UPDATE guilds SET prefix = '=', locale = 'en-US', language = 'ar' WHERE id = ?`).run(guildId);
    return true;
  },
  _ensure(guildId) {
    let row = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    if (!row) {
      db.prepare('INSERT INTO guilds (id) VALUES (?)').run(guildId);
      row = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
    }
    return row;
  },
};

// ============================================
// Logs (logs.js API)
// ============================================
export const logsDB = {
  getLogChannels(guildId) {
    const rows = db.prepare('SELECT event_type, channel_id FROM log_settings WHERE guild_id = ? AND enabled = 1').all(guildId);
    const result = {};
    for (const r of rows) result[r.event_type] = r.channel_id;
    return result;
  },
  set(guildId, eventType, channelId, enabled = true) {
    db.prepare(`INSERT OR REPLACE INTO log_settings (guild_id, event_type, enabled, channel_id) VALUES (?, ?, ?, ?)`).run(guildId, eventType.toLowerCase(), enabled ? 1 : 0, channelId);
    return true;
  },
  get(guildId, eventType) {
    const row = db.prepare('SELECT channel_id FROM log_settings WHERE guild_id = ? AND event_type = ? AND enabled = 1').get(guildId, eventType.toLowerCase());
    return row ? row.channel_id : null;
  },
  getAll(guildId) {
    const rows = db.prepare('SELECT event_type, enabled, channel_id FROM log_settings WHERE guild_id = ?').all(guildId);
    const result = {};
    for (const r of rows) result[r.event_type] = { enabled: !!r.enabled, channel_id: r.channel_id };
    return result;
  },
  clear(guildId) {
    return db.prepare('DELETE FROM log_settings WHERE guild_id = ?').run(guildId).changes;
  },
};

// ============================================
// Panel DB (admin-panel.js)
// ============================================
export const panelDB = {
  getStats(guildId) {
    const stats = {};
    try { stats.warnings = db.prepare('SELECT COUNT(*) as c FROM warnings WHERE guild_id = ?').get(guildId).c; } catch { stats.warnings = 0; }
    try { stats.jailed_users = db.prepare('SELECT COUNT(*) as c FROM jailed_users WHERE guild_id = ?').get(guildId).c; } catch { stats.jailed_users = 0; }
    try { stats.temp_punishments = db.prepare('SELECT COUNT(*) as c FROM temp_punishments WHERE guild_id = ? AND active = 1').get(guildId).c; } catch { stats.temp_punishments = 0; }
    try { stats.afk_users = db.prepare('SELECT COUNT(*) as c FROM afk_users WHERE guild_id = ?').get(guildId).c; } catch { stats.afk_users = 0; }
    try { stats.custom_commands = db.prepare('SELECT COUNT(*) as c FROM custom_commands WHERE guild_id = ?').get(guildId).c; } catch { stats.custom_commands = 0; }
    try { stats.command_aliases = db.prepare('SELECT COUNT(*) as c FROM command_aliases WHERE guild_id = ?').get(guildId).c; } catch { stats.command_aliases = 0; }
    try { stats.moderators = db.prepare('SELECT COUNT(DISTINCT role_id) as c FROM command_permissions WHERE guild_id = ?').get(guildId).c; } catch { stats.moderators = 0; }
    try { stats.temp_roles = db.prepare("SELECT COUNT(*) as c FROM temp_punishments WHERE guild_id = ? AND active = 1 AND punishment_type LIKE 'temp_role%'").get(guildId).c; } catch { stats.temp_roles = 0; }
    return stats;
  },
  getRecentActions(guildId, limit = 50) {
    try { return db.prepare('SELECT * FROM action_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit); } catch { return []; }
  },
  getDailyStats(guildId, days = 7) {
    try { return db.prepare('SELECT * FROM daily_stats WHERE guild_id = ? ORDER BY date DESC LIMIT ?').all(guildId, days); } catch { return []; }
  },
  getWarnings(guildId, limit = 100) {
    try { return db.prepare('SELECT * FROM warnings WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit); } catch { return []; }
  },
};

// ============================================
// Logging helper
// ============================================
export const logging = {
  logAction(guildId, actionType, actorId, targetId = 0, details = '') {
    try {
      db.prepare('INSERT INTO action_logs (guild_id, action_type, actor_id, target_id, details) VALUES (?, ?, ?, ?, ?)').run(guildId, actionType, actorId, String(targetId || 0), details || '');
      return true;
    } catch (err) {
      logger.debug('logAction error:', err.message);
      return false;
    }
  },
};

// ============================================
// Old "jailed" alias (backward compat)
// ============================================
export const jailed = jailDB;

// ============================================
// Old "afk" alias
// ============================================
export const afk = afkDB;

// ============================================
// Old "customCommands" alias
// ============================================
export const customCommands = customCmdsDB;

// ============================================
// Init
// ============================================
initSchema();

// ============================================
// Default export
// ============================================
export default {
  db,
  guilds,
  warnings,
  tempPunishments,
  jailDB,
  jailed,
  afkDB,
  afk,
  customCmdsDB,
  customCommands,
  aliases,
  aliasesDB,
  autoResponder,
  autoResponderDB,
  sessions,
  commandPermissions,
  channelsDB,
  logDB,
  logsDB,
  welcomeDB,
  commandConfigs,
  embedsDB,
  settingsDB,
  panelDB,
  logging,
};

export { db };
