/**
 * logging.js
 * ============================================
 * نظام السجلات الكامل — Node.js
 * ============================================
 */

import {
  EmbedBuilder,
  ChannelType,
  AuditLogEvent,
  PermissionFlagsBits,
} from 'discord.js';

import {
  logDB,
  logging as actionLogger,
  guilds,
  db,
} from '../database.js';

import {
  logger,
  errorEmbed,
  successEmbed,
  replyHelper,
  t,
} from '../utils.js';

import {
  DEFAULT_COOLDOWN,
  LOG_TYPES,
} from '../constants.js';

// ============================================
// Helper: اللغة
// ============================================
async function getLang(guildId) {
  try {
    return guilds.getLanguage(guildId) || 'ar';
  } catch {
    return 'ar';
  }
}

// ============================================
// إرسال embed لقناة السجل
// ============================================
async function sendLog(client, guildId, eventType, embed) {
  try {
    const channelId = logDB.get(guildId, eventType);
    if (!channelId) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    await channel.send({ embeds: [embed] }).catch((e) => {
      logger.debug(`log send failed (${eventType}):`, e.message);
    });
  } catch (err) {
    logger.debug('sendLog error:', err.message);
  }
}

// ============================================
// اختصار: بناء embed
// ============================================
function makeEmbed(title, color, fields = [], extra = {}) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: '📋 MATRIX Logs' });

  if (fields.length) embed.addFields(...fields);
  if (extra.thumbnail) embed.setThumbnail(extra.thumbnail);
  if (extra.description) embed.setDescription(extra.description);

  return embed;
}

// ============================================
// الأوامر
// ============================================
export const commands = [

  // ═══════════════════════════════════════════
  // SETLOG — قناة السجل الافتراضية لكل الأنواع
  // ═══════════════════════════════════════════
  {
    name: 'setlog',
    description: 'تعيين قناة لكل أنواع السجلات',
    usage: '=setlog [#channel]',
    aliases: ['تعيين_سجل'],
    category: 'logging',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const channel = message.mentions.channels.first() || message.channel;
      if (channel.type !== ChannelType.GuildText) {
        return replyHelper(message, {
          embeds: [errorEmbed('❌ Text channels only.')],
        });
      }

      let count = 0;
      for (const eventType of Object.keys(LOG_TYPES)) {
        try {
          logDB.set(message.guild.id, eventType, channel.id, true);
          count++;
        } catch {}
      }

      return replyHelper(message, {
        embeds: [
          successEmbed(
            lang === 'ar'
              ? `✅ تم تعيين ${channel} لـ **${count}** نوع سجل.`
              : `✅ Set ${channel} for **${count}** log types.`
          ),
        ],
      });
    },
  },

  // ═══════════════════════════════════════════
  // SETLOGCHANNEL — قناة لنوع معيّن
  // ═══════════════════════════════════════════
  {
    name: 'setlogchannel',
    description: 'تعيين قناة لنوع سجل معيّن',
    usage: '=setlogchannel <type> [#channel]',
    aliases: ['setlogch', 'قناة_سجل'],
    category: 'logging',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const type = (args[0] || '').toLowerCase();
      if (!type || !LOG_TYPES[type]) {
        const list = Object.keys(LOG_TYPES).join(', ');
        return replyHelper(message, {
          embeds: [
            errorEmbed(
              (lang === 'ar'
                ? '❌ نوع غير معروف. الأنواع المتاحة:\n'
                : '❌ Unknown type. Available:\n') + `\`${list}\``
            ),
          ],
        });
      }

      const channel = message.mentions.channels.first() || message.channel;
      if (channel.type !== ChannelType.GuildText) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Text channels only.')] });
      }

      try {
        logDB.set(message.guild.id, type, channel.id, true);
        return replyHelper(message, {
          embeds: [
            successEmbed(
              lang === 'ar'
                ? `✅ تم تعيين ${channel} لـ \`${type}\` (${LOG_TYPES[type]}).`
                : `✅ Set ${channel} for \`${type}\` (${LOG_TYPES[type]}).`
            ),
          ],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // LOGCONFIG — عرض الإعدادات
  // ═══════════════════════════════════════════
  {
    name: 'logconfig',
    description: 'عرض إعدادات السجلات',
    usage: '=logconfig',
    aliases: ['اعدادات_السجل', 'logsconfig'],
    category: 'logging',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const settings = logDB.getAll(message.guild.id);
      const embed = new EmbedBuilder()
        .setTitle(lang === 'ar' ? '📋 إعدادات السجلات' : '📋 Log Settings')
        .setColor(0x5865f2)
        .setTimestamp();

      for (const [type, label] of Object.entries(LOG_TYPES)) {
        const cfg = settings[type];
        let value;
        if (!cfg || !cfg.channel_id) {
          value = lang === 'ar' ? '❌ غير مُعيّن' : '❌ Not set';
        } else if (!cfg.enabled) {
          value = lang === 'ar' ? '⏸ مُعطّل' : '⏸ Disabled';
        } else {
          const ch = message.guild.channels.cache.get(cfg.channel_id);
          value = ch ? `✅ ${ch.toString()}` : `⚠️ محذوفة (${cfg.channel_id})`;
        }
        embed.addFields({ name: label, value, inline: true });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // TOGGLELOG — تفعيل/تعطيل نوع
  // ═══════════════════════════════════════════
  {
    name: 'togglelog',
    description: 'تفعيل/تعطيل نوع سجل',
    usage: '=togglelog <type>',
    aliases: ['تبديل_سجل'],
    category: 'logging',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const type = (args[0] || '').toLowerCase();
      if (!type || !LOG_TYPES[type]) {
        return replyHelper(message, {
          embeds: [errorEmbed(`❌ Invalid type. Use: \`${Object.keys(LOG_TYPES).join(', ')}\``)],
        });
      }

      const current = logDB.getAll(message.guild.id)[type];
      if (!current || !current.channel_id) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ النوع غير مُعيّن بعد.' : '❌ Type not configured yet.')],
        });
      }

      const newEnabled = !current.enabled;
      try {
        logDB.set(message.guild.id, type, current.channel_id, newEnabled);
        return replyHelper(message, {
          embeds: [
            successEmbed(
              newEnabled
                ? `✅ ${lang === 'ar' ? 'تم تفعيل' : 'Enabled'} \`${type}\``
                : `⏸ ${lang === 'ar' ? 'تم تعطيل' : 'Disabled'} \`${type}\``
            ),
          ],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // TESTLOG — اختبار
  // ═══════════════════════════════════════════
  {
    name: 'testlog',
    description: 'اختبار قناة سجل',
    usage: '=testlog <type>',
    aliases: ['اختبار_سجل'],
    category: 'logging',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const type = (args[0] || '').toLowerCase();
      if (!type || !LOG_TYPES[type]) {
        return replyHelper(message, {
          embeds: [errorEmbed(`❌ Invalid type. Use: \`${Object.keys(LOG_TYPES).join(', ')}\``)],
        });
      }

      const channelId = logDB.get(message.guild.id, type);
      if (!channelId) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ النوع غير مُعيّن.' : '❌ Type not configured.')],
        });
      }

      const testEmbed = makeEmbed(
        `🧪 ${LOG_TYPES[type]}`,
        0x57f287,
        [
          { name: lang === 'ar' ? 'النوع' : 'Type', value: `\`${type}\``, inline: true },
          { name: lang === 'ar' ? 'القناة' : 'Channel', value: `<#${channelId}>`, inline: true },
          { name: lang === 'ar' ? 'الحالة' : 'Status', value: '✅ Test OK', inline: true },
        ],
        { description: lang === 'ar' ? 'هذه رسالة تجريبية.' : 'This is a test message.' }
      );

      try {
        const ch = message.guild.channels.cache.get(channelId);
        if (!ch) return replyHelper(message, { embeds: [errorEmbed('❌ Channel not found.')] });

        await ch.send({ embeds: [testEmbed] });
        return replyHelper(message, {
          embeds: [successEmbed(lang === 'ar' ? `✅ تم الإرسال إلى <#${channelId}>.` : `✅ Sent to <#${channelId}>.`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // LOGS — عرض آخر الأحداث من action_logs
  // ═══════════════════════════════════════════
  {
    name: 'logs',
    description: 'عرض آخر الأحداث',
    usage: '=logs [type] [count]',
    aliases: ['سجلات', 'actionlogs'],
    category: 'logging',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const type = args[0] && args[0].toLowerCase() !== 'all' ? args[0].toLowerCase() : null;
      const count = Math.min(Math.max(parseInt(args[1]) || 15, 1), 30);

      let rows;
      try {
        if (type) {
          rows = db.prepare(
            'SELECT * FROM action_logs WHERE guild_id = ? AND action_type = ? ORDER BY created_at DESC LIMIT ?'
          ).all(message.guild.id, type, count);
        } else {
          rows = db.prepare(
            'SELECT * FROM action_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?'
          ).all(message.guild.id, count);
        }
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ DB error.')] });
      }

      if (!rows.length) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '⚠️ لا توجد أحداث.' : '⚠️ No events.')],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📋 ${lang === 'ar' ? 'آخر' : 'Last'} ${rows.length} ${lang === 'ar' ? 'حدث' : 'events'}`)
        .setColor(0x5865f2)
        .setTimestamp();

      for (const r of rows) {
        const ts = `<t:${r.created_at}:R>`;
        const actor = r.actor_id && r.actor_id !== '0' ? `<@${r.actor_id}>` : '—';
        const target = r.target_id && r.target_id !== '0' ? `<@${r.target_id}>` : '—';
        embed.addFields({
          name: `\`${r.action_type}\` • ${ts}`,
          value: `${lang === 'ar' ? 'بواسطة' : 'By'}: ${actor} • ${lang === 'ar' ? 'الهدف' : 'Target'}: ${target}${
            r.details ? `\n> ${String(r.details).slice(0, 120)}` : ''
          }`,
          inline: false,
        });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // CLEARLOGS — مسح الإعدادات
  // ═══════════════════════════════════════════
  {
    name: 'clearlogs',
    description: 'مسح كل إعدادات السجلات',
    usage: '=clearlogs',
    aliases: ['مسح_سجلات'],
    category: 'logging',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ Admin only.' : '❌ Admin only.')],
        });
      }

      try {
        const removed = logDB.clear(message.guild.id);
        return replyHelper(message, {
          embeds: [
            successEmbed(
              lang === 'ar'
                ? `✅ تم مسح **${removed}** إعداد سجل.`
                : `✅ Cleared **${removed}** log settings.`
            ),
          ],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },
];

// ============================================
// Listeners
// ============================================
export function registerLoggingListeners(client) {

  // ═══════════════════════════════════════════
  // messageDelete
  // ═══════════════════════════════════════════
  client.on('messageDelete', async (msg) => {
    try {
      if (!msg.guild || msg.author?.bot) return;
      const guildId = msg.guild.id;
      if (!logDB.get(guildId, 'message_delete')) return;

      const embed = makeEmbed(
        '🗑 Message Deleted',
        0xed4245,
        [
          { name: '👤 Author', value: msg.author ? `${msg.author.tag} (${msg.author.id})` : 'Unknown', inline: false },
          { name: '📍 Channel', value: msg.channel ? msg.channel.toString() : 'Unknown', inline: true },
          { name: '📝 Content', value: (msg.content || '*[no text / attachment]*').slice(0, 1000), inline: false },
        ],
        { thumbnail: msg.author?.displayAvatarURL({ size: 128 }) }
      );

      await sendLog(client, guildId, 'message_delete', embed);
    } catch (err) {
      logger.debug('messageDelete error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // messageUpdate
  // ═══════════════════════════════════════════
  client.on('messageUpdate', async (oldMsg, newMsg) => {
    try {
      if (!newMsg.guild || newMsg.author?.bot) return;
      if (oldMsg.content === newMsg.content) return;

      const guildId = newMsg.guild.id;
      if (!logDB.get(guildId, 'message_edit')) return;

      const embed = makeEmbed(
        '✏ Message Edited',
        0xfee75c,
        [
          { name: '👤 Author', value: `${newMsg.author.tag} (${newMsg.author.id})`, inline: false },
          { name: '📍 Channel', value: newMsg.channel.toString(), inline: true },
          { name: '🔗 Jump', value: `[Click](${newMsg.url})`, inline: true },
          { name: '📝 Before', value: (oldMsg.content || '*empty*').slice(0, 500), inline: false },
          { name: '📝 After', value: (newMsg.content || '*empty*').slice(0, 500), inline: false },
        ],
        { thumbnail: newMsg.author.displayAvatarURL({ size: 128 }) }
      );

      await sendLog(client, guildId, 'message_edit', embed);
    } catch (err) {
      logger.debug('messageUpdate error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // guildMemberAdd
  // ═══════════════════════════════════════════
  client.on('guildMemberAdd', async (member) => {
    try {
      const guildId = member.guild.id;
      if (!logDB.get(guildId, 'member_join')) return;

      const embed = makeEmbed(
        '📥 Member Joined',
        0x57f287,
        [
          { name: '👤 User', value: `${member.user.tag} (${member.id})`, inline: false },
          { name: '📅 Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: '👥 Member Count', value: `\`${member.guild.memberCount}\``, inline: true },
        ],
        { thumbnail: member.user.displayAvatarURL({ size: 128 }) }
      );

      await sendLog(client, guildId, 'member_join', embed);
    } catch (err) {
      logger.debug('member_join log error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // guildMemberRemove
  // ═══════════════════════════════════════════
  client.on('guildMemberRemove', async (member) => {
    try {
      const guildId = member.guild.id;
      if (!logDB.get(guildId, 'member_leave')) return;

      const roles = member.roles?.cache
        ? member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => r.toString()).slice(0, 10).join(', ')
        : '—';

      const embed = makeEmbed(
        '📤 Member Left',
        0xed4245,
        [
          { name: '👤 User', value: `${member.user.tag} (${member.id})`, inline: false },
          { name: '📅 Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '—', inline: true },
          { name: '👥 Member Count', value: `\`${member.guild.memberCount}\``, inline: true },
          { name: '🎭 Roles', value: roles || '—', inline: false },
        ],
        { thumbnail: member.user.displayAvatarURL({ size: 128 }) }
      );

      await sendLog(client, guildId, 'member_leave', embed);
    } catch (err) {
      logger.debug('member_leave log error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // guildBanAdd
  // ═══════════════════════════════════════════
  client.on('guildBanAdd', async (ban) => {
    try {
      const guildId = ban.guild.id;
      if (!logDB.get(guildId, 'guild_ban')) return;

      const embed = makeEmbed(
        '🔨 User Banned',
        0xed4245,
        [
          { name: '👤 User', value: `${ban.user.tag} (${ban.user.id})`, inline: false },
          { name: '📝 Reason', value: (ban.reason || '*no reason*').slice(0, 500), inline: false },
        ],
        { thumbnail: ban.user.displayAvatarURL({ size: 128 }) }
      );

      await sendLog(client, guildId, 'guild_ban', embed);
    } catch (err) {
      logger.debug('guild_ban log error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // guildBanRemove
  // ═══════════════════════════════════════════
  client.on('guildBanRemove', async (ban) => {
    try {
      const guildId = ban.guild.id;
      if (!logDB.get(guildId, 'guild_unban')) return;

      const embed = makeEmbed(
        '🔓 User Unbanned',
        0x57f287,
        [
          { name: '👤 User', value: `${ban.user.tag} (${ban.user.id})`, inline: false },
        ],
        { thumbnail: ban.user.displayAvatarURL({ size: 128 }) }
      );

      await sendLog(client, guildId, 'guild_unban', embed);
    } catch (err) {
      logger.debug('guild_unban log error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // channelCreate
  // ═══════════════════════════════════════════
  client.on('channelCreate', async (channel) => {
    try {
      if (!channel.guild) return;
      const guildId = channel.guild.id;
      if (!logDB.get(guildId, 'channel_create')) return;

      const embed = makeEmbed(
        '📝 Channel Created',
        0x57f287,
        [
          { name: '📍 Channel', value: `${channel.toString()} (${channel.name})`, inline: false },
          { name: '🆔 ID', value: `\`${channel.id}\``, inline: true },
          { name: '📎 Type', value: `\`${channel.type}\``, inline: true },
        ]
      );

      await sendLog(client, guildId, 'channel_create', embed);
    } catch (err) {
      logger.debug('channel_create log error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // channelDelete
  // ═══════════════════════════════════════════
  client.on('channelDelete', async (channel) => {
    try {
      if (!channel.guild) return;
      const guildId = channel.guild.id;
      if (!logDB.get(guildId, 'channel_delete')) return;

      const embed = makeEmbed(
        '🗑 Channel Deleted',
        0xed4245,
        [
          { name: '📍 Channel', value: `#${channel.name}`, inline: false },
          { name: '🆔 ID', value: `\`${channel.id}\``, inline: true },
          { name: '📎 Type', value: `\`${channel.type}\``, inline: true },
        ]
      );

      await sendLog(client, guildId, 'channel_delete', embed);
    } catch (err) {
      logger.debug('channel_delete log error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // guildMemberUpdate (Role add/remove)
  // ═══════════════════════════════════════════
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      const guildId = newMember.guild.id;

      // Roles added
      const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
      const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

      if (added.size && logDB.get(guildId, 'role_add')) {
        const embed = makeEmbed(
          '➕ Roles Added',
          0x57f287,
          [
            { name: '👤 Member', value: `${newMember.user.tag} (${newMember.id})`, inline: false },
            { name: '🎭 Roles', value: added.map((r) => r.toString()).join(', ').slice(0, 1000), inline: false },
          ],
          { thumbnail: newMember.user.displayAvatarURL({ size: 128 }) }
        );
        await sendLog(client, guildId, 'role_add', embed);
      }

      if (removed.size && logDB.get(guildId, 'role_remove')) {
        const embed = makeEmbed(
          '➖ Roles Removed',
          0xed4245,
          [
            { name: '👤 Member', value: `${newMember.user.tag} (${newMember.id})`, inline: false },
            { name: '🎭 Roles', value: removed.map((r) => r.toString()).join(', ').slice(0, 1000), inline: false },
          ],
          { thumbnail: newMember.user.displayAvatarURL({ size: 128 }) }
        );
        await sendLog(client, guildId, 'role_remove', embed);
      }
    } catch (err) {
      logger.debug('guildMemberUpdate log error:', err.message);
    }
  });

  // ═══════════════════════════════════════════
  // voiceStateUpdate
  // ═══════════════════════════════════════════
  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      const guildId = newState.guild.id;
      const member = newState.member;
      if (!member || member.user.bot) return;

      // Joined voice
      if (!oldState.channelId && newState.channelId) {
        if (!logDB.get(guildId, 'voice_join')) return;
        const embed = makeEmbed(
          '🔊 Voice Join',
          0x57f287,
          [
            { name: '👤 Member', value: member.toString(), inline: false },
            { name: '🔊 Channel', value: `<#${newState.channelId}>`, inline: true },
          ],
          { thumbnail: member.user.displayAvatarURL({ size: 128 }) }
        );
        await sendLog(client, guildId, 'voice_join', embed);
      }

      // Left voice
      if (oldState.channelId && !newState.channelId) {
        if (!logDB.get(guildId, 'voice_leave')) return;
        const embed = makeEmbed(
          '🔇 Voice Leave',
          0xed4245,
          [
            { name: '👤 Member', value: member.toString(), inline: false },
            { name: '🔊 Channel', value: `<#${oldState.channelId}>`, inline: true },
          ],
          { thumbnail: member.user.displayAvatarURL({ size: 128 }) }
        );
        await sendLog(client, guildId, 'voice_leave', embed);
      }
    } catch (err) {
      logger.debug('voiceStateUpdate log error:', err.message);
    }
  });

  logger.info('✅ Logging listeners registered');
}

export default { commands, registerLoggingListeners };
