/**
 * temp-punishments.js
 * ============================================
 * العقوبات المؤقتة — Node.js
 * ============================================
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from 'discord.js';

import {
  tempPunishments,
  guilds,
  logging,
  db,
} from '../database.js';

import {
  logger,
  errorEmbed,
  successEmbed,
  discordRetry,
  getMemberFromInput,
  canModerateWithBotCheck,
  replyHelper,
} from '../utils.js';

import {
  DEFAULT_COOLDOWN,
  DANGEROUS_COOLDOWN,
  CONFIRMATION_TIMEOUT,
  parseDuration,
  formatDuration,
  MIN_TIMEOUT_SECONDS,
} from '../constants.js';

const MAX_TEMP_PUNISHMENT_SECONDS = 365 * 86400;
const BAN_DELETE_MESSAGE_SECONDS = 7 * 86400;
const ITEMS_PER_PAGE = 10;
const DEFAULT_MUTE_ROLE_NAME = 'Muted';
const MUTE_ROLE_ALIASES = ['Muted', 'muted', 'Mute', 'ميوت', 'مكتوم'];

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

function getMuteRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === DEFAULT_MUTE_ROLE_NAME);
  if (role) return role;
  for (const name of MUTE_ROLE_ALIASES) {
    role = guild.roles.cache.find((r) => r.name === name);
    if (role) return role;
  }
  return null;
}

function httpErrorMessage(e) {
  if (e.status === 503) return '⚠️ Discord issue (503) — try again in ~30s';
  if (e.status === 429) return '⚠️ Rate limited — wait a moment';
  if (e.status === 502) return '⚠️ Gateway Error (502) — try again';
  if (e.status === 504) return '⚠️ Timeout (504) — try again';
  return `❌ Discord API failed (${e.status})`;
}

async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `tp_yes_${authorId}_${Date.now()}`;
  const noId = `tp_no_${authorId}_${Date.now()}`;

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
  // TEMPBAN
  // ═══════════════════════════════════════════
  {
    name: 'tempban',
    description: 'حظر مؤقت',
    usage: '=tempban <@user|ID> <duration> [reason]',
    aliases: ['حظر_مؤقت'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('BanMembers')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const input = args[0];
      const durationInput = args[1];
      if (!input || !durationInput) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =tempban @user 1h [reason]')] });
      }

      const seconds = parseDuration(durationInput, 'm');
      if (!seconds || seconds / 1000 < MIN_TIMEOUT_SECONDS) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Min 1 min. Examples: 1h, 1d, 1w')] });
      }
      if (seconds / 1000 > MAX_TEMP_PUNISHMENT_SECONDS) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Max 1 year.')] });
      }

      const reason = args.slice(2).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const cleanId = String(input).replace(/[^\d]/g, '');
      if (cleanId.length < 17) return replyHelper(message, { embeds: [errorEmbed('❌ Invalid ID.')] });

      if (cleanId === client.user.id) return replyHelper(message, { embeds: [errorEmbed('❌ Cannot ban the bot!')] });
      if (cleanId === guild.ownerId) return replyHelper(message, { embeds: [errorEmbed('❌ Cannot ban the owner!')] });

      const member = await getMemberFromInput(guild, input);
      if (member) {
        const [canMod, errMsg] = canModerateWithBotCheck(author, member, guild.members.me);
        if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });
      }

      let user;
      try { user = await client.users.fetch(cleanId); }
      catch { return replyHelper(message, { embeds: [errorEmbed('❌ User not found.')] }); }

      try {
        await discordRetry(guild.bans.create.bind(guild.bans), user, {
          reason: `Tempban by ${author.tag}: ${reason}`,
          deleteMessageSeconds: BAN_DELETE_MESSAGE_SECONDS,
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }

      const durationText = formatDuration(seconds);
      const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(seconds / 1000);
      let punishmentId;
      try {
        punishmentId = tempPunishments.add(guild.id, cleanId, 'ban', expiresAt, author.id, reason, null);
      } catch (err) {
        try { await guild.bans.remove(user, 'DB save failed — rollback'); } catch {}
        return replyHelper(message, { embeds: [errorEmbed('❌ Save failed + rollback.')] });
      }

      logging.logAction(guild.id, 'tempban', author.id, cleanId, `#${punishmentId} | ${durationText}`);

      return replyHelper(message, {
        embeds: [successEmbed(`🔨 Temporarily banned \`${user.tag}\`.\n**Duration:** ${durationText}\n**Reason:** ${reason}\n**ID:** \`#${punishmentId}\``)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPMUTE
  // ═══════════════════════════════════════════
  {
    name: 'tempmute',
    description: 'كتم مؤقت',
    usage: '=tempmute <@user|ID> <duration> [reason]',
    aliases: ['كتم_مؤقت'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const input = args[0];
      const durationInput = args[1];
      if (!input || !durationInput) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =tempmute @user 30m [reason]')] });
      }

      const seconds = parseDuration(durationInput, 'm');
      if (!seconds || seconds / 1000 < MIN_TIMEOUT_SECONDS) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Min 1 min.')] });
      }
      if (seconds / 1000 > MAX_TEMP_PUNISHMENT_SECONDS) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Max 1 year.')] });
      }

      const reason = args.slice(2).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const member = await getMemberFromInput(guild, input);
      if (!member) return replyHelper(message, { embeds: [errorEmbed('❌ Member not found.')] });

      const [canMod, errMsg] = canModerateWithBotCheck(author, member, guild.members.me);
      if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });

      const muteRole = getMuteRole(guild);
      if (!muteRole) return replyHelper(message, { embeds: [errorEmbed('⚠️ No Muted role. Use =setupmute.')] });

      if (member.roles.cache.has(muteRole.id)) {
        return replyHelper(message, { embeds: [errorEmbed(`⚠️ ${member} already muted.`)] });
      }

      try {
        await discordRetry(member.roles.add.bind(member.roles), muteRole, `Tempmute by ${author.tag}`);
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }

      const durationText = formatDuration(seconds);
      const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(seconds / 1000);
      let punishmentId;
      try {
        punishmentId = tempPunishments.add(guild.id, member.id, 'mute', expiresAt, author.id, reason, null);
      } catch (err) {
        try { await member.roles.remove(muteRole, 'DB failed — rollback'); } catch {}
        return replyHelper(message, { embeds: [errorEmbed('❌ Save failed + rollback.')] });
      }

      logging.logAction(guild.id, 'tempmute', author.id, member.id, `#${punishmentId} | ${durationText}`);

      return replyHelper(message, {
        embeds: [successEmbed(`🔇 Temporarily muted ${member}.\n**Duration:** ${durationText}\n**Reason:** ${reason}\n**ID:** \`#${punishmentId}\``)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPLOCK
  // ═══════════════════════════════════════════
  {
    name: 'templock',
    description: 'قفل قناة مؤقتاً',
    usage: '=templock <duration> [#channel] [reason]',
    aliases: ['قفل_مؤقت'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('ManageChannels')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const durationInput = args[0];
      if (!durationInput) return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =templock 1h #channel reason')] });

      const seconds = parseDuration(durationInput, 'm');
      if (!seconds || seconds / 1000 < MIN_TIMEOUT_SECONDS) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Min 1 min.')] });
      }

      const channel = message.mentions.channels.first() || message.channel;
      const reason = args.slice(1).filter((a) => !a.startsWith('<#')).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');

      try {
        await channel.permissionOverwrites.edit(
          guild.roles.everyone,
          { SendMessages: false },
          { reason: `Templock by ${author.tag}` }
        );
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }

      const durationText = formatDuration(seconds);
      const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(seconds / 1000);
      let punishmentId;
      try {
        punishmentId = tempPunishments.add(guild.id, author.id, 'lock', expiresAt, author.id, reason, channel.id);
      } catch (err) {
        try { await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: 'DB failed — rollback' }); } catch {}
        return replyHelper(message, { embeds: [errorEmbed('❌ Save failed + rollback.')] });
      }

      logging.logAction(guild.id, 'templock', author.id, 0, `#${punishmentId} | ch=${channel.id}`);

      return replyHelper(message, {
        embeds: [successEmbed(`🔒 Temporarily locked ${channel}.\n**Duration:** ${durationText}\n**Reason:** ${reason}\n**ID:** \`#${punishmentId}\``)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPLOCKALL
  // ═══════════════════════════════════════════
  {
    name: 'templockall',
    description: 'قفل كل القنوات مؤقتاً (admin)',
    usage: '=templockall <duration> [reason]',
    aliases: ['قفل_الكل_مؤقت'],
    category: 'temp',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const durationInput = args[0];
      if (!durationInput) return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =templockall 1h reason')] });

      const seconds = parseDuration(durationInput, 'm');
      if (!seconds || seconds / 1000 < MIN_TIMEOUT_SECONDS) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Min 1 min.')] });
      }

      const durationText = formatDuration(seconds);
      const channels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText);

      const prompt = `⚠️ **Confirm locking ${channels.size} channels for ${durationText}?**`;
      const confirmed = await sendConfirmation(message, false, lang, prompt);
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      let success = 0;
      for (const [, ch] of channels) {
        try {
          await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: `Templockall by ${author.tag}` });
          success++;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }

      const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(seconds / 1000);
      const punishmentId = tempPunishments.add(guild.id, author.id, 'lockall', expiresAt, author.id, args.slice(1).join(' ') || 'Mass lock', null);

      return replyHelper(message, {
        embeds: [successEmbed(`🔒 Locked **${success}/${channels.size}** channels.\n**Duration:** ${durationText}\n**ID:** \`#${punishmentId}\``)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPLIST
  // ═══════════════════════════════════════════
  {
    name: 'templist',
    description: 'عرض العقوبات المؤقتة',
    usage: '=templist',
    aliases: ['قائمة_مؤقتة'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const punishments = tempPunishments.getAll(message.guild.id);
      if (!punishments.length) {
        return replyHelper(message, { embeds: [errorEmbed('✅ No temp punishments.')] });
      }

      const embed = new EmbedBuilder()
        .setTitle(`⏰ Temp Punishments (${punishments.length})`)
        .setColor(0xfee75c)
        .setTimestamp();

      const now = Math.floor(Date.now() / 1000);
      const types = { ban: '🔨', mute: '🔇', lock: '🔒', lockall: '🔐' };

      for (const p of punishments.slice(0, ITEMS_PER_PAGE)) {
        const remaining = p.expires_at - now;
        const remainingText = remaining < 0 ? 'Expired' : formatDuration(remaining * 1000);
        const icon = types[p.punishment_type] || '⏰';
        embed.addFields({
          name: `${icon} \`#${p.id}\` | ${p.punishment_type}`,
          value: `**User:** <@${p.user_id}>\n**Remaining:** ${remainingText}\n**Reason:** ${(p.reason || '—').slice(0, 80)}`,
          inline: false,
        });
      }

      if (punishments.length > ITEMS_PER_PAGE) {
        embed.setFooter({ text: `+ ${punishments.length - ITEMS_PER_PAGE} more` });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPINFO
  // ═══════════════════════════════════════════
  {
    name: 'tempinfo',
    description: 'معلومات عقوبة',
    usage: '=tempinfo <id>',
    aliases: ['معلومات_عقوبة'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const id = parseInt(args[0]);
      if (isNaN(id)) return replyHelper(message, { embeds: [errorEmbed('❌ Invalid ID.')] });

      const p = tempPunishments.get(id);
      if (!p || p.guild_id !== message.guild.id) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ Punishment #${id} not found.`)] });
      }

      const now = Math.floor(Date.now() / 1000);
      const remaining = p.expires_at - now;
      const remainingText = remaining < 0 ? 'Expired' : formatDuration(remaining * 1000);

      const embed = new EmbedBuilder()
        .setTitle(`⏰ Punishment #${id} Details`)
        .setColor(0xfee75c)
        .setTimestamp()
        .addFields(
          { name: '🆔 ID', value: `\`#${id}\``, inline: true },
          { name: 'Type', value: p.punishment_type, inline: true },
          { name: 'User', value: `<@${p.user_id}>`, inline: false },
          { name: 'Remaining', value: remainingText, inline: true },
          { name: 'Expires', value: `<t:${p.expires_at}:R>`, inline: true },
          { name: 'By', value: `<@${p.created_by}>`, inline: true }
        );

      if (p.reason) embed.addFields({ name: 'Reason', value: p.reason.slice(0, 200), inline: false });

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // EXTEND
  // ═══════════════════════════════════════════
  {
    name: 'extend',
    description: 'تمديد عقوبة',
    usage: '=extend <id> <duration>',
    aliases: ['تمديد'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const id = parseInt(args[0]);
      const durationInput = args[1];

      if (isNaN(id) || !durationInput) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =extend 5 1h')] });
      }

      const extraSeconds = parseDuration(durationInput, 'm');
      if (!extraSeconds || extraSeconds / 1000 < 60) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Min 1 min.')] });
      }

      const p = tempPunishments.get(id);
      if (!p || p.guild_id !== message.guild.id) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ Not found.`)] });
      }

      const now = Math.floor(Date.now() / 1000);
      const base = Math.max(p.expires_at, now);
      const newExpiresAt = base + Math.floor(extraSeconds / 1000);

      tempPunishments.updateExpiry(id, newExpiresAt);

      const extraText = formatDuration(extraSeconds);
      const oldRemaining = p.expires_at - now;
      const newRemaining = newExpiresAt - now;

      return replyHelper(message, {
        embeds: [successEmbed(`✅ Extended #${id} by **${extraText}**.\n**Before:** ${formatDuration(Math.max(oldRemaining, 0) * 1000)}\n**After:** ${formatDuration(newRemaining * 1000)}`)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPCANCEL
  // ═══════════════════════════════════════════
  {
    name: 'tempcancel',
    description: 'إلغاء عقوبة مؤقتة',
    usage: '=tempcancel <id>',
    aliases: ['الغاء_عقوبة'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const id = parseInt(args[0]);
      if (isNaN(id)) return replyHelper(message, { embeds: [errorEmbed('❌ Invalid ID.')] });

      const p = tempPunishments.get(id);
      if (!p || p.guild_id !== guild.id) {
        return replyHelper(message, { embeds: [errorEmbed(`❌ Not found.`)] });
      }

      try {
        if (p.punishment_type === 'ban') {
          try {
            const user = await client.users.fetch(p.user_id);
            await discordRetry(guild.bans.remove.bind(guild.bans), user, `Canceled by ${author.tag}`);
          } catch {}
        } else if (p.punishment_type === 'mute') {
          const member = guild.members.cache.get(p.user_id);
          const muteRole = getMuteRole(guild);
          if (member && muteRole && member.roles.cache.has(muteRole.id)) {
            await member.roles.remove(muteRole, `Canceled by ${author.tag}`).catch(() => {});
          }
        } else if (p.punishment_type === 'lock' && p.target_id) {
          const ch = guild.channels.cache.get(p.target_id);
          if (ch && ch.type === ChannelType.GuildText) {
            await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: `Cancel lock by ${author.tag}` }).catch(() => {});
          }
        } else if (p.punishment_type === 'lockall') {
          for (const [, ch] of guild.channels.cache) {
            if (ch.type === ChannelType.GuildText) {
              await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: `Cancel mass lock by ${author.tag}` }).catch(() => {});
            }
            await new Promise((r) => setTimeout(r, 50));
          }
        }
      } catch (err) {
        logger.error('tempcancel apply error:', err.message);
      }

      tempPunishments.remove(id);

      return replyHelper(message, {
        embeds: [successEmbed(`✅ Canceled #${id} (${p.punishment_type}).`)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPSTATS
  // ═══════════════════════════════════════════
  {
    name: 'tempstats',
    description: 'إحصائيات العقوبات المؤقتة',
    usage: '=tempstats',
    aliases: ['احصائيات_مؤقتة'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const punishments = tempPunishments.getAll(message.guild.id);
      const count = punishments.length;

      const byType = {};
      for (const p of punishments) {
        byType[p.punishment_type] = (byType[p.punishment_type] || 0) + 1;
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 Temp Punishments Stats')
        .setColor(0x9b59b6)
        .setTimestamp()
        .addFields({ name: '⏰ Active Now', value: `**${count}**`, inline: true });

      for (const [type, c] of Object.entries(byType)) {
        const icon = { ban: '🔨', mute: '🔇', lock: '🔒', lockall: '🔐' }[type] || '⏰';
        embed.addFields({ name: `${icon} ${type}`, value: `**${c}**`, inline: true });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPCLEAR
  // ═══════════════════════════════════════════
  {
    name: 'tempclear',
    description: 'مسح كل العقوبات من DB (admin)',
    usage: '=tempclear',
    aliases: ['مسح_العقوبات'],
    category: 'temp',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const count = tempPunishments.count(guild.id);
      if (count === 0) {
        return replyHelper(message, { embeds: [errorEmbed('✅ No punishments.')] });
      }

      const prompt = `⚠️ **Confirm clearing ${count} punishments from DB?**\n⚠️ Discord actions will NOT be removed!`;
      const confirmed = await sendConfirmation(message, false, lang, prompt);
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      const deleted = tempPunishments.clearAll(guild.id);
      logging.logAction(guild.id, 'tempclear', author.id, 0, `cleared=${deleted}`);

      return replyHelper(message, {
        embeds: [successEmbed(`✅ Cleared **${deleted}** punishments from DB.`)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPUNBAN
  // ═══════════════════════════════════════════
  {
    name: 'tempunban',
    description: 'فك حظر مؤقت يدوياً',
    usage: '=tempunban <ID>',
    aliases: ['الغاء_حظر_مؤقت'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      if (!message.member.permissions.has('BanMembers')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const cleanId = (args[0] || '').replace(/[^\d]/g, '');
      if (cleanId.length < 17) return replyHelper(message, { embeds: [errorEmbed('❌ Invalid ID.')] });

      try {
        const userPuns = tempPunishments.getUserPunishments(guild.id, cleanId);
        const banPun = userPuns.find((p) => p.punishment_type === 'ban');

        if (!banPun) return replyHelper(message, { embeds: [errorEmbed('⚠️ No temp ban for this user.')] });

        try {
          const user = await client.users.fetch(cleanId);
          await discordRetry(guild.bans.remove.bind(guild.bans), user, `Manual tempunban by ${message.author.tag}`);
        } catch {}

        tempPunishments.remove(banPun.id);
        return replyHelper(message, { embeds: [successEmbed(`✅ Manually unbanned <@${cleanId}>.`)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // TEMPUNMUTE
  // ═══════════════════════════════════════════
  {
    name: 'tempunmute',
    description: 'إلغاء كتم مؤقت يدوياً',
    usage: '=tempunmute <@user|ID>',
    aliases: ['الغاء_كتم_مؤقت'],
    category: 'temp',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const member = await getMemberFromInput(guild, args[0]);
      if (!member) return replyHelper(message, { embeds: [errorEmbed('❌ Member not found.')] });

      try {
        const userPuns = tempPunishments.getUserPunishments(guild.id, member.id);
        const mutePun = userPuns.find((p) => p.punishment_type === 'mute');

        if (!mutePun) return replyHelper(message, { embeds: [errorEmbed('⚠️ No temp mute.')] });

        const muteRole = getMuteRole(guild);
        if (muteRole && member.roles.cache.has(muteRole.id)) {
          await member.roles.remove(muteRole, `Manual tempunmute by ${message.author.tag}`).catch(() => {});
        }

        tempPunishments.remove(mutePun.id);
        return replyHelper(message, { embeds: [successEmbed(`✅ Manually unmuted ${member}.`)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },
];

// ============================================
// Auto-expire loop
// ============================================
export function startTempPunishmentsLoop(client) {
  setInterval(async () => {
    try {
      const expired = tempPunishments.getExpired();
      if (!expired.length) return;

      for (const p of expired) {
        const guild = client.guilds.cache.get(p.guild_id);
        if (!guild) {
          tempPunishments.remove(p.id);
          continue;
        }

        try {
          if (p.punishment_type === 'ban') {
            try {
              const user = await client.users.fetch(p.user_id);
              await guild.bans.remove(user, 'Temp ban expired');
            } catch {}
          } else if (p.punishment_type === 'mute') {
            const member = guild.members.cache.get(p.user_id);
            const muteRole = getMuteRole(guild);
            if (member && muteRole && member.roles.cache.has(muteRole.id)) {
                            await member.roles.remove(muteRole, 'Temp mute expired').catch(() => {});
            }
          } else if (p.punishment_type === 'lock' && p.target_id) {
            const ch = guild.channels.cache.get(p.target_id);
            if (ch && ch.type === ChannelType.GuildText) {
              await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: 'Temp lock expired' }).catch(() => {});
            }
          } else if (p.punishment_type === 'lockall') {
            for (const [, ch] of guild.channels.cache) {
              if (ch.type === ChannelType.GuildText) {
                await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: 'Temp lockall expired' }).catch(() => {});
              }
              await new Promise((r) => setTimeout(r, 50));
            }
          }
        } catch (err) {
          logger.debug('temp expire apply error:', err.message);
        }

        tempPunishments.remove(p.id);
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      logger.error('temp punishments loop error:', err.message);
    }
  }, 60000);

  logger.info('✅ Temp punishments loop started (every 60s)');
}

export default { commands, startTempPunishmentsLoop };
