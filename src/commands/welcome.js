/**
 * welcome.js
 * ============================================
 * نظام الترحيب والوداع + Autorole — Node.js
 * ============================================
 */

import {
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';

import {
  welcomeDB,
  guilds,
  db,
} from '../database.js';

import {
  logger,
  errorEmbed,
  successEmbed,
  replyHelper,
  getMemberFromInput,
  discordRetry,
} from '../utils.js';

import {
  DEFAULT_COOLDOWN,
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
// استبدال المتغيرات في الرسالة
// ============================================
function renderTemplate(template, member, guild) {
  if (!template) return '';
  return template
    .replace(/\{user\}/g, member.toString())
    .replace(/\{user\.name\}/g, member.user.username)
    .replace(/\{user\.tag\}/g, member.user.tag)
    .replace(/\{user\.id\}/g, member.id)
    .replace(/\{user\.mention\}/g, member.toString())
    .replace(/\{user\.avatar\}/g, member.displayAvatarURL({ size: 256 }))
    .replace(/\{server\}/g, guild.name)
    .replace(/\{server\.name\}/g, guild.name)
    .replace(/\{server\.id\}/g, guild.id)
    .replace(/\{server\.membercount\}/g, String(guild.memberCount))
    .replace(/\{membercount\}/g, String(guild.memberCount))
    .replace(/\{count\}/g, String(guild.memberCount))
    .replace(/\{createdat\}/g, `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`)
    .replace(/\{createdago\}/g, `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`);
}

// ============================================
// الأوامر
// ============================================
export const commands = [

  // ═══════════════════════════════════════════
  // WELCOME — عرض الحالة
  // ═══════════════════════════════════════════
  {
    name: 'welcome',
    description: 'عرض إعدادات الترحيب',
    usage: '=welcome',
    aliases: ['ترحيب'],
    category: 'welcome',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const cfg = welcomeDB.getConfig(message.guild.id);

      const welcomeCh = cfg.welcome_channel_id
        ? message.guild.channels.cache.get(cfg.welcome_channel_id)
        : null;
      const goodbyeCh = cfg.goodbye_channel_id
        ? message.guild.channels.cache.get(cfg.goodbye_channel_id)
        : null;
      const autoRole = cfg.autorole_id
        ? message.guild.roles.cache.get(cfg.autorole_id)
        : null;

      const embed = new EmbedBuilder()
        .setTitle(lang === 'ar' ? '👋 إعدادات الترحيب' : '👋 Welcome Settings')
        .setColor(0x5865f2)
        .setTimestamp()
        .addFields(
          {
            name: lang === 'ar' ? '📥 قناة الترحيب' : '📥 Welcome Channel',
            value: welcomeCh ? welcomeCh.toString() : (lang === 'ar' ? '❌ غير مُعيّن' : '❌ Not set'),
            inline: true,
          },
          {
            name: lang === 'ar' ? '📤 قناة الوداع' : '📤 Goodbye Channel',
            value: goodbyeCh ? goodbyeCh.toString() : (lang === 'ar' ? '❌ غير مُعيّن' : '❌ Not set'),
            inline: true,
          },
          {
            name: lang === 'ar' ? '🎭 رتبة تلقائية' : '🎭 Auto Role',
            value: autoRole ? autoRole.toString() : (lang === 'ar' ? '❌ غير مُعيّن' : '❌ Not set'),
            inline: true,
          },
          {
            name: lang === 'ar' ? '📝 رسالة الترحيب' : '📝 Welcome Message',
            value: cfg.welcome_message
              ? `\`\`\`${cfg.welcome_message.slice(0, 300)}\`\`\``
              : (lang === 'ar' ? '— افتراضي —' : '— default —'),
            inline: false,
          },
          {
            name: lang === 'ar' ? '📝 رسالة الوداع' : '📝 Goodbye Message',
            value: cfg.goodbye_message
              ? `\`\`\`${cfg.goodbye_message.slice(0, 300)}\`\`\``
              : (lang === 'ar' ? '— افتراضي —' : '— default —'),
            inline: false,
          }
        )
        .setFooter({
          text: lang === 'ar'
            ? 'استخدم =setwelcome / =setgoodbye / =autorole'
            : 'Use =setwelcome / =setgoodbye / =autorole',
        });

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // SETWELCOME — تعيين قناة/رسالة الترحيب
  // ═══════════════════════════════════════════
  {
    name: 'setwelcome',
    description: 'تعيين قناة ورسالة الترحيب',
    usage: '=setwelcome [#channel] [message]',
    aliases: ['تعيين_ترحيب'],
    category: 'welcome',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const channel = message.mentions.channels.first() || null;
      const msgText = args
        .filter((a) => !a.startsWith('<#'))
        .join(' ')
        .trim();

      if (!channel && !msgText) {
        return replyHelper(message, {
          embeds: [
            errorEmbed(
              lang === 'ar'
                ? '❌ الاستخدام: `=setwelcome #قناة مرحباً {user}`'
                : '❌ Usage: `=setwelcome #channel Welcome {user}`'
            ),
          ],
        });
      }

      try {
        if (channel) {
          welcomeDB.setWelcomeChannel(message.guild.id, channel.id);
        }
        if (msgText) {
          welcomeDB.setWelcomeMessage(message.guild.id, msgText);
        }

        const parts = [];
        if (channel) parts.push(`✅ ${lang === 'ar' ? 'القناة' : 'Channel'}: ${channel.toString()}`);
        if (msgText) parts.push(`✅ ${lang === 'ar' ? 'الرسالة' : 'Message'}: \`${msgText.slice(0, 100)}\``);

        return replyHelper(message, {
          embeds: [successEmbed(parts.join('\n'))],
        });
      } catch (err) {
        logger.error('setwelcome error:', err.message);
        return replyHelper(message, {
          embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))],
        });
      }
    },
  },

  // ═══════════════════════════════════════════
  // SETGOODBYE — تعيين قناة/رسالة الوداع
  // ═══════════════════════════════════════════
  {
    name: 'setgoodbye',
    description: 'تعيين قناة ورسالة الوداع',
    usage: '=setgoodbye [#channel] [message]',
    aliases: ['تعيين_وداع'],
    category: 'welcome',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const channel = message.mentions.channels.first() || null;
      const msgText = args
        .filter((a) => !a.startsWith('<#'))
        .join(' ')
        .trim();

      if (!channel && !msgText) {
        return replyHelper(message, {
          embeds: [
            errorEmbed(
              lang === 'ar'
                ? '❌ الاستخدام: `=setgoodbye #قناة وداعاً {user.name}`'
                : '❌ Usage: `=setgoodbye #channel Goodbye {user.name}`'
            ),
          ],
        });
      }

      try {
        if (channel) {
          welcomeDB.setGoodbyeChannel(message.guild.id, channel.id);
        }
        if (msgText) {
          welcomeDB.setGoodbyeMessage(message.guild.id, msgText);
        }

        const parts = [];
        if (channel) parts.push(`✅ ${lang === 'ar' ? 'القناة' : 'Channel'}: ${channel.toString()}`);
        if (msgText) parts.push(`✅ ${lang === 'ar' ? 'الرسالة' : 'Message'}: \`${msgText.slice(0, 100)}\``);

        return replyHelper(message, {
          embeds: [successEmbed(parts.join('\n'))],
        });
      } catch (err) {
        logger.error('setgoodbye error:', err.message);
        return replyHelper(message, {
          embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))],
        });
      }
    },
  },

  // ═══════════════════════════════════════════
  // AUTOROLE — رتبة تلقائية
  // ═══════════════════════════════════════════
  {
    name: 'autorole',
    description: 'تعيين/عرض الرتبة التلقائية للأعضاء الجدد',
    usage: '=autorole [@role|none]',
    aliases: ['رتبة_تلقائية'],
    category: 'welcome',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      // عرض
      if (!args[0]) {
        const cfg = welcomeDB.getConfig(message.guild.id);
        const role = cfg.autorole_id
          ? message.guild.roles.cache.get(cfg.autorole_id)
          : null;

        const embed = new EmbedBuilder()
          .setTitle(lang === 'ar' ? '🎭 الرتبة التلقائية' : '🎭 Auto Role')
          .setColor(0x5865f2)
          .setDescription(
            role
              ? `✅ ${role.toString()}`
              : lang === 'ar'
                ? '❌ غير مُعيّنة. استخدم `=autorole @role`'
                : '❌ Not set. Use `=autorole @role`'
          );

        return replyHelper(message, { embeds: [embed] });
      }

      // إزالة
      if (args[0].toLowerCase() === 'none' || args[0] === 'إزالة' || args[0] === 'مسح') {
        welcomeDB.setAutoRole(message.guild.id, null);
        return replyHelper(message, {
          embeds: [successEmbed(lang === 'ar' ? '✅ تم إزالة الرتبة التلقائية.' : '✅ Auto role removed.')],
        });
      }

      // تعيين
      const role = message.mentions.roles.first();
      if (!role) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ رتبة غير موجودة.' : '❌ Role not found.')],
        });
      }

      const me = message.guild.members.me;
      if (role.position >= me.roles.highest.position) {
        return replyHelper(message, {
          embeds: [
            errorEmbed(
              lang === 'ar'
                ? '❌ الرتبة أعلى من أعلى رتبة للبوت.'
                : "❌ Role is higher than bot's highest role."
            ),
          ],
        });
      }

      if (role.managed) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ الرتبة مُدارة.' : '❌ Role is managed.')],
        });
      }

      try {
        welcomeDB.setAutoRole(message.guild.id, role.id);
        return replyHelper(message, {
          embeds: [successEmbed(`✅ ${lang === 'ar' ? 'تم تعيين' : 'Set'}: ${role.toString()}`)],
        });
      } catch (err) {
        return replyHelper(message, {
          embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))],
        });
      }
    },
  },

  // ═══════════════════════════════════════════
  // TESTWELCOME — اختبار
  // ═══════════════════════════════════════════
  {
    name: 'testwelcome',
    description: 'اختبار رسالة الترحيب',
    usage: '=testwelcome',
    aliases: ['اختبار_ترحيب'],
    category: 'welcome',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, {
          embeds: [errorEmbed(lang === 'ar' ? '❌ ليس لديك صلاحية.' : '❌ No permission.')],
        });
      }

      const cfg = welcomeDB.getConfig(message.guild.id);
      const ch = cfg.welcome_channel_id
        ? message.guild.channels.cache.get(cfg.welcome_channel_id)
        : message.channel;

      if (!ch) {
        return replyHelper(message, {
          embeds: [errorEmbed('❌ Channel not found.')],
        });
      }

      const template =
        cfg.welcome_message ||
        (lang === 'ar' ? '👋 مرحباً {user} في **{server}**!' : '👋 Welcome {user} to **{server}**!');

      const rendered = renderTemplate(template, message.member, message.guild);

      const embed = new EmbedBuilder()
        .setTitle(lang === 'ar' ? '🧪 اختبار الترحيب' : '🧪 Welcome Test')
        .setDescription(rendered)
        .setColor(0x57f287)
        .setThumbnail(message.author.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      try {
        await ch.send({ embeds: [embed] });
        if (ch.id !== message.channel.id) {
          return replyHelper(message, {
            embeds: [successEmbed(lang === 'ar' ? `✅ تم الإرسال إلى ${ch}.` : `✅ Sent to ${ch}.`)],
          });
        }
      } catch (err) {
        return replyHelper(message, {
          embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))],
        });
      }
    },
  },

  // ═══════════════════════════════════════════
  // WELCOMEINFO — معلومات المتغيرات
  // ═══════════════════════════════════════════
  {
    name: 'welcomeinfo',
    description: 'عرض متغيرات رسائل الترحيب',
    usage: '=welcomeinfo',
    aliases: ['معلومات_ترحيب'],
    category: 'welcome',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);

      const vars = [
        '`{user}` — ' + (lang === 'ar' ? 'منشن العضو' : 'member mention'),
        '`{user.name}` — ' + (lang === 'ar' ? 'اسم العضو' : 'username'),
        '`{user.tag}` — ' + (lang === 'ar' ? 'الاسم#التاج' : 'name#tag'),
        '`{user.id}` — ' + (lang === 'ar' ? 'الـ ID' : 'user ID'),
        '`{user.avatar}` — ' + (lang === 'ar' ? 'صورة العضو' : 'avatar URL'),
        '`{server}` — ' + (lang === 'ar' ? 'اسم السيرفر' : 'server name'),
        '`{server.id}` — ' + (lang === 'ar' ? 'ID السيرفر' : 'server ID'),
        '`{membercount}` — ' + (lang === 'ar' ? 'عدد الأعضاء' : 'member count'),
        '`{count}` — ' + (lang === 'ar' ? 'نفس ما فوق' : 'alias'),
        '`{createdat}` — ' + (lang === 'ar' ? 'تاريخ إنشاء الحساب' : 'account creation'),
        '`{createdago}` — ' + (lang === 'ar' ? 'منذ كم أُنشئ' : 'account age'),
      ];

      const embed = new EmbedBuilder()
        .setTitle(lang === 'ar' ? '📝 متغيرات الرسائل' : '📝 Template Variables')
        .setDescription(vars.join('\n'))
        .setColor(0x5865f2)
        .setFooter({
          text:
            lang === 'ar'
              ? 'مثال: =setwelcome #general مرحباً {user} في {server}!'
              : 'Example: =setwelcome #general Welcome {user} to {server}!',
        });

      return replyHelper(message, { embeds: [embed] });
    },
  },
];

// ============================================
// Listeners — welcome + goodbye + autorole
// ============================================
export function registerWelcomeListeners(client) {
  // عند انضمام عضو
  client.on('guildMemberAdd', async (member) => {
    try {
      const cfg = welcomeDB.getConfig(member.guild.id);
      if (!cfg) return;

      // Autorole
      if (cfg.autorole_id) {
        const role = member.guild.roles.cache.get(cfg.autorole_id);
        if (role && role.position < member.guild.members.me.roles.highest.position && !role.managed) {
          try {
            await discordRetry(member.roles.add.bind(member.roles), role, 'Auto role');
          } catch (err) {
            logger.debug('autorole add failed:', err.message);
          }
        }
      }

      // Welcome message
      if (cfg.welcome_channel_id) {
        const ch = member.guild.channels.cache.get(cfg.welcome_channel_id);
        if (ch && ch.type === ChannelType.GuildText) {
          const template =
            cfg.welcome_message ||
            '👋 مرحباً {user} في **{server}**! أنت العضو رقم **{membercount}**';
          const rendered = renderTemplate(template, member, member.guild);

          const embed = new EmbedBuilder()
            .setTitle('👋 ' + (member.guild.name))
            .setDescription(rendered.slice(0, 4000))
            .setColor(0x57f287)
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: `ID: ${member.id}` })
            .setTimestamp();

          await ch.send({ content: member.toString(), embeds: [embed] }).catch((e) => {
            logger.debug('welcome send failed:', e.message);
          });
        }
      }
    } catch (err) {
      logger.error('guildMemberAdd error:', err.message);
    }
  });

  // عند خروج عضو
  client.on('guildMemberRemove', async (member) => {
    try {
      const cfg = welcomeDB.getConfig(member.guild.id);
      if (!cfg || !cfg.goodbye_channel_id) return;

      const ch = member.guild.channels.cache.get(cfg.goodbye_channel_id);
      if (!ch || ch.type !== ChannelType.GuildText) return;

      const template =
        cfg.goodbye_message ||
        '👋 وداعاً **{user.name}** — غادر السيرفر.';

      // {user} قد لا يعمل بعد الخروج — نعمل member object بديل
      const fakeMember = member.partial ? await member.fetch().catch(() => member) : member;
      const rendered = renderTemplate(template, fakeMember, member.guild);

      const embed = new EmbedBuilder()
        .setTitle('👋 Goodbye')
        .setDescription(rendered.slice(0, 4000))
        .setColor(0xed4245)
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();

      await ch.send({ embeds: [embed] }).catch((e) => {
        logger.debug('goodbye send failed:', e.message);
      });
    } catch (err) {
      logger.error('guildMemberRemove error:', err.message);
    }
  });

  logger.info('✅ Welcome listeners registered');
}

export default { commands, registerWelcomeListeners };
