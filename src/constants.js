/**
 * constants.js
 * ============================================
 * كل الثوابت المستخدمة في البوت
 * ============================================
 */

// ===== Moderation =====
export const DEFAULT_MUTE_ROLE_NAME = 'Muted';
export const MUTE_ROLE_ALIASES = ['Muted', 'muted', 'Mute', 'ميوت', 'مكتوم', 'صامت'];
export const MAX_CLEAR_AMOUNT = 1000;
export const MAX_TIMEOUT_SECONDS = 28 * 86400; // 28 days
export const MIN_TIMEOUT_SECONDS = 60;         // 1 minute
export const BAN_DELETE_MESSAGE_SECONDS = 7 * 86400;
export const MASS_OPS_MAX_TARGETS = 50;
export const CONFIRMATION_TIMEOUT = 30;
export const CHANNEL_PERM_SEMAPHORE = 5;

// ===== Cooldowns =====
export const DEFAULT_COOLDOWN = 3;
export const DANGEROUS_COOLDOWN = 10;

// ===== Temp Roles =====
export const TEMP_ROLES_CHECK_INTERVAL = 60; // seconds
export const TEMP_ROLE_API_DELAY = 0.5;      // seconds between API calls

// ===== Log Types =====
export const LOG_TYPES = {
  message_delete: '🗑️ حذف رسالة',
  message_edit: '✏️ تعديل رسالة',
  image_delete: '🖼️ حذف صورة',
  guild_ban: '🔨 حظر',
  guild_unban: '🔓 إلغاء حظر',
  moderator_actions: '🛡️ إجراءات المشرفين',
  jail: '🔒 سجن',
  temp_punishments: '⏰ عقوبات مؤقتة',
  member_join: '📥 عضو جديد',
  member_leave: '📤 عضو غادر',
  voice_join: '🔊 دخول صوتي',
  voice_leave: '🔇 خروج صوتي',
  role_add: '➕ رتبة مضافة',
  role_remove: '➖ رتبة محذوفة',
  channel_create: '📝 قناة جديدة',
  channel_delete: '🗑️ قناة محذوفة',
};

// ===== Duration Parsing =====
export const DURATION_UNITS = {
  s: 1000,
  sec: 1000,
  second: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  minute: 60 * 1000,
  h: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Parse duration string → milliseconds
 * يدعم: "1h", "30m", "1d 12h", "1w", إلخ
 */
export function parseDuration(str, defaultUnit = 'm') {
  if (!str || typeof str !== 'string') return null;

  const regex = /(\d+)\s*(s|sec|second|m|min|minute|h|hour|d|day|w|week)?/gi;
  let total = 0;
  let matched = false;
  let match;

  while ((match = regex.exec(str)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = (match[2] || defaultUnit).toLowerCase();
    const multiplier = DURATION_UNITS[unit];
    if (multiplier) {
      total += value * multiplier;
      matched = true;
    }
  }

  return matched && total > 0 ? total : null;
}

/**
 * Format milliseconds → readable string
 */
export function formatDuration(ms) {
  if (!ms || ms < 1000) return '0s';

  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && parts.length < 2) parts.push(`${secs}s`);

  return parts.join(' ') || '0s';
}

// ===== ROLE MANAGEMENT (roles.js) =====

// إعدادات الصور (role icons)
export const MAX_IMAGE_SIZE = 256 * 1024;       // 256 KB (Discord limit)
export const IMAGE_TARGET_SIZE = 250 * 1024;    // 250 KB (target)
export const MAX_IMAGE_DIMENSION = 512;
export const MIN_IMAGE_DIMENSION = 64;
export const WEBP_QUALITY = 85;

// الألوان بالأسماء
export const NAMED_COLORS = {
  // English
  red: 'FF0000',
  green: '00FF00',
  blue: '0000FF',
  yellow: 'FFFF00',
  orange: 'FFA500',
  purple: '800080',
  pink: 'FFC0CB',
  black: '000000',
  white: 'FFFFFF',
  cyan: '00FFFF',
  gold: 'FFD700',
  silver: 'C0C0C0',
  gray: '808080',
  grey: '808080',
  brown: '8B4513',
  navy: '000080',
  teal: '008080',
  lime: '00FF00',
  maroon: '800000',
  olive: '808000',
  aqua: '00FFFF',
  magenta: 'FF00FF',
  violet: 'EE82EE',
  indigo: '4B0082',
  turquoise: '40E0D0',
  salmon: 'FA8072',
  coral: 'FF7F50',
  crimson: 'DC143C',
  khaki: 'F0E68C',
  lavender: 'E6E6FA',
  beige: 'F5F5DC',
  // Arabic
  'أحمر': 'FF0000',
  'أخضر': '00FF00',
  'أزرق': '0000FF',
  'أصفر': 'FFFF00',
  'برتقالي': 'FFA500',
  'بنفسجي': '800080',
  'وردي': 'FFC0CB',
  'أسود': '000000',
  'أبيض': 'FFFFFF',
  'سماوي': '00FFFF',
  'ذهبي': 'FFD700',
  'فضي': 'C0C0C0',
  'رمادي': '808080',
  'بني': '8B4513',
  'كحلي': '000080',
  'تركواز': '40E0D0',
  'مرجاني': 'FF7F50',
  'بيج': 'F5F5DC',
};

// قائمة الأوامر المتاحة لـ command_permissions
export const AVAILABLE_COMMANDS = [
  // moderation
  'ban', 'unban', 'kick', 'mute', 'unmute', 'timeout', 'untimeout',
  'warn', 'warnings', 'clearwarn', 'clear', 'massban', 'masskick', 'massmute',
  'summon', 'setlog',
  // roles
  'createrole', 'deleterole', 'setrolename', 'setrolecolor', 'setroleicon',
  'setroleposition', 'moverole', 'roleinfo', 'roleall', 'massrole', 'rolehoist',
  // roles (giverole/takerole)
  'giverole', 'takerole',
  // utility
  'ping', 'avatar', 'userinfo', 'serverinfo', 'botinfo', 'help',
  // channels
  'slowmode', 'lock', 'unlock', 'hide', 'unhide',
  // aliases + custom
  'alias', 'unalias', 'aliases', 'addcommand', 'removecommand', 'commands',
  // auto responder
  'autoresponder', 'ar',
  // welcome
  'setwelcome', 'setgoodbye', 'testwelcome',
  // jail
  'jail', 'unjail',
  // afk
  'afk',
];

// تنظيف اسم الأمر (إزالة = / <@& > / مسافات)
export function cleanCommandName(cmd) {
  if (!cmd) return '';
  return String(cmd)
    .trim()
    .replace(/^[=/]/, '')
    .replace(/<@&\d+>/, '')
    .replace(/<@\d+>/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}


// ===== CHANNELS & COMMANDS (channels.js, aliases.js, custom_commands.js) =====

// Channel types for command_channels
export const CHANNEL_TYPES = {
  admin: '🛡️ قنوات إدارية',
  general: '📢 قنوات عامة',
};

// Aliases
export const MAX_ALIASES = 100;
export const MAX_ALIAS_LENGTH = 30;

// Custom Commands
export const MAX_CUSTOM_COMMANDS = 100;
export const MAX_TRIGGER_LENGTH = 50;
export const MAX_RESPONSE_LENGTH = 2000;

// Channels
export const MAX_TOPIC_LENGTH = 1024;
export const MAX_SLOWMODE_SECONDS = 21600; // 6 hours
export const MAX_MASS_CHANNELS = 50;

// AFK
export const AFK_MESSAGE_TIMEOUT = 60; // seconds
export default {
  DEFAULT_MUTE_ROLE_NAME,
  MUTE_ROLE_ALIASES,
  MAX_CLEAR_AMOUNT,
  MAX_TIMEOUT_SECONDS,
  MIN_TIMEOUT_SECONDS,
  BAN_DELETE_MESSAGE_SECONDS,
  MASS_OPS_MAX_TARGETS,
  CONFIRMATION_TIMEOUT,
  CHANNEL_PERM_SEMAPHORE,
  DEFAULT_COOLDOWN,
  DANGEROUS_COOLDOWN,
  TEMP_ROLES_CHECK_INTERVAL,
  TEMP_ROLE_API_DELAY,
  LOG_TYPES,
  DURATION_UNITS,
  parseDuration,
  formatDuration,
  MAX_IMAGE_SIZE,
  IMAGE_TARGET_SIZE,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  WEBP_QUALITY,
  NAMED_COLORS,
  AVAILABLE_COMMANDS,
  cleanCommandName,
  CHANNEL_TYPES,
  MAX_ALIASES,
  MAX_ALIAS_LENGTH,
  MAX_CUSTOM_COMMANDS,
  MAX_TRIGGER_LENGTH,
  MAX_RESPONSE_LENGTH,
  MAX_TOPIC_LENGTH,
  MAX_SLOWMODE_SECONDS,
  MAX_MASS_CHANNELS,
  AFK_MESSAGE_TIMEOUT,
};
