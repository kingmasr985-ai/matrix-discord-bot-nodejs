/**
 * utility.js
 * ============================================
 * أدوات عامة — Node.js
 * (nickname, nsfw, setchannel)
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
  channelsDB,
} from '../database.js';

import {
  logger,
  errorEmbed,
  successEmbed,
  replyHelper,
  getMemberFromInput,
  canModerateWithBotCheck,
  t,
} from '../utils.js';

import {
  DEFAULT_COOLDOWN,
  DANGEROUS_COOLDOWN,
  CONFIRMATION_TIMEOUT,
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
  let text = t(lang, 'utility', key) || key;
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
  const yesId = `ut_yes_${authorId}_${Date.now()}`;
  const noId = `ut_no_${authorId}_${Date.now()}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(yesId)
      .setLabel(tr(lang, 'ut_confirm_yes'))
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(noId)
      .setLabel(tr(lang, 'ut_confirm_no'))
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
// ثوابت
// ============================================
const NICK_MAX = 32;

// ============================================
// الأوامر
// ============================================
export const commands = [

  // ═══════════════════════════════════════════
  // NICKNAME
  // ═══════════════════════════════════════════
  {
    name: 'nickname',
    description: 'تغيير كنية عضو',
    usage: '=nickname <@user|ID> [name|reset]',
    aliases: ['nick', 'كنية'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      // عرض معلومات
      if (!args[0]) {
        const member = message.member;
        return replyHelper(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setDescription(
                tr(lang, 'ut_nick_info', {
                  user: member.toString(),
                  old: member.nickname || member.user.username,
                  name: member.user.username,
                })
              ),
          ],
        });
      }

      const member = await getMemberFromInput(guild, args[0]);
      if (!member) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'member_not_found') || '❌ Member not found.')],
        });
      }

      // صلاحيات البوت
      const me = guild.members.me;
      if (!me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'ut_nick_no_perm'))],
        });
      }

      // رتبة البوت أعلى
      if (member.roles.highest.position >= me.roles.highest.position && member.id !== me.id) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'ut_nick_cant_edit'))],
        });
      }

      // صلاحية المستخدم
      const author = message.member;
      if (!author.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'ut_nick_no_perm'))],
        });
      }
      if (
        member.id !== author.id &&
        !author.permissions.has(PermissionFlagsBits.Administrator) &&
        member.roles.highest.position >= author.roles.highest.position
      ) {
        return replyHelper(message, {
          embeds: [
            errorEmbed(
              tr(lang, 'ut_nick_your_role_low', {
                yours: author.roles.highest.name,
                target: member.roles.highest.name,
              })
            ),
          ],
        });
      }

      const newName = args.slice(1).join(' ').trim();
      const oldName = member.nickname || member.user.username;

      // عرض معلومات
      if (!newName) {
        return replyHelper(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setDescription(
                tr(lang, 'ut_nick_info', {
                  user: member.toString(),
                  old: oldName,
                  name: member.user.username,
                })
              ),
          ],
        });
      }

      // إعادة تعيين
      if (['reset', 'مسح', 'حذف'].includes(newName.toLowerCase())) {
        try {
          await member.setNickname(null, `By ${author.tag}`);
          return replyHelper(message, {
            embeds: [
              successEmbed(
                tr(lang, 'ut_nick_removed', {
                  user: member.toString(),
                  old: oldName,
                  new: member.user.username,
                })
              ),
            ],
          });
        } catch (err) {
          return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
        }
      }

      // تحقق الطول
      if (newName.length > NICK_MAX) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'ut_nick_too_long', { n: newName.length, max: NICK_MAX }))],
        });
      }

      // تغيير
      try {
        await member.setNickname(newName, `By ${author.tag}`);
        return replyHelper(message, {
          embeds: [
            successEmbed(
              tr(lang, 'ut_nick_changed', {
                user: member.toString(),
                old: oldName,
                new: newName,
              })
            ),
          ],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // RESETALLNICKS
  // ═══════════════════════════════════════════
  {
    name: 'resetallnicks',
    description: 'حذف كل الكنيات',
    usage: '=resetallnicks',
    aliases: ['resetnicks', 'حذف_الكنيات'],
    category: 'utility',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;
      const author = message.member;

      if (!author.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'no_permission'))] });
      }

      const me = guild.members.me;
      if (!me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'ut_nick_no_perm'))] });
      }

      const withNick = guild.members.cache.filter(
        (m) => m.nickname && !m.user.bot && m.id !== guild.ownerId
      );

      if (!withNick.size) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'auto_24c2ca33') || '✅ لا يوجد أعضاء بكنيات.')],
        });
      }

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        tr(lang, 'ut_reset_confirm', { n: withNick.size })
      );
      if (!confirmed) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'auto_dddd7812') || '❌ تم الإلغاء.')] });
      }

      let success = 0, failed = 0;
      for (const [, m] of withNick) {
        try {
          if (m.roles.highest.position >= me.roles.highest.position) {
            failed++;
            continue;
          }
          await m.setNickname(null, `Mass reset by ${author.user.tag}`);
          success++;
        } catch {
          failed++;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      return replyHelper(message, {
        embeds: [successEmbed(tr(lang, 'ut_reset_done', { success, failed }))],
      });
    },
  },

  // ═══════════════════════════════════════════
  // NSFW
  // ═══════════════════════════════════════════
  {
    name: 'nsfw',
    description: 'تفعيل/تعطيل NSFW في القناة',
    usage: '=nsfw <on|off|toggle> [#channel]',
    aliases: ['اباحي'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const channel = message.mentions.channels.first() || message.channel;

      if (![ChannelType.GuildText, ChannelType.GuildVoice].includes(channel.type)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'ut_nsfw_only_text'))] });
      }

      const onText = tr(lang, 'ut_nsfw_on');
      const offText = tr(lang, 'ut_nsfw_off');
      const stateText = channel.nsfw ? onText : offText;

      // عرض الحالة
      if (!args[0]) {
        return replyHelper(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setDescription(
                tr(lang, 'ut_nsfw_status', { channel: channel.toString(), state: stateText })
              ),
          ],
        });
      }

      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'no_permission'))] });
      }

      const action = args[0].toLowerCase();
      let newState;

      if (['on', 'enable', 'تفعيل'].includes(action)) {
        newState = true;
      } else if (['off', 'disable', 'تعطيل'].includes(action)) {
        newState = false;
      } else if (['toggle', 'تبديل'].includes(action)) {
        newState = !channel.nsfw;
      } else {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'ut_nsfw_status', { channel: channel.toString(), state: stateText }))],
        });
      }

      if (channel.nsfw === newState) {
        return replyHelper(message, {
          embeds: [
            errorEmbed(tr(lang, 'ut_nsfw_already', { state: stateText, channel: channel.toString() })),
          ],
        });
      }

      try {
        await channel.setNSFW(newState, `By ${message.author.tag}`);
        const newStateText = newState ? onText : offText;
        const actionText = newState ? tr(lang, 'ut_nsfw_enabled') : tr(lang, 'ut_nsfw_disabled');

        return replyHelper(message, {
          embeds: [
            successEmbed(
              tr(lang, 'ut_nsfw_toggled', {
                action: actionText,
                channel: channel.toString(),
                state: newStateText,
              })
            ),
          ],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(httpErrorMessage(err))] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // NSFWALL
  // ═══════════════════════════════════════════
  {
    name: 'nsfwall',
    description: 'تفعيل/تعطيل NSFW في كل القنوات',
    usage: '=nsfwall <on|off>',
    aliases: ['اباحي_الكل'],
    category: 'utility',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'no_permission'))] });
      }

      const action = (args[0] || '').toLowerCase();
      let newState;

      if (['on', 'enable', 'تفعيل'].includes(action)) newState = true;
      else if (['off', 'disable', 'تعطيل'].includes(action)) newState = false;
      else {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'ut_nsfw_status', { channel: message.channel.toString(), state: '' }))],
        });
      }

      const stateText = newState ? tr(lang, 'ut_nsfw_on') : tr(lang, 'ut_nsfw_off');
      const channels = guild.channels.cache.filter(
        (c) => [ChannelType.GuildText, ChannelType.GuildVoice].includes(c.type) && c.nsfw !== newState
      );

      if (!channels.size) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'ut_nsfwall_already', { state: stateText }))],
        });
      }

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        tr(lang, 'ut_nsfwall_confirm', { n: channels.size, state: stateText })
      );
      if (!confirmed) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });
      }

      let success = 0;
      for (const [, ch] of channels) {
        try {
          await ch.setNSFW(newState, `Mass NSFW by ${message.author.tag}`);
          success++;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }

      return replyHelper(message, {
        embeds: [
          successEmbed(tr(lang, 'ut_nsfwall_done', { success, total: channels.size })),
        ],
      });
    },
  },

  // ═══════════════════════════════════════════
  // SETCHANNEL — إدارة قنوات الأوامر
  // ═══════════════════════════════════════════
  {
    name: 'setchannel',
    description: 'تحديد قنوات الأوامر (admin/general)',
    usage: '=setchannel <admin|general> [#ch1 #ch2 ...]',
    aliases: ['setch', 'قناة_الأوامر'],
    category: 'utility',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);
      const guild = message.guild;

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'no_permission'))] });
      }

      const VALID_TYPES = ['admin', 'general'];

      // عرض
      if (!args[0]) {
        const config = channelsDB.getAll(guild.id);
        const lines = [];

        if (!config.admin && !config.general) {
          return replyHelper(message, {
            embeds: [
              new EmbedBuilder()
                .setColor(0xfee75c)
                .setDescription(tr(lang, 'ch_no_config_full')),
            ],
          });
        }

        if (config.admin?.length) {
          lines.push(`**Admin:** ${config.admin.map((id) => `<#${id}>`).join(', ')}`);
        }
        if (config.general?.length) {
          lines.push(`**General:** ${config.general.map((id) => `<#${id}>`).join(', ')}`);
        }

        return replyHelper(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle('📌 Command Channels')
              .setDescription(lines.join('\n\n')),
          ],
        });
      }

      const type = args[0].toLowerCase();
      if (!VALID_TYPES.includes(type)) {
        return replyHelper(message, {
          embeds: [
            errorEmbed(
              tr(lang, 'ch_invalid_type_full', { types: VALID_TYPES.map((t) => `\`${t}\``).join(', ') })
            ),
          ],
        });
      }

      const channels = message.mentions.channels;

      // مسح
      if (args[1]?.toLowerCase() === 'clear' || args[1] === 'مسح') {
        const config = channelsDB.getAll(guild.id);
        const count = config[type]?.length || 0;

        if (!count) {
          return replyHelper(message, {
            embeds: [errorEmbed(tr(lang, 'ch_not_found_full', { mentions: type }))],
          });
        }

        const confirmed = await sendConfirmation(
          message,
          false,
          lang,
          tr(lang, 'ch_clear_confirm_full', { total: count, type })
        );
        if (!confirmed) {
          return replyHelper(message, { embeds: [errorEmbed('❌ Cancelled.')] });
        }

        channelsDB.clear(guild.id, type);
        return replyHelper(message, {
          embeds: [successEmbed(tr(lang, 'ch_clear_type_done', { n: count, type }))],
        });
      }

      if (!channels.size) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'ch_no_channel_full'))],
        });
      }

      const added = [];
      const already = [];

      for (const [, ch] of channels) {
        if (channelsDB.add(guild.id, ch.id, type)) {
          added.push(ch);
        } else {
          already.push(ch);
        }
      }

      const parts = [];
      if (added.length) {
        parts.push(
          `✅ **${type}:** ${added.map((c) => c.toString()).join(', ')}`
        );
      }
      if (already.length) {
        parts.push(tr(lang, 'ch_already_exists_full', { mentions: already.map((c) => c.toString()).join(', ') }));
      }

      return replyHelper(message, {
        embeds: [successEmbed(parts.join('\n'))],
      });
    },
  },
];

export default { commands };
