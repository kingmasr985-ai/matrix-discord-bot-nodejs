/**
 * utility-extra.js
 * ============================================
 * أدوات إضافية — Node.js
 * (afk, userinfo, serverinfo, roleinfo,
 *  avatar, banner, profile, lockall, unlockall)
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
  afkDB,
} from '../database.js';

import {
  logger,
  errorEmbed,
  successEmbed,
  replyHelper,
  getMemberFromInput,
  t,
} from '../utils.js';

import {
  DEFAULT_COOLDOWN,
  DANGEROUS_COOLDOWN,
  CONFIRMATION_TIMEOUT,
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
// ترجمة مع متغيرات
// ============================================
function tr(lang, key, vars = {}) {
  let text = t(lang, 'utilityExtra', key) || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return text;
}

// ============================================
// تنسيق مدة
// ============================================
function formatSince(seconds, lang) {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return tr(lang, 'time_now');
  if (diff < 3600) return tr(lang, 'time_minutes', { n: Math.floor(diff / 60) });
  if (diff < 86400) return tr(lang, 'time_hours', { n: Math.floor(diff / 3600) });
  if (diff < 2592000) return tr(lang, 'time_days', { n: Math.floor(diff / 86400) });
  if (diff < 31536000) return tr(lang, 'time_months', { n: Math.floor(diff / 2592000) });
  return tr(lang, 'time_years', { n: Math.floor(diff / 31536000) });
}

// ============================================
// Confirmation
// ============================================
async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `ue_yes_${authorId}_${Date.now()}`;
  const noId = `ue_no_${authorId}_${Date.now()}`;

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
// الأوامر
// ============================================
export const commands = [

  // ═══════════════════════════════════════════
  // AFK
  // ═══════════════════════════════════════════
  {
    name: 'afk',
    description: 'تعيين حالة AFK',
    usage: '=afk [reason]',
    aliases: ['غايب'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const reason = args.join(' ').trim() || null;

      try {
        afkDB.set(message.guild.id, message.author.id, reason);
        const key = reason ? 'afk_set_with_reason' : 'afk_set';
        const text = reason
          ? tr(lang, 'afk_set', { reason })
          : tr(lang, 'afk_set', { reason: tr(lang, 'afk_set_no_reason') });

        return replyHelper(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x57f287)
              .setDescription(text),
          ],
        });
      } catch (err) {
        logger.error('afk error:', err.message);
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'error_generic') || '❌ Error')],
        });
      }
    },
  },

  // ═══════════════════════════════════════════
  // UNAFK
  // ═══════════════════════════════════════════
  {
    name: 'unafk',
    description: 'إزالة حالة AFK',
    usage: '=unafk',
    aliases: ['رجع'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const removed = afkDB.remove(message.guild.id, message.author.id);

      if (!removed) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'afk_not_afk') || '⚠️ You are not AFK.')],
        });
      }

      return replyHelper(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setDescription(tr(lang, 'afk_removed') || '✅ AFK removed.'),
        ],
      });
    },
  },

  // ═══════════════════════════════════════════
  // AFKLIST
  // ═══════════════════════════════════════════
  {
    name: 'afklist',
    description: 'عرض الأعضاء الغائبين',
    usage: '=afklist',
    aliases: ['الغائبين'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const all = afkDB.getAll(message.guild.id);
      const entries = Object.entries(all);

      if (!entries.length) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'afk_not_set') || '⚠️ No AFK members.')],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(tr(lang, 'afk_set')?.split(':')[0] || '💤 AFK List')
        .setColor(0x5865f2)
        .setTimestamp();

      for (const [userId, data] of entries.slice(0, 20)) {
        const member = message.guild.members.cache.get(userId);
        const mention = member ? member.toString() : `<@${userId}>`;
        const since = formatSince(data.since, lang);
        embed.addFields({
          name: `💤 ${mention}`,
          value: `**Reason:** ${data.reason || '—'}\n**Since:** ${since}`,
          inline: false,
        });
      }

      if (entries.length > 20) {
        embed.setFooter({ text: `+ ${entries.length - 20} more` });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // USERINFO
  // ═══════════════════════════════════════════
  {
    name: 'userinfo',
    description: 'معلومات عضو',
    usage: '=userinfo [@user|ID]',
    aliases: ['معلومات_عضو', 'whois'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const member = args[0]
        ? await getMemberFromInput(message.guild, args[0])
        : message.member;

      if (!member) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'member_not_found'))],
        });
      }

      const user = member.user;
      const roles = member.roles.cache
        .filter((r) => r.id !== message.guild.id)
        .sort((a, b) => b.position - a.position);

      const roleText = roles.size
        ? roles.map((r) => r.toString()).slice(0, 15).join(' ')
        : tr(lang, 'userinfo_no_roles');

      const embed = new EmbedBuilder()
        .setTitle(`${tr(lang, 'userinfo_title_full')} — ${user.username}`)
        .setColor(member.displayHexColor || 0x5865f2)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setTimestamp()
        .addFields(
          { name: `🆔 ${tr(lang, 'userinfo_id')}`, value: `\`${user.id}\``, inline: true },
          {
            name: `📝 ${tr(lang, 'userinfo_nickname')}`,
            value: member.nickname || tr(lang, 'general_none'),
            inline: true,
          },
          {
            name: `🤖 ${tr(lang, 'userinfo_bot')}`,
            value: user.bot ? tr(lang, 'userinfo_yes') : tr(lang, 'userinfo_no'),
            inline: true,
          },
          {
            name: `📅 ${tr(lang, 'userinfo_created')}`,
            value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: `📥 ${tr(lang, 'userinfo_joined')}`,
            value: member.joinedTimestamp
              ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
              : '—',
            inline: true,
          },
          {
            name: `🎭 ${tr(lang, 'userinfo_roles')} (${roles.size})`,
            value: roleText.slice(0, 1024),
            inline: false,
          }
        );

      if (member.presence) {
        embed.addFields({
          name: `🌐 ${tr(lang, 'userinfo_status')}`,
          value: `\`${member.presence.status}\``,
          inline: true,
        });
      }

      embed.setFooter({ text: tr(lang, 'userinfo_requested_by', { user: message.author.tag }) });

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // SERVERINFO
  // ═══════════════════════════════════════════
  {
    name: 'serverinfo',
    description: 'معلومات السيرفر',
    usage: '=serverinfo',
    aliases: ['معلومات_السيرفر'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      try {
        await guild.members.fetch();
      } catch {}

      const humans = guild.members.cache.filter((m) => !m.user.bot).size;
      const bots = guild.members.cache.filter((m) => m.user.bot).size;
      const online = guild.members.cache.filter(
        (m) => m.presence && m.presence.status !== 'offline'
      ).size;

      const textCh = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
      const voiceCh = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
      const categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;

      const embed = new EmbedBuilder()
        .setTitle(`${tr(lang, 'serverinfo_title_full')} — ${guild.name}`)
        .setColor(0x5865f2)
        .setTimestamp()
        .addFields(
          { name: `🆔 ID`, value: `\`${guild.id}\``, inline: true },
          {
            name: `👑 ${tr(lang, 'serverinfo_owner_field')}`,
            value: `<@${guild.ownerId}>`,
            inline: true,
          },
          {
            name: `📅 ${tr(lang, 'serverinfo_created_field')}`,
            value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: `👥 ${tr(lang, 'serverinfo_members_field')} (${guild.memberCount})`,
            value: [
              `👤 ${tr(lang, 'serverinfo_humans')}: \`${humans}\``,
              `🤖 ${tr(lang, 'serverinfo_bots')}: \`${bots}\``,
              `🟢 ${tr(lang, 'serverinfo_online')}: \`${online}\``,
            ].join('\n'),
            inline: false,
          },
          {
            name: `📁 ${tr(lang, 'serverinfo_channels_field')}`,
            value: [
              `💬 ${tr(lang, 'serverinfo_text_ch')}: \`${textCh}\``,
              `🔊 ${tr(lang, 'serverinfo_voice_ch')}: \`${voiceCh}\``,
              `📂 ${tr(lang, 'serverinfo_categories')}: \`${categories}\``,
            ].join('\n'),
            inline: false,
          },
          {
            name: `🎭 ${tr(lang, 'serverinfo_roles_emojis')}`,
            value: [
              `🎭 ${tr(lang, 'serverinfo_roles_n')}: \`${guild.roles.cache.size}\``,
              `😄 ${tr(lang, 'serverinfo_emojis_n')}: \`${guild.emojis.cache.size}\``,
            ].join('\n'),
            inline: false,
          }
        );

      if (guild.iconURL()) {
        embed.setThumbnail(guild.iconURL({ size: 256 }));
      }

      if (guild.bannerURL()) {
        embed.setImage(guild.bannerURL({ size: 1024 }));
      }

      const features = [];
      if (guild.features.includes('VERIFIED')) features.push(tr(lang, 'serverinfo_feat_verified'));
      if (guild.features.includes('PARTNERED')) features.push(tr(lang, 'serverinfo_feat_partnered'));
      if (guild.features.includes('COMMUNITY')) features.push(tr(lang, 'serverinfo_feat_community'));
      if (guild.premiumTier > 0) {
        features.push(`${tr(lang, 'serverinfo_feat_boost')} (${guild.premiumTier})`);
      }
      if (features.length) {
        embed.addFields({
          name: `✨ ${tr(lang, 'serverinfo_features_field')}`,
          value: features.join(' • '),
          inline: false,
        });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // ROLEINFO
  // ═══════════════════════════════════════════
  {
    name: 'roleinfo',
    description: 'معلومات رتبة',
    usage: '=roleinfo <@role|ID>',
    aliases: ['معلومات_رتبة'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const role =
        message.mentions.roles.first() ||
        message.guild.roles.cache.get((args[0] || '').replace(/[^\d]/g, ''));

      if (!role) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'role_not_found'))],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`${tr(lang, 'roleinfo_title')} — ${role.name}`)
        .setColor(role.color || 0x5865f2)
        .setTimestamp()
        .addFields(
          { name: `🆔 ${tr(lang, 'roleinfo_id')}`, value: `\`${role.id}\``, inline: true },
          {
            name: `🎨 ${tr(lang, 'roleinfo_color')}`,
            value: role.hexColor || 'Default',
            inline: true,
          },
          {
            name: `📊 ${tr(lang, 'roleinfo_position')}`,
            value: `\`${role.position}\``,
            inline: true,
          },
          {
            name: `👥 ${tr(lang, 'roleinfo_members')}`,
            value: `\`${role.members.size}\``,
            inline: true,
          },
          {
            name: `📅 ${tr(lang, 'roleinfo_created')}`,
            value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: `📌 ${tr(lang, 'roleinfo_mentionable')}`,
            value: role.mentionable ? '✅' : '❌',
            inline: true,
          },
          {
            name: `📎 ${tr(lang, 'roleinfo_hoisted')}`,
            value: role.hoist ? '✅' : '❌',
            inline: true,
          },
          {
            name: `🔑 ${tr(lang, 'roleinfo_perms')}`,
            value: `\`${role.permissions.toArray().length}\``,
            inline: true,
          }
        );

      if (role.icon) embed.setThumbnail(role.iconURL({ size: 128 }));

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // AVATAR
  // ═══════════════════════════════════════════
  {
    name: 'avatar',
    description: 'صورة عضو',
    usage: '=avatar [@user|ID]',
    aliases: ['صورة'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const member = args[0]
        ? await getMemberFromInput(message.guild, args[0])
        : message.member;

      if (!member) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'avatar_not_found'))],
        });
      }

      const user = member.user;
      const globalAvatar = user.displayAvatarURL({ size: 1024, dynamic: true });
      const serverAvatar = member.displayAvatarURL({ size: 1024, dynamic: true });
      const hasServerAvatar = serverAvatar !== globalAvatar;

      const embed = new EmbedBuilder()
        .setTitle(`${tr(lang, 'avatar_title')} — ${user.username}`)
        .setColor(0x5865f2)
        .setImage(hasServerAvatar ? serverAvatar : globalAvatar)
        .setTimestamp()
        .addFields({
          name: tr(lang, 'avatar_download'),
          value: `[PNG](${user.displayAvatarURL({ size: 1024, extension: 'png' })}) • [JPG](${user.displayAvatarURL({ size: 1024, extension: 'jpg' })}) • [WEBP](${user.displayAvatarURL({ size: 1024, extension: 'webp' })})`,
          inline: false,
        });

      if (hasServerAvatar) {
        embed.addFields({
          name: tr(lang, 'avatar_server'),
          value: `[Server Avatar](${serverAvatar})`,
          inline: false,
        });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // BANNER
  // ═══════════════════════════════════════════
  {
    name: 'banner',
    description: 'بانر عضو',
    usage: '=banner [@user|ID]',
    aliases: ['بانر'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);

      let userId = message.author.id;
      if (args[0]) {
        const member = await getMemberFromInput(message.guild, args[0]);
        if (!member) {
          return replyHelper(message, {
            embeds: [errorEmbed(tr(lang, 'member_not_found'))],
          });
        }
        userId = member.id;
      }

      try {
        const user = await client.users.fetch(userId, { force: true });
        const banner = user.bannerURL({ size: 1024, dynamic: true });

        if (!banner) {
          return replyHelper(message, {
            embeds: [errorEmbed(tr(lang, 'banner_not_found'))],
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`${tr(lang, 'banner_title')} — ${user.username}`)
          .setColor(0x5865f2)
          .setImage(banner)
          .setTimestamp();

        return replyHelper(message, { embeds: [embed] });
      } catch (err) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'banner_unavailable'))],
        });
      }
    },
  },

  // ═══════════════════════════════════════════
  // PROFILE
  // ═══════════════════════════════════════════
  {
    name: 'profile',
    description: 'بروفايل عضو',
    usage: '=profile [@user|ID]',
    aliases: ['بروفايل'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const member = args[0]
        ? await getMemberFromInput(message.guild, args[0])
        : message.member;

      if (!member) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'member_not_found'))],
        });
      }

      const user = member.user;

      const embed = new EmbedBuilder()
        .setTitle(`${tr(lang, 'profile_title')} — ${user.username}`)
        .setColor(member.displayHexColor || 0x5865f2)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .setTimestamp()
        .addFields(
          { name: `🆔 ${tr(lang, 'profile_id')}`, value: `\`${user.id}\``, inline: true },
          {
            name: `📝 ${tr(lang, 'profile_nick')}`,
            value: member.nickname || tr(lang, 'profile_none'),
            inline: true,
          },
          {
            name: `📅 ${tr(lang, 'profile_created_at')}`,
            value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
            inline: true,
          },
          {
            name: `📥 ${tr(lang, 'profile_joined')}`,
            value: member.joinedTimestamp
              ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
              : '—',
            inline: true,
          },
          {
            name: `🤖 ${tr(lang, 'profile_is_bot')}`,
            value: user.bot ? tr(lang, 'profile_yes') : tr(lang, 'profile_no'),
            inline: true,
          }
        );

      const roles = member.roles.cache
        .filter((r) => r.id !== message.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => r.toString());

      if (roles.length) {
        const roleText = roles.slice(0, 10).join(' ');
        const more = roles.length > 10 ? `\n+${roles.length - 10}` : '';
        embed.addFields({
          name: `🎭 ${tr(lang, 'profile_roles')} (${roles.length})`,
          value: (roleText + more).slice(0, 1024),
          inline: false,
        });
      }

      if (user.bannerURL()) {
        embed.setImage(user.bannerURL({ size: 1024, dynamic: true }));
      }

      embed.setFooter({ text: tr(lang, 'profile_requested_by', { user: message.author.tag }) });

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // LOCKALL
  // ═══════════════════════════════════════════
  {
    name: 'lockall',
    description: 'قفل كل القنوات النصية',
    usage: '=lockall [reason]',
    aliases: ['قفل_الكل'],
    category: 'utility',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'lockall_admin_only'))],
        });
      }

      const reason = args.join(' ').trim() || tr(lang, 'lockall_reason_default');
      const channels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText
      );

      if (!channels.size) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'lockall_no_channels'))],
        });
      }

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        tr(lang, 'lockall_confirm_full', { n: channels.size })
      );
      if (!confirmed) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });
      }

      let success = 0;
      for (const [, ch] of channels) {
        try {
          await ch.permissionOverwrites.edit(
            guild.roles.everyone,
            { SendMessages: false },
            { reason: `Lockall by ${message.author.tag}: ${reason}` }
          );
          success++;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }

      return replyHelper(message, {
        embeds: [
          successEmbed(
            tr(lang, 'lockall_done_n', { n: success }) + `\n**${tr(lang, 'lockall_reason')}:** ${reason}`
          ),
        ],
      });
    },
  },

  // ═══════════════════════════════════════════
  // UNLOCKALL
  // ═══════════════════════════════════════════
  {
    name: 'unlockall',
    description: 'فتح كل القنوات النصية',
    usage: '=unlockall [reason]',
    aliases: ['فتح_الكل'],
    category: 'utility',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'lockall_admin_only'))],
        });
      }

      const reason = args.join(' ').trim() || tr(lang, 'lockall_reason_default');
      const channels = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildText
      );

      if (!channels.size) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'lockall_no_channels'))],
        });
      }

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        tr(lang, 'unlockall_confirm_full', { n: channels.size })
      );
      if (!confirmed) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });
      }

      let success = 0;
      for (const [, ch] of channels) {
        try {
          await ch.permissionOverwrites.edit(
            guild.roles.everyone,
            { SendMessages: null },
            { reason: `Unlockall by ${message.author.tag}: ${reason}` }
          );
          success++;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }

      return replyHelper(message, {
        embeds: [
          successEmbed(
            tr(lang, 'unlockall_done_n', { n: success }) + `\n**${tr(lang, 'lockall_reason')}:** ${reason}`
          ),
        ],
      });
    },
  },
];

export default { commands };
