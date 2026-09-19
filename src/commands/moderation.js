/**
 * moderation.js
 * ============================================
 * نظام الإشراف — Node.js
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
  warnings as warnDB,
  tempPunishments,
  jailDB,
  guilds,
  logging,
  commandPermissions,
  db,
} from '../database.js';

import {
  logger,
  errorEmbed,
  successEmbed,
  discordRetry,
  getMemberFromInput,
  canModerateWithBotCheck,
  canModerate,
  replyHelper,
  t,
  tLang,
} from '../utils.js';

import {
  DEFAULT_COOLDOWN,
  DANGEROUS_COOLDOWN,
  CONFIRMATION_TIMEOUT,
  MAX_CLEAR_AMOUNT,
  MAX_TIMEOUT_SECONDS,
  MIN_TIMEOUT_SECONDS,
  BAN_DELETE_MESSAGE_SECONDS,
  MASS_OPS_MAX_TARGETS,
  parseDuration,
  formatDuration,
  LOG_TYPES,
} from '../constants.js';

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

// ============================================
// Confirmation
// ============================================
async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `mod_yes_${authorId}_${Date.now()}`;
  const noId = `mod_no_${authorId}_${Date.now()}`;

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
    msg = await target.followUp({
      content: prompt,
      components: [row],
      fetchReply: true,
    });
  } else {
    msg = await target.reply({ content: prompt, components: [row] });
  }

  return new Promise((resolve) => {
    const filter = (i) =>
      i.user.id === authorId && [yesId, noId].includes(i.customId);
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
// Mute role helpers
// ============================================
function getMuteRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === DEFAULT_MUTE_ROLE_NAME);
  if (role) return role;
  for (const name of MUTE_ROLE_ALIASES) {
    role = guild.roles.cache.find((r) => r.name === name);
    if (role) return role;
  }
  return null;
}

async function getOrCreateMuteRole(guild) {
  let role = getMuteRole(guild);
  if (role) return role;

  try {
    role = await guild.roles.create({
      name: DEFAULT_MUTE_ROLE_NAME,
      color: 0x2c2f33,
      permissions: [],
      reason: 'Auto-create Muted role',
    });

    // Apply to all channels
    for (const [, ch] of guild.channels.cache) {
      if (![ChannelType.GuildText, ChannelType.GuildVoice].includes(ch.type)) continue;
      try {
        await ch.permissionOverwrites.edit(role, {
          SendMessages: false,
          SendMessagesInThreads: false,
          AddReactions: false,
          Speak: false,
        }, { reason: 'Apply Muted' });
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }

    try {
      const pos = Math.max(1, guild.members.me.roles.highest.position - 1);
      await role.setPosition(pos);
    } catch {}

    return role;
  } catch (err) {
    logger.error('create mute role error:', err.message);
    return null;
  }
}

// ============================================
// HTTP error helper
// ============================================
function httpErrorMessage(e) {
  if (e.status === 503) return '⚠️ Discord issue (503) — try again in ~30s';
  if (e.status === 429) return '⚠️ Rate limited — wait a moment';
  if (e.status === 502) return '⚠️ Gateway Error (502) — try again';
  if (e.status === 504) return '⚠️ Timeout (504) — try again';
  return `❌ Discord API failed (${e.status})`;
}

// ============================================
// الأوامر
// ============================================
export const commands = [

  // ═══════════════════════════════════════════
  // BAN
  // ═══════════════════════════════════════════
  {
    name: 'ban',
    description: 'حظر عضو من السيرفر',
    usage: '=ban <@user|ID> [reason]',
    aliases: ['حظر'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('BanMembers')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const input = args[0];
      if (!input) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'missing_args') || '❌ يجب تحديد عضو.')] });

      const reason = args.slice(1).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const cleanId = input.replace(/[^\d]/g, '');

      if (cleanId === client.user.id) return replyHelper(message, { embeds: [errorEmbed('❌ Cannot ban the bot!')] });
      if (cleanId === guild.ownerId) return replyHelper(message, { embeds: [errorEmbed('❌ Cannot ban the owner!')] });

      const member = await getMemberFromInput(guild, input);
      if (member) {
        const [canMod, errMsg] = canModerateWithBotCheck(author, member, guild.members.me);
        if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });
      }

      if (!cleanId || cleanId.length < 17) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ ID غير صحيح.')] });
      }

      try {
        const user = await client.users.fetch(cleanId);
        await discordRetry(guild.bans.create.bind(guild.bans), user, {
          reason: `By ${author.tag}: ${reason}`,
          deleteMessageSeconds: BAN_DELETE_MESSAGE_SECONDS,
        });

        logging.logAction(guild.id, 'ban', author.id, cleanId, reason.slice(0, 100));

        return replyHelper(message, {
          embeds: [successEmbed(t(lang, 'moderation', 'mod_ban_success', { user: `\`${user.tag}\``, reason }) || `✅ Banned ${user.tag}`)],
        });
      } catch (err) {
        logger.error('ban error:', err.message);
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // UNBAN
  // ═══════════════════════════════════════════
  {
    name: 'unban',
    description: 'إلغاء حظر مستخدم',
    usage: '=unban <ID>',
    aliases: ['الغاء_حظر'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('BanMembers')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const cleanId = (args[0] || '').replace(/[^\d]/g, '');
      if (!cleanId || cleanId.length < 17) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ ID غير صحيح.')] });
      }

      try {
        const user = await client.users.fetch(cleanId);
        await discordRetry(message.guild.bans.remove.bind(message.guild.bans), user, `By ${message.author.tag}`);
        logging.logAction(message.guild.id, 'unban', message.author.id, cleanId, '');
        return replyHelper(message, {
          embeds: [successEmbed(t(lang, 'moderation', 'mod_unban_success', { user: `\`${user.tag}\`` }) || `✅ Unbanned ${user.tag}`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ User not found.')] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // KICK
  // ═══════════════════════════════════════════
  {
    name: 'kick',
    description: 'طرد عضو من السيرفر',
    usage: '=kick <@user|ID> [reason]',
    aliases: ['طرد'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('KickMembers')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const input = args[0];
      if (!input) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'missing_args') || '❌ يجب تحديد عضو.')] });

      const reason = args.slice(1).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const member = await getMemberFromInput(message.guild, input);
      if (!member) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ العضو غير موجود.')] });

      const [canMod, errMsg] = canModerateWithBotCheck(message.author, member, message.guild.members.me);
      if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });

      try {
        await discordRetry(member.kick.bind(member), `By ${message.author.tag}: ${reason}`);
        logging.logAction(message.guild.id, 'kick', message.author.id, member.id, reason.slice(0, 100));

        return replyHelper(message, {
          embeds: [successEmbed(t(lang, 'moderation', 'mod_kick_success', { user: member.user.tag, reason }) || `✅ Kicked ${member.user.tag}`)],
        });
      } catch (err) {
        logger.error('kick error:', err.message);
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // MUTE
  // ═══════════════════════════════════════════
  {
    name: 'mute',
    description: 'كتم عضو (Muted role)',
    usage: '=mute <@user|ID> [reason]',
    aliases: ['كتم'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const input = args[0];
      if (!input) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'missing_args') || '❌ يجب تحديد عضو.')] });

      const reason = args.slice(1).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const member = await getMemberFromInput(message.guild, input);
      if (!member) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ العضو غير موجود.')] });

      const [canMod, errMsg] = canModerateWithBotCheck(message.author, member, message.guild.members.me);
      if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });

      const muteRole = await getOrCreateMuteRole(message.guild);
      if (!muteRole) return replyHelper(message, { embeds: [errorEmbed('❌ Failed to create Muted role.')] });

      if (member.roles.cache.has(muteRole.id)) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'moderation', 'mod_mute_already', { user: member.toString() }) || `⚠️ ${member} already muted`)] });
      }

      try {
        await discordRetry(member.roles.add.bind(member.roles), muteRole, `Mute by ${message.author.tag}: ${reason}`);
        logging.logAction(message.guild.id, 'mute', message.author.id, member.id, reason.slice(0, 100));

        return replyHelper(message, {
          embeds: [successEmbed(t(lang, 'moderation', 'mod_mute_success', { role: muteRole.toString(), user: member.toString(), reason, name: member.user.username }) || `🔇 Muted ${member}`)],
        });
      } catch (err) {
        logger.error('mute error:', err.message);
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // UNMUTE
  // ═══════════════════════════════════════════
  {
    name: 'unmute',
    description: 'إلغاء كتم عضو',
    usage: '=unmute <@user|ID>',
    aliases: ['الغاء_كتم'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const member = await getMemberFromInput(message.guild, args[0]);
      if (!member) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ العضو غير موجود.')] });

      const muteRole = getMuteRole(message.guild);
      if (!muteRole) return replyHelper(message, { embeds: [errorEmbed('⚠️ No Muted role found.')] });

      if (!member.roles.cache.has(muteRole.id)) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'moderation', 'mod_unmute_not_muted', { user: member.toString() }) || `⚠️ ${member} not muted`)] });
      }

      try {
        await discordRetry(member.roles.remove.bind(member.roles), muteRole, `Unmute by ${message.author.tag}`);
        logging.logAction(message.guild.id, 'unmute', message.author.id, member.id, '');
        return replyHelper(message, {
          embeds: [successEmbed(t(lang, 'moderation', 'mod_unmute_success', { role: muteRole.toString(), user: member.toString() }) || `🔊 Unmuted ${member}`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // SETUPMUTE
  // ═══════════════════════════════════════════
  {
    name: 'setupmute',
    description: 'إنشاء أو إصلاح رتبة Muted',
    usage: '=setupmute',
    category: 'moderation',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'admin_only') || '❌ Admin only.')] });
      }

      const role = await getOrCreateMuteRole(message.guild);
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Failed to create Muted role.')] });

      return replyHelper(message, {
        embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Muted role ready: ${role.toString()}`)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // TIMEOUT
  // ═══════════════════════════════════════════
  {
    name: 'timeout',
    description: 'كتم مؤقت (timeout)',
    usage: '=timeout <@user|ID> <duration> [reason]',
    aliases: ['كتم_مؤقت'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ModerateMembers')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const input = args[0];
      const dur = args[1];
      if (!input || !dur) return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =timeout @user 1h [reason]')] });

      const ms = parseDuration(dur, 'm');
      if (!ms || ms / 1000 < MIN_TIMEOUT_SECONDS) return replyHelper(message, { embeds: [errorEmbed('❌ Invalid duration (min 1m).')] });
      if (ms / 1000 > MAX_TIMEOUT_SECONDS) return replyHelper(message, { embeds: [errorEmbed('❌ Max 28 days.')] });

      const reason = args.slice(2).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const member = await getMemberFromInput(message.guild, input);
      if (!member) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ العضو غير موجود.')] });

      const [canMod, errMsg] = canModerateWithBotCheck(message.author, member, message.guild.members.me);
      if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });

      try {
        await discordRetry(member.timeout.bind(member), ms, `By ${message.author.tag}: ${reason}`);
        logging.logAction(message.guild.id, 'timeout', message.author.id, member.id, reason.slice(0, 100));

        return replyHelper(message, {
          embeds: [successEmbed(`⏱️ Timed out ${member} for ${formatDuration(ms)}`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // UNTIMEOUT
  // ═══════════════════════════════════════════
  {
    name: 'untimeout',
    description: 'إلغاء timeout',
    usage: '=untimeout <@user|ID>',
    aliases: ['الغاء_تايم'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ModerateMembers')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const member = await getMemberFromInput(message.guild, args[0]);
      if (!member) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ العضو غير موجود.')] });

      if (!member.communicationDisabledUntilTimestamp) {
        return replyHelper(message, { embeds: [errorEmbed(`⚠️ ${member} is not timed out.`)] });
      }

      try {
        await discordRetry(member.timeout.bind(member), null, `Remove timeout by ${message.author.tag}`);
        return replyHelper(message, { embeds: [successEmbed(`✅ Removed timeout from ${member}`)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // WARN
  // ═══════════════════════════════════════════
  {
    name: 'warn',
    description: 'تحذير عضو',
    usage: '=warn <@user|ID> [reason]',
    aliases: ['تحذير'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('KickMembers')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const input = args[0];
      if (!input) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'missing_args') || '❌ يجب تحديد عضو.')] });

      const reason = args.slice(1).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const member = await getMemberFromInput(message.guild, input);
      if (!member) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ العضو غير موجود.')] });

      const [canMod, errMsg] = canModerateWithBotCheck(message.author, member, message.guild.members.me);
      if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });

      try {
        const id = warnDB.add(message.guild.id, member.id, message.author.id, reason);
        logging.logAction(message.guild.id, 'warn', message.author.id, member.id, reason.slice(0, 100));

        return replyHelper(message, {
          embeds: [successEmbed(t(lang, 'moderation', 'mod_warn_success', { user: member.toString(), id }) || `✅ Warned ${member} (ID: ${id})`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Error')] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // WARNINGS
  // ═══════════════════════════════════════════
  {
    name: 'warnings',
    description: 'عرض تحذيرات عضو',
    usage: '=warnings <@user|ID>',
    aliases: ['تحذيرات'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const input = args[0];
      if (!input) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'missing_args') || '❌ يجب تحديد عضو.')] });

      const member = await getMemberFromInput(message.guild, input);
      const userId = member?.id || input.replace(/[^\d]/g, '');
      if (!userId) return replyHelper(message, { embeds: [errorEmbed(t(lang, 'errors', 'user_not_found') || '❌ العضو غير موجود.')] });

      const warns = warnDB.get(message.guild.id, userId);
      if (!warns.length) {
        return replyHelper(message, { embeds: [errorEmbed(lang === 'ar' ? '⚠️ لا توجد تحذيرات.' : '⚠️ No warnings.')] });
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(lang === 'ar' ? `📋 تحذيرات (${warns.length})` : `📋 Warnings (${warns.length})`)
        .setTimestamp();

      for (const w of warns.slice(0, 15)) {
        embed.addFields({
          name: `🆔 #${w.id}`,
          value: `**${lang === 'ar' ? 'السبب' : 'Reason'}:** ${w.reason?.slice(0, 200) || '-'}\n> <@${w.moderator_id}>`,
        });
      }
      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // CLEARWARN
  // ═══════════════════════════════════════════
  {
    name: 'clearwarn',
    description: 'حذف تحذير بالـ ID',
    usage: '=clearwarn <warning_id>',
    aliases: ['حذف_تحذير'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('KickMembers')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const id = parseInt(args[0]);
      if (!id) return replyHelper(message, { embeds: [errorEmbed('❌ Invalid ID.')] });

      try {
        const res = db.prepare('DELETE FROM warnings WHERE id = ? AND guild_id = ?').run(id, message.guild.id);
        if (res.changes === 0) return replyHelper(message, { embeds: [errorEmbed(`❌ Warning #${id} not found.`)] });
        return replyHelper(message, { embeds: [successEmbed(`🗑️ Deleted #${id}.`)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Error')] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // CLEAR
  // ═══════════════════════════════════════════
  {
    name: 'clear',
    description: 'حذف رسائل من القناة',
    usage: '=clear <amount>',
    aliases: ['مسح', 'تنظيف'],
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageMessages')) {
        return replyHelper(message, { embeds: [errorEmbed(t(lang, 'permissions', 'no_permission') || '❌ ليس لديك صلاحية.')] });
      }

      const amount = parseInt(args[0]);
      if (!amount || amount < 1 || amount > MAX_CLEAR_AMOUNT) {
        return replyHelper(message, { embeds: [errorEmbed(`⚠️ Amount between 1 and ${MAX_CLEAR_AMOUNT}.`)] });
      }

      try {
        const deleted = await message.channel.bulkDelete(amount + 1, true);
        const msg = await message.channel.send({
          embeds: [successEmbed(lang === 'ar' ? `✅ تم مسح ${deleted.size - 1} رسالة.` : `✅ Deleted ${deleted.size - 1} messages.`)],
        });
        setTimeout(() => msg.delete().catch(() => {}), 4000);
      } catch (err) {
        await message.channel.send({ embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // SETLANG
  // ═══════════════════════════════════════════
  {
    name: 'setlang',
    description: 'تغيير لغة السيرفر',
    usage: '=setlang <ar|en>',
    category: 'moderation',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only')] });
      }

      const lang = (args[0] || '').toLowerCase();
      if (!['ar', 'en'].includes(lang)) return replyHelper(message, { embeds: [errorEmbed('❌ Use `ar` or `en`')] });

      try {
        guilds.setLanguage(message.guild.id, lang);
        const msg = lang === 'ar' ? '✅ تم تعيين اللغة إلى: **العربية** 🇸🇦' : '✅ Language set to: **English** 🇬🇧';
        return replyHelper(message, { embeds: [successEmbed(msg)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Error')] });
      }
    },
  },
];

// ============================================
// Temp Roles Loop (يشتغل كل 60 ثانية)
// ============================================
export function startTempRolesLoop(client) {
  setInterval(async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const expired = db.prepare(
        `SELECT * FROM temp_punishments WHERE active = 1 AND expires_at <= ? AND punishment_type LIKE 'temp_role:%'`
      ).all(now);

      for (const item of expired) {
        const guild = client.guilds.cache.get(item.guild_id);
        if (!guild) {
          db.prepare('UPDATE temp_punishments SET active = 0 WHERE id = ?').run(item.id);
          continue;
        }

        const member = guild.members.cache.get(item.user_id);
        const roleId = item.punishment_type.split(':')[1];
        const role = guild.roles.cache.get(roleId);

        if (member && role && member.roles.cache.has(role.id)) {
          try { await member.roles.remove(role, 'Temp role expired'); } catch {}
        }
        db.prepare('UPDATE temp_punishments SET active = 0 WHERE id = ?').run(item.id);
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      logger.error('Temp loop error:', err.message);
    }
  }, 60000);

  logger.info('✅ Temp roles loop started (every 60s)');
}

export default { commands, startTempRolesLoop };
