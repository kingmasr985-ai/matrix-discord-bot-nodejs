/**
 * jail.js
 * ============================================
 * نظام السجن — Node.js
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
  jailDB,
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
  canModerate,
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

const DEFAULT_JAIL_ROLE_NAME = 'Jail';
const JAIL_ROLE_ALIASES = ['Jail', 'jail', 'سجن', 'مسجون', 'معتقل'];

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
// getJailRole
// ============================================
function getJailRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === DEFAULT_JAIL_ROLE_NAME);
  if (role) return role;
  for (const name of JAIL_ROLE_ALIASES) {
    role = guild.roles.cache.find((r) => r.name === name);
    if (role) return role;
  }
  return null;
}

// ============================================
// getOrCreateJailRole
// ============================================
async function getOrCreateJailRole(guild) {
  let role = getJailRole(guild);
  if (role) return role;

  try {
    role = await guild.roles.create({
      name: DEFAULT_JAIL_ROLE_NAME,
      color: 0x8b0000,
      permissions: [],
      reason: 'Auto-create Jail role',
    });

    for (const [, ch] of guild.channels.cache) {
      if (![ChannelType.GuildText, ChannelType.GuildVoice].includes(ch.type)) continue;
      try {
        await ch.permissionOverwrites.edit(role, {
          ViewChannel: false,
          SendMessages: false,
        }, { reason: 'Apply Jail' });
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }

    try {
      const pos = Math.max(1, guild.members.me.roles.highest.position - 1);
      await role.setPosition(pos);
    } catch {}

    return role;
  } catch (err) {
    logger.error('create jail role error:', err.message);
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
// Confirmation
// ============================================
async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `jail_yes_${authorId}_${Date.now()}`;
  const noId = `jail_no_${authorId}_${Date.now()}`;

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
  // JAIL
  // ═══════════════════════════════════════════
  {
    name: 'jail',
    description: 'سجن عضو (سحب رولاته)',
    usage: '=jail <@user|ID> [reason]',
    aliases: ['سجن'],
    category: 'jail',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const input = args[0];
      if (!input) return replyHelper(message, { embeds: [errorEmbed('❌ Specify a member.')] });

      const reason = args.slice(1).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const member = await getMemberFromInput(guild, input);
      if (!member) return replyHelper(message, { embeds: [errorEmbed('❌ Member not found.')] });

      const [canMod, errMsg] = canModerate(author, member, guild.members.me);
      if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });

      const existing = jailDB.get(guild.id, member.id);
      if (existing) {
        return replyHelper(message, { embeds: [errorEmbed(`⚠️ ${member} is already jailed.`)] });
      }

      const jailRole = await getOrCreateJailRole(guild);
      if (!jailRole) return replyHelper(message, { embeds: [errorEmbed('❌ Failed to create Jail role.')] });

      const rolesToRemove = member.roles.cache.filter(
        (r) => r.id !== guild.id && r.id !== jailRole.id && !r.managed && r.position < guild.members.me.roles.highest.position
      );

      const roleIds = [...rolesToRemove.keys()];
      const saved = jailDB.add(guild.id, member.id, author.id, roleIds, reason);
      if (!saved) return replyHelper(message, { embeds: [errorEmbed('❌ Save failed.')] });

      try {
        if (rolesToRemove.size) {
          await discordRetry(member.roles.remove.bind(member.roles), rolesToRemove, `Jail by ${author.tag}`);
        }
        await discordRetry(member.roles.add.bind(member.roles), jailRole, `Jail by ${author.tag}`);
      } catch (err) {
        jailDB.remove(guild.id, member.id);
        logger.error('jail apply error:', err.message);
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }

      logging.logAction(guild.id, 'jail', author.id, member.id, `roles=${roleIds.length}`);

      try {
        await member.send({
          embeds: [new EmbedBuilder()
            .setTitle('🔒 You were jailed')
            .setDescription(`In **${guild.name}**`)
            .setColor(0x8b0000)
            .addFields(
              { name: 'Reason', value: reason },
              { name: 'Moderator', value: author.tag }
            )
            .setTimestamp()
          ],
        });
      } catch {}

      return replyHelper(message, {
        embeds: [successEmbed(`🔒 Jailed ${member}.\n**Reason:** ${reason}\n**Roles removed:** \`${roleIds.length}\``)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // UNJAIL
  // ═══════════════════════════════════════════
  {
    name: 'unjail',
    description: 'فك سجن عضو',
    usage: '=unjail <@user|ID>',
    aliases: ['فك_سجن'],
    category: 'jail',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const input = args[0];
      if (!input) return replyHelper(message, { embeds: [errorEmbed('❌ Specify a member.')] });

      const member = await getMemberFromInput(guild, input);
      if (!member) return replyHelper(message, { embeds: [errorEmbed('❌ Member not found.')] });

      const [canMod, errMsg] = canModerate(author, member, guild.members.me);
      if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });

      const jailed = jailDB.get(guild.id, member.id);
      if (!jailed) return replyHelper(message, { embeds: [errorEmbed(`⚠️ ${member} is not jailed.`)] });

      const jailRole = getJailRole(guild);

      try {
        if (jailRole && member.roles.cache.has(jailRole.id)) {
          await discordRetry(member.roles.remove.bind(member.roles), jailRole, `Unjail by ${author.tag}`);
        }

        const rolesToRestore = [];
        for (const rid of jailed.role_ids || []) {
          const role = guild.roles.cache.get(rid);
          if (role && role.position < guild.members.me.roles.highest.position && !role.managed) {
            rolesToRestore.push(role);
          }
        }

        if (rolesToRestore.length) {
          await discordRetry(member.roles.add.bind(member.roles), rolesToRestore, `Unjail by ${author.tag}`);
        }

        jailDB.remove(guild.id, member.id);
        logging.logAction(guild.id, 'unjail', author.id, member.id, `restored=${rolesToRestore.length}`);

        return replyHelper(message, {
          embeds: [successEmbed(`🔓 Unjailed ${member}.\n**Roles restored:** \`${rolesToRestore.length}\``)],
        });
      } catch (err) {
        logger.error('unjail error:', err.message);
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // JAILLIST
  // ═══════════════════════════════════════════
  {
    name: 'jaillist',
    description: 'عرض المسجونين',
    usage: '=jaillist',
    aliases: ['jailed', 'المسجونين'],
    category: 'jail',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const jailed = jailDB.getAll(message.guild.id);
      if (!jailed.length) {
        return replyHelper(message, { embeds: [errorEmbed('✅ No jailed users.')] });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔒 Jailed (${jailed.length})`)
        .setColor(0x8b0000)
        .setTimestamp();

      for (const data of jailed.slice(0, 20)) {
        const member = message.guild.members.cache.get(data.user_id);
        const mention = member ? member.toString() : `\`${data.user_id}\``;
        embed.addFields({
          name: `🔒 ${mention}`,
          value: `**Reason:** ${(data.reason || '—').slice(0, 100)}\n**Roles:** \`${(data.role_ids || []).length}\``,
          inline: false,
        });
      }

      if (jailed.length > 20) {
        embed.setFooter({ text: `+ ${jailed.length - 20} more` });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // SETUPJAIL
  // ═══════════════════════════════════════════
  {
    name: 'setupjail',
    description: 'إعداد رتبة Jail',
    usage: '=setupjail',
    category: 'jail',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const existing = getJailRole(message.guild);
      const wasExisting = !!existing;

      const role = await getOrCreateJailRole(message.guild);
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Failed to create Jail role.')] });

      const embed = new EmbedBuilder()
        .setTitle('✅ Jail configured')
        .setColor(0x57f287)
        .setTimestamp()
        .addFields(
          { name: 'Role', value: role.toString(), inline: true },
          {
            name: 'Status',
            value: wasExisting ? 'Already existed' : 'Newly created',
            inline: true,
          },
          {
            name: 'Usage',
            value: '`=jail @user` → remove all roles\n`=unjail @user` → restore roles\n`=jaillist` → show jailed',
            inline: false,
          }
        );

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // JAILINFO
  // ═══════════════════════════════════════════
  {
    name: 'jailinfo',
    description: 'معلومات عن مسجون',
    usage: '=jailinfo <@user|ID>',
    aliases: ['معلومات_السجن'],
    category: 'jail',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const member = await getMemberFromInput(message.guild, args[0]);
      if (!member) return replyHelper(message, { embeds: [errorEmbed('❌ Member not found.')] });

      const data = jailDB.get(message.guild.id, member.id);
      if (!data) return replyHelper(message, { embeds: [errorEmbed(`⚠️ ${member} is not jailed.`)] });

      const embed = new EmbedBuilder()
        .setTitle(`🔒 Jail Info — ${member.user.username}`)
        .setColor(0x8b0000)
        .setThumbnail(member.displayAvatarURL())
        .setTimestamp()
        .addFields(
          { name: '🆔 ID', value: `\`${member.id}\``, inline: true },
          { name: '👤 Status', value: '🔒 Jailed', inline: true }
        );

      if (data.jailed_at) {
        embed.addFields({ name: '📅 Jailed At', value: `<t:${data.jailed_at}:R>`, inline: true });
      }
      if (data.jailed_by) {
        embed.addFields({ name: '👮 By', value: `<@${data.jailed_by}>`, inline: true });
      }
      embed.addFields({ name: '📝 Reason', value: (data.reason || '—').slice(0, 200), inline: false });

      if (data.role_ids?.length) {
        const roles = data.role_ids.map((rid) => message.guild.roles.cache.get(rid)).filter(Boolean);
        const text = roles.slice(0, 10).map((r) => r.toString()).join(', ');
        embed.addFields({ name: `🎭 Roles Saved (${roles.length})`, value: text || '—', inline: false });
      }

      if (data.release_at) {
        embed.addFields({ name: '⏰ Release At', value: `<t:${data.release_at}:R>`, inline: true });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // TEMPJAIL
  // ═══════════════════════════════════════════
  {
    name: 'tempjail',
    description: 'سجن مؤقت (إفراج تلقائي)',
    usage: '=tempjail <@user|ID> <duration> [reason]',
    aliases: ['سجن_مؤقت'],
    category: 'jail',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const input = args[0];
      const durationInput = args[1];
      if (!input || !durationInput) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =tempjail @user 1h reason')] });
      }

      const seconds = parseDuration(durationInput, 'm');
      if (!seconds || seconds / 1000 < MIN_TIMEOUT_SECONDS) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Min 1 min. Examples: 30m, 1h, 1d')] });
      }

      const reason = args.slice(2).join(' ') || (lang === 'ar' ? 'بدون سبب' : 'No reason');
      const member = await getMemberFromInput(guild, input);
      if (!member) return replyHelper(message, { embeds: [errorEmbed('❌ Member not found.')] });

      const [canMod, errMsg] = canModerate(author, member, guild.members.me);
      if (!canMod) return replyHelper(message, { embeds: [errorEmbed(errMsg)] });

      const existing = jailDB.get(guild.id, member.id);
      if (existing) return replyHelper(message, { embeds: [errorEmbed(`⚠️ ${member} already jailed.`)] });

      const jailRole = await getOrCreateJailRole(guild);
      if (!jailRole) return replyHelper(message, { embeds: [errorEmbed('❌ Failed to create Jail role.')] });

      const rolesToRemove = member.roles.cache.filter(
        (r) => r.id !== guild.id && r.id !== jailRole.id && !r.managed && r.position < guild.members.me.roles.highest.position
      );

      const roleIds = [...rolesToRemove.keys()];
      const releaseAt = Math.floor(Date.now() / 1000) + Math.floor(seconds / 1000);

      const saved = jailDB.add(guild.id, member.id, author.id, roleIds, reason);
      if (!saved) return replyHelper(message, { embeds: [errorEmbed('❌ Failed.')] });

      jailDB.setReleaseAt(guild.id, member.id, releaseAt);

      try {
        if (rolesToRemove.size) {
          await discordRetry(member.roles.remove.bind(member.roles), rolesToRemove, `TempJail by ${author.tag}`);
        }
        await discordRetry(member.roles.add.bind(member.roles), jailRole, `TempJail by ${author.tag}`);
      } catch (err) {
        jailDB.remove(guild.id, member.id);
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }

      const durationText = formatDuration(seconds);

      try {
        await member.send({
          embeds: [new EmbedBuilder()
            .setTitle(`🔒 Temp Jail (${durationText})`)
            .setDescription(`In **${guild.name}**`)
            .setColor(0x8b0000)
            .addFields(
              { name: 'Reason', value: reason },
              { name: 'Duration', value: durationText }
            )
          ],
        });
      } catch {}

      logging.logAction(guild.id, 'tempjail', author.id, member.id, `[${durationText}]`);

      return replyHelper(message, {
        embeds: [successEmbed(`🔒 Temporarily jailed ${member}.\n**Duration:** \`${durationText}\`\n**Reason:** ${reason}`)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // JAILSTATS
  // ═══════════════════════════════════════════
  {
    name: 'jailstats',
    description: 'إحصائيات السجن',
    usage: '=jailstats',
    aliases: ['احصائيات_السجن'],
    category: 'jail',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const count = jailDB.count(message.guild.id);
      const jailed = jailDB.getAll(message.guild.id);

      const embed = new EmbedBuilder()
        .setTitle('📊 Jail Statistics')
        .setColor(0x9b59b6)
        .setTimestamp()
        .addFields(
          { name: '🔒 Currently Jailed', value: `**${count}**`, inline: true },
          { name: '👥 Total (active)', value: `**${jailed.length}**`, inline: true }
        );

      if (jailed.length) {
        const recent = jailed.slice(0, 5).map((d) => {
          const m = message.guild.members.cache.get(d.user_id);
          return `• ${m ? m.toString() : `\`${d.user_id}\``}`;
        }).join('\n');
        embed.addFields({ name: '🕒 Recent Jailed', value: recent, inline: false });
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // UNJAILALL
  // ═══════════════════════════════════════════
  {
    name: 'unjailall',
    description: 'فك سجن الجميع (admin)',
    usage: '=unjailall',
    aliases: ['فك_سجن_الكل'],
    category: 'jail',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.author;

      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const jailed = jailDB.getAll(guild.id);
      if (!jailed.length) {
        return replyHelper(message, { embeds: [errorEmbed('✅ No jailed users.')] });
      }

      const prompt = `⚠️ **Confirm unjailing ${jailed.length} members?**`;
      const confirmed = await sendConfirmation(message, false, lang, prompt);
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      const jailRole = getJailRole(guild);
      let success = 0, failed = 0;

      for (const data of jailed) {
        const member = guild.members.cache.get(data.user_id);
        if (!member) {
          jailDB.remove(guild.id, data.user_id);
          failed++;
          continue;
        }

        try {
          if (jailRole && member.roles.cache.has(jailRole.id)) {
            await member.roles.remove(jailRole, `Unjailall by ${author.tag}`).catch(() => {});
          }

          const rolesToRestore = [];
          for (const rid of data.role_ids || []) {
            const role = guild.roles.cache.get(rid);
            if (role && role.position < guild.members.me.roles.highest.position && !role.managed) {
              rolesToRestore.push(role);
            }
          }

          if (rolesToRestore.length) {
            await member.roles.add(rolesToRestore, `Unjailall by ${author.tag}`).catch(() => {});
          }

          jailDB.remove(guild.id, member.id);
          success++;
        } catch {
          failed++;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      logging.logAction(guild.id, 'unjailall', author.id, 0, `success=${success} failed=${failed}`);

      return replyHelper(message, {
        embeds: [successEmbed(`✅ **Unjailall:** success \`${success}\` • failed \`${failed}\``)],
      });
    },
  },
];

// ============================================
// Auto-release loop
// ============================================
export function startJailAutoReleaseLoop(client) {
  setInterval(async () => {
    try {
      const expired = jailDB.getExpired();
      if (!expired.length) return;

      logger.info(`⏰ Processing ${expired.length} expired jail(s)...`);

      for (const data of expired) {
        const guild = client.guilds.cache.get(data.guild_id);
        if (!guild) {
          jailDB.remove(data.guild_id, data.user_id);
          continue;
        }

        const member = guild.members.cache.get(data.user_id);
        const jailRole = getJailRole(guild);

        if (member) {
          try {
            if (jailRole && member.roles.cache.has(jailRole.id)) {
              await member.roles.remove(jailRole, 'Temp jail expired').catch(() => {});
            }

            const rolesToRestore = [];
            for (const rid of data.role_ids || []) {
              const role = guild.roles.cache.get(rid);
              if (role && role.position < guild.members.me.roles.highest.position && !role.managed) {
                rolesToRestore.push(role);
              }
            }

            if (rolesToRestore.length) {
              await member.roles.add(rolesToRestore, 'Temp jail expired').catch(() => {});
            }

            logger.info(`🔓 Auto-released ${member.user.tag} from jail`);
          } catch (err) {
            logger.debug('auto-release error:', err.message);
          }
        }

        jailDB.remove(data.guild_id, data.user_id);
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      logger.error('jail auto-release loop error:', err.message);
    }
  }, 60000);

  logger.info('✅ Jail auto-release loop started (every 60s)');
}

export default { commands, startJailAutoReleaseLoop };
