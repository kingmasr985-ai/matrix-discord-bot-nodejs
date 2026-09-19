/**
 * channel-manage.js
 * ============================================
 * إدارة القنوات — Node.js
 * (lock, hide, slowmode, clone, topic, raid...)
 * ============================================
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';

import {
  guilds,
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
  MAX_TOPIC_LENGTH,
  MAX_SLOWMODE_SECONDS,
  MAX_MASS_CHANNELS,
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
// ترجمة
// ============================================
function tr(lang, key, vars = {}) {
  let text = t(lang, 'channelMgmt', key) || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return text;
}

// ============================================
// Confirmation
// ============================================
async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `cm_yes_${authorId}_${Date.now()}`;
  const noId = `cm_no_${authorId}_${Date.now()}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(yesId)
      .setLabel(tr(lang, 'cm_confirm_yes'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(noId)
      .setLabel(tr(lang, 'cm_confirm_no'))
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
// HTTP error
// ============================================
function httpErrorMessage(e) {
  if (e.status === 503) return '⚠️ Discord issue (503) — try again in ~30s';
  if (e.status === 429) return '⚠️ Rate limited — wait a moment';
  if (e.status === 502) return '⚠️ Gateway Error (502) — try again';
  if (e.status === 504) return '⚠️ Timeout (504) — try again';
  return `❌ Discord API failed (${e.status})`;
}

// ============================================
// منع الغزو (Raid Mode)
// ============================================
const raidModeGuilds = new Set();

// ============================================
// الأوامر
// ============================================
export const commands = [

  // ═══════════════════════════════════════════
  // LOCK
  // ═══════════════════════════════════════════
  {
    name: 'lock',
    description: 'قفل القناة',
    usage: '=lock [#channel]',
    aliases: ['قفل'],
    category: 'channels',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'cm_confirm_not_yours') || '❌ No permission.')] });
      }

      try {
        await channel.permissionOverwrites.edit(
          message.guild.roles.everyone,
          { SendMessages: false },
          { reason: `Lock by ${message.author.tag}` }
        );
        return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_lock_success', { channel: channel.toString() }))] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // UNLOCK
  // ═══════════════════════════════════════════
  {
    name: 'unlock',
    description: 'فتح القناة',
    usage: '=unlock [#channel]',
    aliases: ['فتح'],
    category: 'channels',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      try {
        await channel.permissionOverwrites.edit(
          message.guild.roles.everyone,
          { SendMessages: null },
          { reason: `Unlock by ${message.author.tag}` }
        );
        return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_unlock_success', { channel: channel.toString() }))] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // HIDE
  // ═══════════════════════════════════════════
  {
    name: 'hide',
    description: 'إخفاء القناة',
    usage: '=hide [#channel]',
    aliases: ['اخفاء'],
    category: 'channels',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      try {
        await channel.permissionOverwrites.edit(
          message.guild.roles.everyone,
          { ViewChannel: false },
          { reason: `Hide by ${message.author.tag}` }
        );
        return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_hide_success', { channel: channel.toString() }))] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // UNHIDE
  // ═══════════════════════════════════════════
  {
    name: 'unhide',
    description: 'إظهار القناة',
    usage: '=unhide [#channel]',
    aliases: ['اظهار', 'show'],
    category: 'channels',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      try {
        await channel.permissionOverwrites.edit(
          message.guild.roles.everyone,
          { ViewChannel: null },
          { reason: `Unhide by ${message.author.tag}` }
        );
        return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_unhide_success', { channel: channel.toString() }))] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // SLOWMODE
  // ═══════════════════════════════════════════
  {
    name: 'slowmode',
    description: 'الوضع البطيء للقناة',
    usage: '=slowmode <seconds|off> [#channel]',
    aliases: ['بطيء', 'slow'],
    category: 'channels',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const input = (args[0] || '').toLowerCase();
      if (!input) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'cm_slowmode_invalid') || '❌ Usage: =slowmode 10s')] });
      }

      if (input === 'off' || input === 'ايقاف' || input === 'إيقاف') {
        try {
          await channel.setRateLimitPerUser(0, `Slowmode off by ${message.author.tag}`);
          return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_slowmode_off', { channel: channel.toString() }))] });
        } catch (err) {
          return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
        }
      }

      let seconds = 0;
      const match = input.match(/^(\d+)(s|m|h)?$/);
      if (match) {
        const n = parseInt(match[1]);
        const unit = match[2] || 's';
        if (unit === 'm') seconds = n * 60;
        else if (unit === 'h') seconds = n * 3600;
        else seconds = n;
      } else {
        seconds = parseInt(input);
      }

      if (isNaN(seconds) || seconds < 0) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'cm_slowmode_invalid') || '❌ Invalid duration.')] });
      }
      if (seconds > MAX_SLOWMODE_SECONDS) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'cm_slowmode_max', { max: MAX_SLOWMODE_SECONDS }))] });
      }

      try {
        await channel.setRateLimitPerUser(seconds, `Slowmode by ${message.author.tag}`);
        return replyHelper(message, {
          embeds: [successEmbed(tr(lang, 'cm_slowmode_set', { channel: channel.toString(), seconds }))],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // CLONE
  // ═══════════════════════════════════════════
  {
    name: 'clone',
    description: 'نسخ قناة',
    usage: '=clone [#channel]',
    aliases: ['نسخ'],
    category: 'channels',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      try {
        const cloned = await channel.clone({ reason: `Clone by ${message.author.tag}` });
        return replyHelper(message, {
          embeds: [successEmbed(tr(lang, 'cm_clone_success', { old: channel.toString(), new: cloned.toString() }))],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // TOPIC
  // ═══════════════════════════════════════════
  {
    name: 'topic',
    description: 'تعيين موضوع القناة',
    usage: '=topic [text|clear] [#channel]',
    aliases: ['موضوع'],
    category: 'channels',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildForum) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Text channels only.')] });
      }

      const text = args.filter((a) => !a.startsWith('<#')).join(' ').trim();

      if (text.toLowerCase() === 'clear' || text === 'مسح') {
        try {
          await channel.setTopic(null, `Cleared by ${message.author.tag}`);
          return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_topic_cleared', { channel: channel.toString() }))] });
        } catch (err) {
          return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
        }
      }

      if (!text) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =topic text [#channel]')] });
      }

      if (text.length > MAX_TOPIC_LENGTH) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'cm_topic_too_long', { max: MAX_TOPIC_LENGTH, n: text.length }))],
        });
      }

      try {
        await channel.setTopic(text, `By ${message.author.tag}`);
        return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_topic_updated', { channel: channel.toString() }))] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // SYNC
  // ═══════════════════════════════════════════
  {
    name: 'sync',
    description: 'مزامنة صلاحيات القناة مع القسم',
    usage: '=sync [#channel]',
    aliases: ['مزامنة'],
    category: 'channels',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      if (!channel.parent) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'cm_no_category') || '❌ Not in a category.')] });
      }

      try {
        await channel.lockPermissions();
        return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_sync_success', { channel: channel.toString() }))] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // MASSLOCK
  // ═══════════════════════════════════════════
  {
    name: 'masslock',
    description: 'قفل عدة قنوات',
    usage: '=masslock [#ch1 #ch2 ...]',
    aliases: ['قفل_جماعي'],
    category: 'channels',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const channels = [...message.mentions.channels.values()];

      if (!channels.length) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =masslock #ch1 #ch2')] });
      }

      if (channels.length > MAX_MASS_CHANNELS) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'cm_mass_max', { max: MAX_MASS_CHANNELS }))] });
      }

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        tr(lang, 'cm_masslock_confirm', { n: channels.length })
      );
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      let success = 0;
      for (const ch of channels) {
        try {
          await ch.permissionOverwrites.edit(
            message.guild.roles.everyone,
            { SendMessages: false },
            { reason: `Masslock by ${message.author.tag}` }
          );
          success++;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }

      return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_masslock_done', { n: success }))] });
    },
  },

  // ═══════════════════════════════════════════
  // MASSUNLOCK
  // ═══════════════════════════════════════════
  {
    name: 'massunlock',
    description: 'فتح عدة قنوات',
    usage: '=massunlock [#ch1 #ch2 ...]',
    aliases: ['فتح_جماعي'],
    category: 'channels',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const channels = [...message.mentions.channels.values()];
      if (!channels.length) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =massunlock #ch1 #ch2')] });
      }

      if (channels.length > MAX_MASS_CHANNELS) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'cm_mass_max', { max: MAX_MASS_CHANNELS }))] });
      }

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        tr(lang, 'cm_masslock_confirm', { n: channels.length })
      );
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      let success = 0;
      for (const ch of channels) {
        try {
          await ch.permissionOverwrites.edit(
            message.guild.roles.everyone,
            { SendMessages: null },
            { reason: `Massunlock by ${message.author.tag}` }
          );
          success++;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }

      return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_massunlock_done', { n: success }))] });
    },
  },

  // ═══════════════════════════════════════════
  // RAIDMODE
  // ═══════════════════════════════════════════
  {
    name: 'raidmode',
    description: 'وضع الحماية من الغزو',
    usage: '=raidmode <on|off>',
    aliases: ['حماية', 'raid'],
    category: 'channels',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const action = (args[0] || '').toLowerCase();

      if (!['on', 'off', 'تفعيل', 'تعطيل'].includes(action)) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =raidmode on/off')] });
      }

      const enable = action === 'on' || action === 'تفعيل';

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        tr(lang, 'cm_raid_confirm', { state: enable ? 'ON' : 'OFF' })
      );
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      const everyone = guild.roles.everyone;
      let success = 0;

      if (enable) {
        raidModeGuilds.add(guild.id);
        for (const [, ch] of guild.channels.cache) {
          if (![ChannelType.GuildText, ChannelType.GuildVoice].includes(ch.type)) continue;
          try {
            await ch.permissionOverwrites.edit(
              everyone,
              { SendMessages: false, Speak: false, AddReactions: false },
              { reason: 'Raid mode ON' }
            );
            success++;
          } catch {}
          await new Promise((r) => setTimeout(r, 80));
        }
        return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_raid_on', { n: success }))] });
      } else {
        raidModeGuilds.delete(guild.id);
        for (const [, ch] of guild.channels.cache) {
          if (![ChannelType.GuildText, ChannelType.GuildVoice].includes(ch.type)) continue;
          try {
            await ch.permissionOverwrites.edit(
              everyone,
              { SendMessages: null, Speak: null, AddReactions: null },
              { reason: 'Raid mode OFF' }
            );
            success++;
          } catch {}
          await new Promise((r) => setTimeout(r, 80));
        }
        return replyHelper(message, { embeds: [successEmbed(tr(lang, 'cm_raid_off', { n: success }))] });
      }
    },
  },
];

export default { commands };
