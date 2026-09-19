/**
 * auto-responder.js
 * الردود التلقائية — Node.js
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
  autoResponder,
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
  MAX_RESPONSE_LENGTH,
} from '../constants.js';

async function getLang(guildId) {
  try {
    return guilds.getLanguage(guildId) || 'ar';
  } catch {
    return 'ar';
  }
}

function tr(lang, key, vars = {}) {
  let text = t(lang, 'autoResponder', key) || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return text;
}

async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `ar_yes_${authorId}_${Date.now()}`;
  const noId = `ar_no_${authorId}_${Date.now()}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(yesId).setLabel(lang === 'ar' ? '✅ تأكيد' : '✅ Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(noId).setLabel(lang === 'ar' ? '❌ إلغاء' : '❌ Cancel').setStyle(ButtonStyle.Secondary)
  );

  let msg;
  if (isSlash) {
    msg = await target.followUp({ content: prompt, components: [row], fetchReply: true });
  } else {
    msg = await target.reply({ content: prompt, components: [row] });
  }

  return new Promise((resolve) => {
    const filter = (i) => i.user.id === authorId && [yesId, noId].includes(i.customId);
    const collector = msg.createMessageComponentCollector({ filter, time: CONFIRMATION_TIMEOUT * 1000, max: 1 });
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

const arCooldowns = new Map();
const AR_COOLDOWN_MS = 5000;

export const commands = [
  // ADDAR
  {
    name: 'addar',
    description: 'إضافة رد تلقائي',
    usage: '=addar <trigger> <response>',
    aliases: ['addauto', 'اضافة_رد'],
    category: 'autoresponder',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const trigger = (args[0] || '').trim();
      const response = args.slice(1).join(' ').trim();

      if (!trigger || !response) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: `=addar <trigger> <response>`')] });
      }

      if (response.length > MAX_RESPONSE_LENGTH) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'ar_response_too_long', { max: MAX_RESPONSE_LENGTH }))] });
      }

      try {
        autoResponder.add(message.guild.id, trigger, response, 'exact');
        return replyHelper(message, { embeds: [successEmbed(`✅ Added auto-responder for \`${trigger}\``)] });
      } catch (err) {
        logger.error('addar error:', err.message);
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // DELAR
  {
    name: 'delar',
    description: 'حذف رد تلقائي بالـ ID',
    usage: '=delar <id>',
    aliases: ['delauto', 'حذف_رد'],
    category: 'autoresponder',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const id = parseInt(args[0]);
      if (isNaN(id)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: `=delar <id>`')] });
      }

      const all = autoResponder.getAll(message.guild.id);
      const target = all.find((r) => r.id === id);
      if (!target) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ Auto-responder #${id} not found.`)] });
      }

      try {
        autoResponder.remove(message.guild.id, id);
        return replyHelper(message, { embeds: [successEmbed(`🗑 Deleted \`${target.trigger}\` (#${id})`)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // LISTAR
  {
    name: 'listar',
    description: 'عرض الردود التلقائية',
    usage: '=listar',
    aliases: ['listauto', 'قائمة_ردود'],
    category: 'autoresponder',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const list = autoResponder.getAll(message.guild.id);

      if (!list.length) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'ar_no_reply_set') || '⚠️ لا يوجد ردود تلقائية.')] });
      }

      const embed = new EmbedBuilder()
        .setTitle('💬 Auto-Responders')
        .setColor(0x5865f2)
        .setFooter({ text: `${list.length} total` })
        .setTimestamp();

      for (const ar of list.slice(0, 20)) {
        embed.addFields({
          name: `#${ar.id} • \`${ar.trigger}\``,
          value: `→ ${(ar.response || '').slice(0, 200)}`,
          inline: false,
        });
      }

      if (list.length > 20) {
        embed.setFooter({ text: `+${list.length - 20} more` });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // CLEARAR
  {
    name: 'clearar',
    description: 'مسح كل الردود التلقائية',
    usage: '=clearar',
    aliases: ['مسح_ردود'],
    category: 'autoresponder',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const list = autoResponder.getAll(message.guild.id);
      if (!list.length) {
        return replyHelper(message, { embeds: [errorEmbed('✅ Nothing to clear.')] });
      }

      const confirmed = await sendConfirmation(message, false, lang, `⚠️ Clear **${list.length}** auto-responders?`);
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      let removed = 0;
      for (const ar of list) {
        try {
          autoResponder.remove(message.guild.id, ar.id);
          removed++;
        } catch {}
      }

      return replyHelper(message, { embeds: [successEmbed(`🗑 Cleared **${removed}** auto-responders.`)] });
    },
  },
];

export function setupAutoResponderListener(client) {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!message.content) return;
      if (message.content.startsWith('=')) return;

      const list = autoResponder.getAll(message.guild.id);
      if (!list.length) return;

      const content = message.content.toLowerCase();

      for (const ar of list) {
        if (!ar.trigger) continue;
        const trigger = ar.trigger.toLowerCase();
        let matched = false;

        if (ar.match_type === 'contains') matched = content.includes(trigger);
        else if (ar.match_type === 'startswith') matched = content.startsWith(trigger);
        else matched = content === trigger;

        if (!matched) continue;

        const key = `${message.guild.id}:${message.author.id}:${ar.id}`;
        const now = Date.now();
        const last = arCooldowns.get(key) || 0;
        if (now - last < AR_COOLDOWN_MS) continue;
        arCooldowns.set(key, now);

        try {
          await message.channel.send((ar.response || '').slice(0, 2000));
        } catch (err) {
          logger.debug('auto-responder send failed:', err.message);
        }
        break;
      }
    } catch (err) {
      logger.debug('auto-responder listener error:', err.message);
    }
  });

  setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of arCooldowns) {
      if (now - ts > 60000) arCooldowns.delete(key);
    }
  }, 60000);

  logger.info('✅ Auto-responder listener registered');
}

export default { commands, setupAutoResponderListener };
