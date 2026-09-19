/**
 * roles.js
 * ============================================
 * إدارة الرتب — Node.js
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
  guilds,
  commandPermissions,
  logging,
} from '../database.js';

import {
  logger,
  errorEmbed,
  successEmbed,
  discordRetry,
  getMemberFromInput,
  replyHelper,
  canModerate,
  t,
} from '../utils.js';

import {
  DEFAULT_COOLDOWN,
  DANGEROUS_COOLDOWN,
  CONFIRMATION_TIMEOUT,
  NAMED_COLORS,
  AVAILABLE_COMMANDS,
  cleanCommandName,
} from '../constants.js';

const MASS_ROLE_MAX_TARGETS = 100;

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
// parseHexColor
// ============================================
function parseHexColor(input) {
  if (!input) return null;
  let clean = String(input).trim().replace(/\s/g, '').replace('#', '');
  if (clean.toLowerCase().startsWith('0x')) clean = clean.slice(2);

  const lower = clean.toLowerCase();
  if (NAMED_COLORS[lower]) clean = NAMED_COLORS[lower];

  if (/^[0-9A-Fa-f]{3}$/.test(clean)) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return null;

  try {
    return parseInt(clean, 16);
  } catch {
    return null;
  }
}

// ============================================
// canManageRole
// ============================================
function canManageRole(user, role, botMember) {
  const guild = role.guild;
  if (role.id === guild.id || role.isDefault?.()) {
    return [false, '❌ Cannot modify @everyone.'];
  }
  if (role.managed) {
    return [false, '❌ This role is managed by an integration.'];
  }
  if (role.position >= botMember.roles.highest.position) {
    return [false, "❌ Role is >= bot's highest role."];
  }
  if (!user.permissions.has('Administrator')) {
    if (role.position >= user.roles.highest.position) {
      return [false, '❌ Role is >= your highest role.'];
    }
  }
  return [true, ''];
}

// ============================================
// Confirmation
// ============================================
async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `role_yes_${authorId}_${Date.now()}`;
  const noId = `role_no_${authorId}_${Date.now()}`;

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
  // COLORS
  // ═══════════════════════════════════════════
  {
    name: 'colors',
    description: 'عرض الألوان المدعومة',
    usage: '=colors',
    aliases: ['الوان', 'ألوان'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const text =
        '🎨 **Supported Colors / الألوان**\n\n' +
        '**HEX:** `FF0000` / `#FF0000` / `F00` / `0xFF0000`\n\n' +
        '**English:** red, green, blue, yellow, orange, purple, pink, black, white, cyan, gold, silver\n\n' +
        '**عربي:** أحمر، أخضر، أزرق، أصفر، برتقالي، بنفسجي، وردي، أسود، أبيض، سماوي، ذهبي، فضي';

      return replyHelper(message, { embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(text)] });
    },
  },

  // ═══════════════════════════════════════════
  // CREATEROLE
  // ═══════════════════════════════════════════
  {
    name: 'createrole',
    description: 'إنشاء رتبة جديدة',
    usage: '=createrole <name> [color]',
    aliases: ['انشاء_رتبة'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const roleName = (args[0] || '').trim();
      if (!roleName || roleName.length > 100) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Invalid name (1-100).')] });
      }

      let color = null;
      let colorDisplay = lang === 'ar' ? 'بدون لون' : 'No color';
      if (args[1]) {
        color = parseHexColor(args[1]);
        if (color === null) return replyHelper(message, { embeds: [errorEmbed('⚠️ Invalid color.')] });
        colorDisplay = `\`${args[1]}\``;
      }

      try {
        const newRole = await discordRetry(message.guild.roles.create.bind(message.guild.roles), {
          name: roleName,
          color,
          reason: `Created by ${message.author.tag}`,
        });

        logging.logAction(message.guild.id, 'createrole', message.author.id, 0, `role=${newRole.id}`);

        return replyHelper(message, {
          embeds: [successEmbed(`✅ Created ${newRole.toString()}\n🎨 ${colorDisplay}`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // DELETEROLE
  // ═══════════════════════════════════════════
  {
    name: 'deleterole',
    description: 'حذف رتبة (مع تأكيد)',
    usage: '=deleterole <@role>',
    aliases: ['حذف_رتبة'],
    category: 'roles',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const role = message.mentions.roles.first() || message.guild.roles.cache.get((args[0] || '').replace(/[^\d]/g, ''));
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      const memberCount = role.members.size;
      const prompt = lang === 'ar'
        ? `⚠️ **تأكيد حذف ${role.toString()}?**\n**الأعضاء:** \`${memberCount}\``
        : `⚠️ **Confirm deleting ${role.toString()}?**\n**Members:** \`${memberCount}\``;

      const confirmed = await sendConfirmation(message, false, lang, prompt);
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      try {
        const roleName = role.name;
        const roleId = role.id;
        await discordRetry(role.delete.bind(role), `Deleted by ${message.author.tag}`);
        logging.logAction(message.guild.id, 'deleterole', message.author.id, 0, `role=${roleId}`);

        return replyHelper(message, {
          embeds: [successEmbed(`🗑️ Deleted \`${roleName}\` (${memberCount} members).`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // SETROLENAME
  // ═══════════════════════════════════════════
  {
    name: 'setrolename',
    description: 'تغيير اسم رتبة',
    usage: '=setrolename <@role> <name>',
    aliases: ['اسم_الرتبة'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const newName = args.slice(1).join(' ').trim();
      if (!newName || newName.length > 100) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ Invalid name.')] });
      }

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      try {
        const oldName = role.name;
        await discordRetry(role.setName.bind(role), newName, `By ${message.author.tag}`);
        return replyHelper(message, {
          embeds: [successEmbed(`✅ Renamed.\n**Before:** \`${oldName}\`\n**After:** \`${newName}\``)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // SETROLECOLOR
  // ═══════════════════════════════════════════
  {
    name: 'setrolecolor',
    description: 'تغيير لون رتبة',
    usage: '=setrolecolor <@role> <color>',
    aliases: ['لون_الرتبة'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const color = parseHexColor(args[1]);
      if (color === null) return replyHelper(message, { embeds: [errorEmbed('⚠️ Invalid color.')] });

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      try {
        await discordRetry(role.setColor.bind(role), color, `By ${message.author.tag}`);
        return replyHelper(message, {
          embeds: [new EmbedBuilder().setColor(color).setDescription(`✅ Changed color of ${role.toString()} to \`${args[1]}\``)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // SETROLEPOSITION
  // ═══════════════════════════════════════════
  {
    name: 'setroleposition',
    description: 'تغيير ترتيب رتبة',
    usage: '=setroleposition <@role> <position>',
    aliases: ['ترتيب_الرتبة'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const position = parseInt(args[1]);
      if (isNaN(position)) return replyHelper(message, { embeds: [errorEmbed('❌ Invalid number.')] });

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      try {
        const oldPos = role.position;
        await discordRetry(role.setPosition.bind(role), position, `By ${message.author.tag}`);
        return replyHelper(message, {
          embeds: [successEmbed(`✅ Moved ${role.toString()}: \`${oldPos}\` → \`${position}\``)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // ADDMOD
  // ═══════════════════════════════════════════
  {
    name: 'addmod',
    description: 'إضافة رتبة كمشرف لأوامر',
    usage: '=addmod <@role> <cmd1> <cmd2> ...',
    aliases: ['اضافة_مشرف'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const rawCmds = args.slice(1).join(' ').replace(/,/g, ' ').split(/\s+/).map(cleanCommandName).filter(Boolean);
      if (!rawCmds.length) return replyHelper(message, { embeds: [errorEmbed('⚠️ Provide at least one command.')] });

      const valid = rawCmds.filter((c) => AVAILABLE_COMMANDS.includes(c));
      const invalid = rawCmds.filter((c) => !AVAILABLE_COMMANDS.includes(c));

      const added = [];
      const already = [];

      for (const cmd of valid) {
        try {
          if (commandPermissions.addMod(message.guild.id, cmd, role.id)) {
            added.push(cmd);
          } else {
            already.push(cmd);
          }
        } catch {}
      }

      const lines = [];
      if (added.length) lines.push(`✅ Added ${role.toString()} to: ${added.map((c) => `\`=${c}\``).join(', ')}`);
      if (already.length) lines.push(`⚠️ Already: ${already.map((c) => `\`=${c}\``).join(', ')}`);
      if (invalid.length) lines.push(`❌ Unknown: ${invalid.join(', ')}`);

      return replyHelper(message, { embeds: [successEmbed(lines.join('\n'))] });
    },
  },

  // ═══════════════════════════════════════════
  // REMOVEMOD
  // ═══════════════════════════════════════════
  {
    name: 'removemod',
    description: 'إزالة رتبة من مشرفي الأوامر',
    usage: '=removemod <@role> <cmd1> <cmd2> ...',
    aliases: ['ازالة_مشرف', 'remove-mod'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const cmds = args.slice(1).join(' ').replace(/,/g, ' ').split(/\s+/).map(cleanCommandName).filter(Boolean);
      if (!cmds.length) return replyHelper(message, { embeds: [errorEmbed('⚠️ Provide at least one command.')] });

      const removed = [];
      const notFound = [];

      for (const cmd of cmds) {
        try {
          if (commandPermissions.removeMod(message.guild.id, cmd, role.id)) {
            removed.push(cmd);
          } else {
            notFound.push(cmd);
          }
        } catch {}
      }

      const lines = [];
      if (removed.length) lines.push(`🗑️ Removed ${role.toString()} from: ${removed.map((c) => `\`=${c}\``).join(', ')}`);
      if (notFound.length) lines.push(`⚠️ Not registered: ${notFound.map((c) => `\`=${c}\``).join(', ')}`);

      return replyHelper(message, { embeds: [successEmbed(lines.join('\n') || 'Nothing.')] });
    },
  },

  // ═══════════════════════════════════════════
  // MODS
  // ═══════════════════════════════════════════
  {
    name: 'mods',
    description: 'عرض صلاحيات الرتب',
    usage: '=mods',
    aliases: ['مشرفين'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const allMods = commandPermissions.getAllModerators(message.guild.id);
      if (!Object.keys(allMods).length) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ No moderator roles.')] });
      }

      const roleToCmds = {};
      for (const [cmd, roleIds] of Object.entries(allMods)) {
        for (const rid of roleIds) {
          if (!roleToCmds[rid]) roleToCmds[rid] = [];
          roleToCmds[rid].push(cmd);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Role Permissions')
        .setColor(0x5865f2)
        .setTimestamp();

      for (const [rid, cmds] of Object.entries(roleToCmds)) {
        const role = message.guild.roles.cache.get(rid);
        const formatted = cmds.sort().map((c) => `\`/${c}\``).join(', ');
        embed.addField(
          role ? `📌 ${role.name}` : `📌 Deleted (${rid})`,
          `**Commands:** ${formatted}`,
          false
        );
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
    usage: '=roleinfo <@role>',
    aliases: ['معلومات_الرتبة'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get((args[0] || '').replace(/[^\d]/g, ''));
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const permsCount = role.permissions.toArray().length;

      const embed = new EmbedBuilder()
        .setTitle(`🎭 ${role.name}`)
        .setColor(role.color || 0x000000)
        .setTimestamp()
        .addFields(
          { name: '🆔 ID', value: `\`${role.id}\``, inline: true },
          { name: '🎨 Color', value: role.hexColor || 'None', inline: true },
          { name: '📊 Position', value: `\`${role.position}\``, inline: true },
          { name: '👥 Members', value: `\`${role.members.size}\``, inline: true },
          { name: '📅 Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
          { name: '🤖 Managed', value: role.managed ? '✅' : '❌', inline: true },
          { name: '📌 Mentionable', value: role.mentionable ? '✅' : '❌', inline: true },
          { name: '📎 Hoisted', value: role.hoist ? '✅' : '❌', inline: true },
          { name: '🔑 Permissions', value: `\`${permsCount}\``, inline: false }
        );

      if (role.icon) embed.setThumbnail(role.iconURL({ size: 128 }));
      return replyHelper(message, { embeds: [embed] });
    },
  },

  // ═══════════════════════════════════════════
  // GIVEROLE
  // ═══════════════════════════════════════════
  {
    name: 'giverole',
    description: 'إعطاء رتبة لعضو',
    usage: '=giverole <@user> <@role>',
    aliases: ['رتبة', 'اعطاء_رتبة'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const member = message.mentions.members.first();
      const role = message.mentions.roles.first();
      if (!member || !role) return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =giverole @user @role')] });

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      try {
        await discordRetry(member.roles.add.bind(member.roles), role, `By ${message.author.tag}`);
        return replyHelper(message, { embeds: [successEmbed(`✅ Gave ${role.toString()} to ${member.toString()}`)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // TAKEROLE
  // ═══════════════════════════════════════════
  {
    name: 'takerole',
    description: 'إزالة رتبة من عضو',
    usage: '=takerole <@user> <@role>',
    aliases: ['سحب_رتبة'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const member = message.mentions.members.first();
      const role = message.mentions.roles.first();
      if (!member || !role) return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =takerole @user @role')] });

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      try {
        await discordRetry(member.roles.remove.bind(member.roles), role, `By ${message.author.tag}`);
        return replyHelper(message, { embeds: [successEmbed(`🗑️ Removed ${role.toString()} from ${member.toString()}`)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // ROLEALL
  // ═══════════════════════════════════════════
  {
    name: 'roleall',
    description: 'إعطاء رتبة لكل الأعضاء البشر',
    usage: '=roleall <@role>',
    aliases: ['رتبة_الجميع'],
    category: 'roles',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      const humans = message.guild.members.cache.filter((m) => !m.user.bot && !m.roles.cache.has(role.id));
      if (!humans.size) return replyHelper(message, { embeds: [errorEmbed('⚠️ All members already have this role.')] });

      const prompt = lang === 'ar'
        ? `⚠️ **تأكيد إعطاء ${role.toString()} لـ ${humans.size} عضو؟**`
        : `⚠️ **Confirm giving ${role.toString()} to ${humans.size} humans?**`;

      const confirmed = await sendConfirmation(message, false, lang, prompt);
      if (!confirmed) return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });

      let success = 0, failed = 0;
      for (const [, member] of humans) {
        try {
          await member.roles.add(role, `Roleall by ${message.author.tag}`);
          success++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 100));
      }

      return replyHelper(message, {
        embeds: [successEmbed(`✅ **Roleall:** Added to \`${success}\`, failed \`${failed}\`.`)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // MASSROLE
  // ═══════════════════════════════════════════
  {
    name: 'massrole',
    description: 'إعطاء رتبة لأعضاء محددين',
    usage: '=massrole <@role> <@u1 @u2 ...>',
    aliases: ['رتبة_جماعية'],
    category: 'roles',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      const idsRaw = [...new Set((message.content.match(/\d{17,20}/g) || []).filter((id) => id !== role.id && !message.mentions.roles.has(id)))];
      if (!idsRaw.length) return replyHelper(message, { embeds: [errorEmbed('❌ No members found.')] });
      if (idsRaw.length > MASS_ROLE_MAX_TARGETS) return replyHelper(message, { embeds: [errorEmbed(`⚠️ Max ${MASS_ROLE_MAX_TARGETS}.`)] });

      let success = 0, failed = 0, already = 0;
      for (const uid of idsRaw) {
        const member = message.guild.members.cache.get(uid);
        if (!member) { failed++; continue; }
        if (member.roles.cache.has(role.id)) { already++; continue; }
        try { await member.roles.add(role, `Massrole by ${message.author.tag}`); success++; }
        catch { failed++; }
        await new Promise((r) => setTimeout(r, 100));
      }

      return replyHelper(message, {
        embeds: [successEmbed(`✅ **Massrole:** success \`${success}\` • already \`${already}\` • failed \`${failed}\``)],
      });
    },
  },

  // ═══════════════════════════════════════════
  // ROLEHOIST
  // ═══════════════════════════════════════════
  {
    name: 'rolehoist',
    description: 'إظهار/إخفاء رتبة من القائمة',
    usage: '=rolehoist <@role>',
    aliases: ['اظهار_الرتبة'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('ManageRoles')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ No permission.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return replyHelper(message, { embeds: [errorEmbed('❌ Role not found.')] });

      const [can, err] = canManageRole(message.member, role, message.guild.members.me);
      if (!can) return replyHelper(message, { embeds: [errorEmbed(err)] });

      const newHoist = !role.hoist;
      try {
        await discordRetry(role.setHoist.bind(role), newHoist, `By ${message.author.tag}`);
        const status = newHoist ? 'shown in sidebar' : 'hidden from sidebar';
        return replyHelper(message, { embeds: [successEmbed(`✅ Updated ${role.toString()}: **${status}**`)] });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // LISTMODS
  // ═══════════════════════════════════════════
  {
    name: 'listmods',
    description: 'عرض المشرفين',
    usage: '=listmods [command]',
    aliases: ['قائمة_مشرفين'],
    category: 'roles',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Admin only.')] });
      }

      const allMods = commandPermissions.getAllModerators(message.guild.id);
      if (!Object.keys(allMods).length) {
        return replyHelper(message, { embeds: [errorEmbed('⚠️ No moderator roles.')] });
      }

      const target = (args[0] || '').toLowerCase().replace(/^[=/]/, '');
      if (target && allMods[target]) {
        const roleIds = allMods[target];
        const roles = roleIds.map((rid) => message.guild.roles.cache.get(rid)).filter(Boolean);
        const embed = new EmbedBuilder()
          .setTitle(`🛡️ Moderators of \`=${target}\``)
          .setColor(0x5865f2)
          .addFields({ name: 'Roles', value: roles.length ? roles.map((r) => `• ${r.toString()}`).join('\n') : '⚠️ Deleted' });
        return replyHelper(message, { embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Moderators per command')
        .setColor(0x5865f2);

      for (const cmd of Object.keys(allMods).sort()) {
        const roleIds = allMods[cmd];
        const roles = roleIds.map((rid) => message.guild.roles.cache.get(rid)).filter(Boolean);
        const value = roles.length ? roles.map((r) => `• ${r.toString()}`).join('\n') : '⚠️ Deleted';
        embed.addField(`\`=${cmd}\``, value, true);
      }

      return replyHelper(message, { embeds: [embed] });
    },
  },
];

export default { commands };
