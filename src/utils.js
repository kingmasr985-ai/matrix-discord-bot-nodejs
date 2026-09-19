/**
 * utils.js
 * ============================================
 * Helper Functions — تُستخدم في كل الأوامر
 * ============================================
 */

import {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import config from './config.js';

// ============================================
// الوقت والتاريخ
// ============================================

/**
 * تحويل milliseconds لصيغة مقروءة
 * مثال: 3661000 → "1h 1m 1s"
 */
export function formatDuration(ms) {
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

/**
 * تحويل نص زي "1h 30m" لـ milliseconds
 * يدعم: s, m, h, d, w
 */
export function parseDuration(str) {
  if (!str) return null;
  const regex = /(\d+)\s*(s|m|h|d|w|sec|min|hour|day|week)/gi;
  const units = {
    s: 1000,
    sec: 1000,
    m: 60 * 1000,
    min: 60 * 1000,
    h: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
  };

  let total = 0;
  let match;
  while ((match = regex.exec(str)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    total += value * (units[unit] || 0);
  }

  return total > 0 ? total : null;
}

/**
 * Unix timestamp → Discord timestamp
 * <t:TIMESTAMP:style>
 * styles: R (relative), f (full), F (full+day), d, D, t, T
 */
export function discordTimestamp(date, style = 'R') {
  const ts = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${ts}:${style}>`;
}

// ============================================
// Embeds
// ============================================

/**
 * إنشاء embed للنجاح
 */
export function successEmbed(description, title = null) {
  const embed = new EmbedBuilder()
    .setColor(config.bot.colors.success)
    .setDescription(`${config.bot.emojis.success} ${description}`);
  if (title) embed.setTitle(title);
  return embed;
}

/**
 * إنشاء embed للخطأ
 */
export function errorEmbed(description, title = null) {
  const embed = new EmbedBuilder()
    .setColor(config.bot.colors.error)
    .setDescription(`${config.bot.emojis.error} ${description}`);
  if (title) embed.setTitle(title);
  return embed;
}

/**
 * إنشاء embed للتحذير
 */
export function warningEmbed(description, title = null) {
  const embed = new EmbedBuilder()
    .setColor(config.bot.colors.warning)
    .setDescription(`${config.bot.emojis.warning} ${description}`);
  if (title) embed.setTitle(title);
  return embed;
}

/**
 * إنشاء embed للمعلومات
 */
export function infoEmbed(description, title = null) {
  const embed = new EmbedBuilder()
    .setColor(config.bot.colors.info)
    .setDescription(`${config.bot.emojis.info} ${description}`);
  if (title) embed.setTitle(title);
  return embed;
}

/**
 * Embed عام قابل للتخصيص
 */
export function createEmbed(options = {}) {
  const embed = new EmbedBuilder();
  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.color) embed.setColor(options.color);
  if (options.fields) embed.addFields(options.fields);
  if (options.footer) embed.setFooter(options.footer);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  if (options.author) embed.setAuthor(options.author);
  if (options.timestamp) embed.setTimestamp();
  return embed;
}

// ============================================
// Buttons
// ============================================

/**
 * إنشاء buttons للـ confirmation
 */
export function confirmButtons(customId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customId}:confirm`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`${customId}:cancel`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
}

// ============================================
// Permissions
// ============================================

/**
 * التحقق من صلاحيات العضو
 */
export function hasPermission(member, permission) {
  return member.permissions.has(permission);
}

/**
 * التحقق من إن العضو Admin
 */
export function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * التحقق من إن العضو Moderator
 */
export function isModerator(member) {
  return (
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

/**
 * التحقق من إن الأعضاء targetين لبعض
 */
export function canModerate(moderator, target) {
  // مينفعش تعدل على نفسك
  if (moderator.id === target.id) return false;

  // مينفعش تعدل على صاحب السيرفر
  if (target.id === target.guild.ownerId) return false;

  // مينفعش تعدل على حد رتبته أعلى
  if (
    moderator.roles.highest.position <= target.roles.highest.position &&
    moderator.guild.ownerId !== moderator.id
  ) {
    return false;
  }

  // مينفعش تعدل على البوت نفسه
  if (target.id === target.client.user.id) return false;

  return true;
}

// ============================================
// Discord Objects
// ============================================

/**
 * البحث عن عضو
 */
export async function findMember(guild, query) {
  if (!query) return null;

  // Mention
  const mentionMatch = query.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    return guild.members.fetch(mentionMatch[1]).catch(() => null);
  }

  // ID
  if (/^\d{17,19}$/.test(query)) {
    return guild.members.fetch(query).catch(() => null);
  }

  // Username
  query = query.toLowerCase();
  return (
    guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === query ||
        m.displayName.toLowerCase() === query
    ) || null
  );
}

/**
 * البحث عن رتبة
 */
export function findRole(guild, query) {
  if (!query) return null;

  const mentionMatch = query.match(/^<@&(\d+)>$/);
  if (mentionMatch) {
    return guild.roles.cache.get(mentionMatch[1]);
  }

  if (/^\d{17,19}$/.test(query)) {
    return guild.roles.cache.get(query);
  }

  query = query.toLowerCase();
  return (
    guild.roles.cache.find(
      (r) => r.name.toLowerCase() === query || r.id === query
    ) || null
  );
}

/**
 * البحث عن قناة
 */
export function findChannel(guild, query) {
  if (!query) return null;

  const mentionMatch = query.match(/^<#(\d+)>$/);
  if (mentionMatch) {
    return guild.channels.cache.get(mentionMatch[1]);
  }

  if (/^\d{17,19}$/.test(query)) {
    return guild.channels.cache.get(query);
  }

  query = query.toLowerCase();
  return (
    guild.channels.cache.find((c) => c.name.toLowerCase() === query) || null
  );
}

// ============================================
// Text
// ============================================

/**
 * قص النص لو طويل
 */
export function truncate(str, maxLength = 1024) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * تنسيق قائمة
 */
export function formatList(items, separator = ', ') {
  return items.join(separator);
}

/**
 * عمل code block
 */
export function codeBlock(content, lang = '') {
  return `\`\`\`${lang}\n${content}\n\`\`\``;
}

/**
 * عمل inline code
 */
export function inlineCode(content) {
  return `\`${content}\``;
}

// ============================================
// Random
// ============================================

/**
 * رقم عشوائي
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * عنصر عشوائي من array
 */
export function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Token عشوائي
 */
export function generateToken(length = 32) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ============================================
// Validation
// ============================================

/**
 * التحقق من URL
 */
export function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * التحقق من ID ديسكورد
 */
export function isValidId(str) {
  return /^\d{17,19}$/.test(str);
}

// ============================================
// Messages
// ============================================

/**
 * إرسال رسالة نجاح وحذفها بعد وقت
 */
export async function sendSuccess(message, description, timeout = 5000) {
  const msg = await message.reply({
    embeds: [successEmbed(description)],
  });
  if (timeout > 0) {
    setTimeout(() => msg.delete().catch(() => {}), timeout);
  }
  return msg;
}

/**
 * إرسال رسالة خطأ وحذفها بعد وقت
 */
export async function sendError(message, description, timeout = 5000) {
  const msg = await message.reply({
    embeds: [errorEmbed(description)],
  });
  if (timeout > 0) {
    setTimeout(() => msg.delete().catch(() => {}), timeout);
  }
  return msg;
}

// ============================================
// Logging
// ============================================

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

export const logger = {
  log(level, message, ...args) {
    const currentLevel = LOG_LEVELS[config.env.logLevel] ?? 2;
    if (LOG_LEVELS[level] > currentLevel) return;

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const emoji = {
      error: '❌',
      warn: '⚠️ ',
      info: 'ℹ️ ',
      debug: '🔍',
    }[level];

    console.log(`[${timestamp}] ${emoji} [${level.toUpperCase()}]`, message, ...args);
  },

  error(message, ...args) {
    this.log('error', message, ...args);
  },
  warn(message, ...args) {
    this.log('warn', message, ...args);
  },
  info(message, ...args) {
    this.log('info', message, ...args);
  },
  debug(message, ...args) {
    this.log('debug', message, ...args);
  },
};

// ============================================
// Export default (كل شيء في object واحد)
// ============================================
export default {
  formatDuration,
  parseDuration,
  discordTimestamp,
  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed,
  createEmbed,
  confirmButtons,
  hasPermission,
  isAdmin,
  isModerator,
  canModerate,
  findMember,
  findRole,
  findChannel,
  truncate,
  formatList,
  codeBlock,
  inlineCode,
  randomInt,
  randomChoice,
  generateToken,
  isValidUrl,
  isValidId,
  sendSuccess,
  sendError,
  logger,
};

// ============================================
// MODERATION HELPERS
// ============================================

export async function discordRetry(fn, ...args) {
  const maxRetries = 3;
  const delays = [1000, 3000, 5000];
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(...args); }
    catch (err) {
      const status = err?.status || err?.httpStatus || err?.code;
      const isRetryable = [502, 503, 504].includes(status);
      if (!isRetryable || i === maxRetries - 1) throw err;
      logger.warn(`Retry ${i + 1}/${maxRetries} (${status})`);
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
}

export async function getMemberFromInput(guild, input) {
  if (!guild || !input) return null;
  if (input?.id && input?.roles !== undefined) return input;
  const str = String(input).trim();
  const mm = str.match(/^<@!?(\d{17,19})>$/);
  if (mm) return guild.members.fetch(mm[1]).catch(() => null);
  const cid = str.replace(/[^\d]/g, '');
  if (cid.length >= 17 && cid.length <= 19) return guild.members.fetch(cid).catch(() => null);
  const lower = str.toLowerCase();
  return guild.members.cache.find(m => m.user.username.toLowerCase() === lower || m.displayName.toLowerCase() === lower) || null;
}

export function canModerateWithBotCheck(moderator, target, botMember) {
  if (!moderator || !target) return [false, '❌ بيانات ناقصة.'];
  if (moderator.id === target.id) return [false, '❌ لا يمكنك تعديل نفسك.'];
  if (target.id === botMember?.id || target.user?.bot) return [false, '❌ لا يمكنك تعديل البوت.'];
  if (target.id === target.guild?.ownerId) return [false, '❌ لا يمكنك تعديل صاحب السيرفر.'];
  const isAdminUser = moderator.permissions?.has('Administrator');
  if (!isAdminUser && moderator.roles.highest.position <= target.roles.highest.position) return [false, '❌ رتبة العضو أعلى.'];
  if (botMember && botMember.roles.highest.position <= target.roles.highest.position) return [false, '❌ رتبة العضو أعلى من البوت.'];
  return [true, ''];
}

export async function replyHelper(target, options = {}, isSlash = false) {
  const payload = {};
  if (options.content) payload.content = options.content;
  if (options.embed) payload.embeds = [options.embed];
  if (options.embeds) payload.embeds = options.embeds;
  if (options.components) payload.components = options.components;
  if (isSlash) {
    payload.ephemeral = options.ephemeral ?? false;
    if (target.deferred || target.replied) return target.followUp(payload).catch(() => {});
    return target.reply(payload).catch(() => {});
  }
  return target.reply(payload).catch(() => {});
}

export async function sendTempError(message, description, timeout = 5000) {
  const msg = await message.reply({ embeds: [errorEmbed(description)] });
  if (timeout > 0) setTimeout(() => msg.delete().catch(() => {}), timeout);
  return msg;
}

export async function sendTempSuccess(message, description, timeout = 5000) {
  const msg = await message.reply({ embeds: [successEmbed(description)] });
  if (timeout > 0) setTimeout(() => msg.delete().catch(() => {}), timeout);
  return msg;
}

// ============================================
// PROCESSED MESSAGES (aliases + custom_commands)
// ============================================

/**
 * Set يحفظ IDs الرسائل اللي اتعالجت
 * يستخدم لمنع التكرار بين aliases و custom_commands
 */
const processedMessages = new Set();
const MAX_PROCESSED = 1000;

/**
 * حط علامة إن الرسالة اتعالجت
 */
export function markMessageProcessed(messageId) {
  if (!messageId) return;
  processedMessages.add(String(messageId));

  // لو زاد العدد، احذف الأقدم
  if (processedMessages.size > MAX_PROCESSED) {
    const arr = Array.from(processedMessages);
    const toDelete = arr.slice(0, arr.length - MAX_PROCESSED);
    for (const id of toDelete) processedMessages.delete(id);
  }
}

/**
 * تحقق لو الرسالة اتعالجت
 */
export function isMessageProcessed(messageId) {
  if (!messageId) return false;
  return processedMessages.has(String(messageId));
}

/**
 * امسح كل الرسائل المعالجة (للتطوير)
 */
export function clearProcessedMessages() {
  processedMessages.clear();
}

// ============================================
// Export default — نضيف الجديد
// ============================================

// ============================================
// I18N TRANSLATIONS
// ============================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename_t = fileURLToPath(import.meta.url);
const __dirname_t = dirname(__filename_t);

// حمّل translations.json مرة واحدة
let translationsCache = null;

function loadTranslations() {
  if (translationsCache) return translationsCache;
  try {
    const path = join(__dirname_t, 'translations.json');
    translationsCache = JSON.parse(readFileSync(path, 'utf8'));
    return translationsCache;
  } catch (err) {
    console.error('❌ Failed to load translations.json:', err.message);
    translationsCache = { ar: {}, en: {} };
    return translationsCache;
  }
}

/**
 * t() — helper للترجمة
 *
 * @param {string} lang - 'ar' أو 'en'
 * @param {string} section - اسم القسم (help, moderation, adminPanel, ...)
 * @param {string} key - اسم المفتاح
 * @param {object} vars - متغيرات للـ replace {key: value}
 * @returns {string} - النص المترجم
 *
 * @example
 *   t('ar', 'moderation', 'mod_ban_success', { user: 'Ali', reason: 'spam' })
 *   t('en', 'help', 'home_title')
 */
export function t(lang, section, key, vars = {}) {
  const t_all = loadTranslations();

  // ✅ تأكد من اللغة
  if (!t_all[lang]) lang = 'ar';
  if (!t_all[lang]) return `[${section}.${key}]`;

  // ✅ تأكد من القسم
  const section_data = t_all[lang][section];
  if (!section_data) {
    // fallback → 'en'
    if (t_all.en?.[section]) {
      const en_val = t_all.en[section][key];
      if (en_val) return replaceVars(en_val, vars);
    }
    return `[${lang}.${section}.${key}]`;
  }

  // ✅ المفتاح
  let text = section_data[key];
  if (!text) {
    // fallback → 'en'
    if (t_all.en?.[section]?.[key]) {
      text = t_all.en[section][key];
    } else {
      return `[${lang}.${section}.${key}]`;
    }
  }

  return replaceVars(text, vars);
}

/**
 * replaceVars() — استبدال {var} بـ value
 */
function replaceVars(text, vars) {
  if (!text || !vars) return text || '';
  for (const [key, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return text;
}

/**
 * tAll() — helper لترجمة سريعة لكائن كامل
 */
export function tAll(section, lang = 'ar') {
  const t_all = loadTranslations();
  return t_all[lang]?.[section] || {};
}

/**
 * tLang() — اختصار: يرجع دالة t مع اللغة محددة
 * مثال:
 *   const T = tLang('ar');
 *   T('moderation', 'mod_ban_success', { user: 'Ali', reason: 'spam' })
 */
export function tLang(lang) {
  return (section, key, vars = {}) => t(lang, section, key, vars);
}
