/**
 * custom-commands.js
 * ============================================
 * الأوامر المخصصة — Node.js
 * ============================================
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';

import {
  guilds,
  customCmdsDB,
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
  DANGEROUS_COOLDOWN,
  CONFIRMATION_TIMEOUT,
  MAX_CUSTOM_COMMANDS,
  MAX_TRIGGER_LENGTH,
  MAX_RESPONSE_LENGTH,
  AVAILABLE_COMMANDS,
  cleanCommandName,
} from '../constants.js';

// ============================================
// Helper
// ============================================
async function getLang(guildId) {
  try {
    return guilds.getLanguage(guildId) || 'ar';
  } catch {
    return 'ar';
  }
}

function tr(lang, key, vars = {}) {
  let text = t(lang, 'customCmd', key) || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return text;
}

function renderVars(text, message, args) {
  return text
    .replace(/\{user\}/g, message.author.toString())
    .replace(/\{user\.name\}/g, message.author.username)
    .replace(/\{user\.id\}/g, message.author.id)
    .replace(/\{user\.mention\}/g, message.author.toString())
    .replace(/\{server\}/g, message.guild.name)
    .replace(/\{channel\}/g, message.channel.toString())
    .replace(/\{args\}/g, args.join(' '))
    .replace(/\{count\}/g, String(message.guild.memberCount));
}

async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `cc_yes_${authorId}_${Date.now()}`;
  const noId = `cc_no_${authorId}_${Date.now()}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(yesId)
      .setLabel(lang === 'ar' ? '✅ تأكيد' : '✅ Confirm')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(noId)
      .setLabel(lang === 'ar' ? '❌ إلغاء' : '❌ Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  let msg;
  if (isSlash) {
    msg = await target.followUp({ content: prompt, components: [row], fetchReply: true });
  } else {
    msg = await target.reply({ content: prompt, components: [row] });
  }

  return new Promise((resolve) => {
    const filter = (i) => i.user.id === authorId && [yesId, noId].includes(i.customId);
    const collector = msg.createMessageComponentCollector({
      filter,
      time: CONFIRMATION_TIMEOUT * 1000,
      max: 1,
    });
    collector.on('collect', async (i) => {
      await i.update({ components: [] }).catch(() => {});
      resolve(i.customId === yesId);
    });
    collector.on('end', (collected) => {
      if (collected.size === 0) {
        msg.edit({ components: [] }).catch(() => {});
        resolve(false);
      }
    });
  });
}

// ============================================
// الأوامر
// ============================================
export const commands = [

  // ═══════════════════════════════════════════
  // ADDCC — إضافة
  // ═══════════════════════════════════════════
  {
    name: 'addcc',
    description: 'إضافة أمر مخصص',
    usage: '=addcc <trigger> <response>',
    aliases: ['cc', 'customcmd', 'اضافة_امر'],
    category: 'custom',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const trigger = cleanCommandName(args[0]);
      const response = args.slice(1).join(' ').trim();

      if (!trigger) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'cc_trigger_invalid') || '❌ Invalid trigger.')],
        });
      }

      if (!response) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'cc_response_invalid') || '❌ Invalid response.')],
        });
      }

      if (trigger.length > MAX_TRIGGER_LENGTH) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ Max ${MAX_TRIGGER_LENGTH} chars.`)] });
      }

      if (response.length > MAX_RESPONSE_LENGTH) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ Max ${MAX_RESPONSE_LENGTH} chars.`)] });
      }

      if (AVAILABLE_COMMANDS.includes(trigger)) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'cc_already_exists', { name: trigger }) || `⚠️ \`=${trigger}\` already exists.`)],
        });
      }

      const count = customCmdsDB.count(message.guild.id);
      if (count >= MAX_CUSTOM_COMMANDS) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'cc_max_reached', { max: MAX_CUSTOM_COMMANDS }) || `❌ Max ${MAX_CUSTOM_COMMANDS}`)],
        });
      }

      try {
        const ok = customCmdsDB.add(message.guild.id, trigger, response, message.author.id);
        if (!ok) {
          return replyHelper(message, {
            embeds: [errorEmbed(tr(lang, 'cc_already_exists', { name: trigger }) || '⚠️ Already exists.')],
          });
        }

        return replyHelper(message, {
          embeds: [successEmbed(tr(lang, 'cc_add_success', { name: trigger }) || `✅ Added \`=${trigger}\``)],
        });
      } catch (err) {
        logger.error('addcc error:', err.message);
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // DELCC — حذف
  // ═══════════════════════════════════════════
  {
    name: 'delcc',
    description: 'حذف أمر مخصص',
    usage: '=delcc <trigger>',
    aliases: ['حذف_امر'],
    category: 'custom',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const trigger = cleanCommandName(args[0]);
      if (!trigger) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =delcc <trigger>')] });
      }

      const existing = customCmdsDB.get(message.guild.id, trigger);
      if (!existing) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ \`=${trigger}\` not found.`)] });
      }

      try {
        customCmdsDB.remove(message.guild.id, trigger);
        return replyHelper(message, {
          embeds: [successEmbed(tr(lang, 'cc_deleted_count', { n: 1, name: trigger }) || `🗑 Deleted \`=${trigger}\``)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // LISTCC — عرض
  // ═══════════════════════════════════════════
  {
    name: 'listcc',
    description: 'عرض الأوامر المخصصة',
    usage: '=listcc',
    aliases: ['قائمة_مخصصة'],
    category: 'custom',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const list = customCmdsDB.getAll(message.guild.id);

      if (!list.length) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ No custom commands.')] });
      }

      const embed = new EmbedBuilder()
        .setTitle(tr(lang, 'cc_view_title') || '📖 Custom Commands')
        .setColor(0xa855f7)
        .setFooter({ text: tr(lang, 'cc_view_footer', { n: list.length }) || `${list.length} commands` })
        .setTimestamp();

      for (const cc of list.slice(0, 20)) {
        embed.addFields({
          name: `\`=${cc.trigger}\``,
          value: cc.response.slice(0, 200) || '—',
          inline: false,
        });
      }

      if (list.length > 20) {
        embed.setFooter({ text: `+${list.length - 20} more` });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // EDITCC — تعديل
  // ═══════════════════════════════════════════
  {
    name: 'editcc',
    description: 'تعديل رد أمر مخصص',
    usage: '=editcc <trigger> <new response>',
    aliases: ['تعديل_امر'],
    category: 'custom',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const trigger = cleanCommandName(args[0]);
      const response = args.slice(1).join(' ').trim();

      if (!trigger || !response) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =editcc <trigger> <new response>')] });
      }

      if (response.length > MAX_RESPONSE_LENGTH) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ Max ${MAX_RESPONSE_LENGTH} chars.`)] });
      }

      const existing = customCmdsDB.get(message.guild.id, trigger);
      if (!existing) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ \`=${trigger}\` not found.`)] });
      }

      try {
        customCmdsDB.update(message.guild.id, trigger, response);
        return replyHelper(message, {
          embeds: [successEmbed(`✅ Updated \`=${trigger}\``)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // CLEARCC — مسح الكل
  // ═══════════════════════════════════════════
  {
    name: 'clearcc',
    description: 'مسح كل الأوامر المخصصة',
    usage: '=clearcc',
    aliases: ['مسح_مخصصة'],
    category: 'custom',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const count = customCmdsDB.count(message.guild.id);
      if (!count) {
        return replyHelper(message, { embeds: [errorEmbed('✅ Nothing to clear.')] });
      }

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        `⚠️ Clear ${count} custom commands?`
      );
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      try {
        const removed = customCmdsDB.clear(message.guild.id);
        return replyHelper(message, {
          embeds: [successEmbed(tr(lang, 'cc_deleted_count', { n: removed, name: 'all' }) || `🗑 Cleared ${removed}`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // CCVARS — عرض المتغيرات
  // ═══════════════════════════════════════════
  {
    name: 'ccvars',
    description: 'عرض متغيرات الأوامر المخصصة',
    usage: '=ccvars',
    aliases: ['متغيرات_مخصصة'],
    category: 'custom',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);

      const vars = [
        '`{user}` — Mention',
        '`{user.name}` — Username',
        '`{user.id}` — User ID',
        '`{user.mention}` — Mention',
        '`{server}` — Server name',
        '`{channel}` — Channel mention',
        '`{args}` — Arguments',
        '`{count}` — Member count',
      ];

      const embed = new EmbedBuilder()
        .setTitle(tr(lang, 'cc_vars_intro') || '📝 Template Variables')
        .setDescription(vars.join('\n'))
        .setColor(0x5865f2);

      return replyHelper(message, { embeds: [embed] });
    },
  },
];

// ============================================
// Listener — يعالج الرسائل
// ============================================
export function setupCustomCommandsListener(client) {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!message.content.startsWith('=')) return;

      const args = message.content.slice(1).trim().split(/\s+/);
      const trigger = cleanCommandName(args.shift());
      if (!trigger) return;

      // تجنب التعارض مع الأوامر الحقيقية
      if (client.commands.has(trigger)) return;

      const cc = customCmdsDB.get(message.guild.id, trigger);
      if (!cc) return;

      const rendered = renderVars(cc.response, message, args);

      try {
        await message.channel.send(rendered.slice(0, 2000));
      } catch (err) {
        logger.debug('cc send failed:', err.message);
      }
    } catch (err) {
      logger.debug('custom-commands listener error:', err.message);
    }
  });

  logger.info('✅ Custom commands listener registered');
}

export default { commands, setupCustomCommandsListener };
