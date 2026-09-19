/**
 * admin-panel.js
 * ============================================
 * لوحة تحكم الأدمن — Node.js
 * ============================================
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';

import {
  panelDB,
  jailDB,
  tempPunishments,
  afkDB,
  customCmdsDB,
  aliasesDB,
  channelsDB,
  commandPermissions,
  logDB,
  guilds,
} from '../database.js';

import { logger, replyHelper, t } from '../utils.js';

const ITEMS_PER_PAGE = 10;
const PANEL_TIMEOUT = 300 * 1000;

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
// Helper: وقت منقضي (i18n)
// ============================================
function formatTimeAgo(timestamp, lang = 'ar') {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);

  if (seconds < 5) return t(lang, 'adminPanel', 'time_now');
  if (seconds < 60) return t(lang, 'adminPanel', 'time_seconds', { n: seconds });
  if (seconds < 3600) return t(lang, 'adminPanel', 'time_minutes', { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return t(lang, 'adminPanel', 'time_hours', { n: Math.floor(seconds / 3600) });
  if (seconds < 2592000) return t(lang, 'adminPanel', 'time_days', { n: Math.floor(seconds / 86400) });
  if (seconds < 31536000) return t(lang, 'adminPanel', 'time_months', { n: Math.floor(seconds / 2592000) });
  return t(lang, 'adminPanel', 'time_years', { n: Math.floor(seconds / 31536000) });
}

// ============================================
// Helper: قص النص
// ============================================
function truncate(text, max = 80) {
  if (!text) return '—';
  const s = String(text);
  return s.length > max ? s.slice(0, max - 3) + '...' : s;
}

// ============================================
// قائمة الفئات (11)
// ============================================
function getCategories(lang) {
  return [
    { value: 'overview', label: t(lang, 'adminPanel', 'cat_overview') },
    { value: 'stats', label: t(lang, 'adminPanel', 'cat_stats') },
    { value: 'warnings', label: t(lang, 'adminPanel', 'cat_warnings') },
    { value: 'jailed', label: t(lang, 'adminPanel', 'cat_jailed') },
    { value: 'temp_pun', label: t(lang, 'adminPanel', 'cat_temp_pun') },
    { value: 'afk', label: t(lang, 'adminPanel', 'cat_afk') },
    { value: 'custom', label: t(lang, 'adminPanel', 'cat_custom') },
    { value: 'aliases', label: t(lang, 'adminPanel', 'cat_aliases') },
    { value: 'mods', label: t(lang, 'adminPanel', 'cat_mods') },
    { value: 'channels', label: t(lang, 'adminPanel', 'cat_channels') },
    { value: 'actions', label: t(lang, 'adminPanel', 'cat_actions') },
  ];
}

// ============================================
// Build Embed
// ============================================
async function buildEmbed(category, page, guild, lang) {
  const embed = new EmbedBuilder().setTimestamp();
  let totalPages = 1;
  const now = Math.floor(Date.now() / 1000);

  try {
    switch (category) {
      // ═══════════════════════════════════════
      // OVERVIEW
      // ═══════════════════════════════════════
      case 'overview': {
        const stats = panelDB.getStats(guild.id);
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_overview_title'))
          .setColor(0x5865f2)
          .setThumbnail(guild.iconURL({ size: 128 }))
          .addFields(
            { name: '🆔 ID', value: `\`${guild.id}\``, inline: true },
            { name: t(lang, 'adminPanel', 'ap_server_owner'), value: `<@${guild.ownerId}>`, inline: true },
            { name: t(lang, 'adminPanel', 'ap_server_members'), value: `\`${guild.memberCount}\``, inline: true },
            { name: t(lang, 'adminPanel', 'ap_server_field'), value: guild.name, inline: true },
            {
              name: t(lang, 'adminPanel', 'stats_field'),
              value: [
                `⚠️ ${t(lang, 'adminPanel', 'ap_warnings_field')}: \`${stats.warnings || 0}\``,
                `🔒 ${t(lang, 'adminPanel', 'ap_jailed_field')}: \`${stats.jailed_users || 0}\``,
                `⏰ ${t(lang, 'adminPanel', 'ap_temp_pun_field')}: \`${stats.temp_punishments || 0}\``,
                `💤 ${t(lang, 'adminPanel', 'ap_afk_field')}: \`${stats.afk_users || 0}\``,
                `💬 ${t(lang, 'adminPanel', 'ap_custom_field')}: \`${stats.custom_commands || 0}\``,
                `🔄 ${t(lang, 'adminPanel', 'ap_aliases_field')}: \`${stats.command_aliases || 0}\``,
                `🎭 ${t(lang, 'adminPanel', 'ap_mods_field')}: \`${stats.moderators || 0}\``,
              ].join('\n'),
              inline: false,
            }
          )
          .setFooter({ text: t(lang, 'adminPanel', 'ap_footer_id', { id: guild.id }) });
        break;
      }

      // ═══════════════════════════════════════
      // STATS
      // ═══════════════════════════════════════
      case 'stats': {
        const daily = panelDB.getDailyStats(guild.id, 7);
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_stats_title'))
          .setColor(0x3498db);

        if (!daily.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_stats_empty'));
        } else {
          for (const d of daily.slice(0, 7)) {
            if (
              d.warnings_count + d.kicks_count + d.bans_count + d.mutes_count + d.timeouts_count === 0
            ) continue;

            embed.addFields({
              name: `📅 ${d.date}`,
              value: `⚠️ \`${d.warnings_count}\` • 👢 \`${d.kicks_count}\` • 🔨 \`${d.bans_count}\`\n🔇 \`${d.mutes_count}\` • ⏱️ \`${d.timeouts_count}\``,
              inline: false,
            });
          }
          if (!embed.data.fields?.length) {
            embed.setDescription(t(lang, 'adminPanel', 'ap_stats_empty_7d'));
          }
        }
        break;
      }

      // ═══════════════════════════════════════
      // WARNINGS
      // ═══════════════════════════════════════
      case 'warnings': {
        const warnings = panelDB.getWarnings(guild.id, 100);
        totalPages = Math.max(1, Math.ceil(warnings.length / ITEMS_PER_PAGE));
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_warn_title', { n: warnings.length }))
          .setColor(0xfee75c);

        if (!warnings.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_warn_empty'));
        } else {
          const start = page * ITEMS_PER_PAGE;
          for (const w of warnings.slice(start, start + ITEMS_PER_PAGE)) {
            embed.addFields({
              name: `⚠️ <@${w.user_id}>`,
              value: [
                t(lang, 'adminPanel', 'ap_warn_reason', { reason: truncate(w.reason, 100) }),
                t(lang, 'adminPanel', 'ap_warn_by', { user: `<@${w.moderator_id}>` }),
                t(lang, 'adminPanel', 'ap_warn_date', { date: formatTimeAgo(w.created_at, lang) }),
              ].join('\n'),
              inline: false,
            });
          }
        }
        break;
      }

      // ═══════════════════════════════════════
      // JAILED
      // ═══════════════════════════════════════
      case 'jailed': {
        const jailed = jailDB.getAll(guild.id);
        totalPages = Math.max(1, Math.ceil(jailed.length / ITEMS_PER_PAGE));
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_jail_title', { n: jailed.length }))
          .setColor(0x8b0000);

        if (!jailed.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_jail_empty'));
        } else {
          const start = page * ITEMS_PER_PAGE;
          for (const j of jailed.slice(start, start + ITEMS_PER_PAGE)) {
            embed.addFields({
              name: `🔒 <@${j.user_id}>`,
              value: [
                t(lang, 'adminPanel', 'ap_jail_reason', { reason: truncate(j.reason, 100) }),
                t(lang, 'adminPanel', 'ap_jail_by', { user: `<@${j.jailed_by}>` }),
                t(lang, 'adminPanel', 'ap_jail_date', { date: formatTimeAgo(j.jailed_at, lang) }),
              ].join('\n'),
              inline: false,
            });
          }
        }
        break;
      }

      // ═══════════════════════════════════════
      // TEMP PUNISHMENTS
      // ═══════════════════════════════════════
      case 'temp_pun': {
        const punishments = tempPunishments.getAll(guild.id);
        totalPages = Math.max(1, Math.ceil(punishments.length / ITEMS_PER_PAGE));
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_temp_title', { n: punishments.length }))
          .setColor(0xe67e22);

        if (!punishments.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_temp_empty'));
        } else {
          const types = { ban: '🔨', mute: '🔇', lock: '🔒', lockall: '🔐' };
          const start = page * ITEMS_PER_PAGE;
          for (const p of punishments.slice(start, start + ITEMS_PER_PAGE)) {
            const remaining = p.expires_at - now;
            const remainingText = remaining < 0 ? '⏳' : formatTimeAgo(now - remaining, lang);
            embed.addFields({
              name: `${types[p.punishment_type] || '⏰'} \`#${p.id}\` — ${p.punishment_type}`,
              value: [
                `${t(lang, 'adminPanel', 'ap_temp_user')}: <@${p.user_id}>`,
                `${t(lang, 'adminPanel', 'ap_temp_expires')}: ${remaining < 0 ? 'expired' : Math.floor(remaining / 60) + 'm'}`,
                `${t(lang, 'adminPanel', 'ap_temp_reason')}: ${truncate(p.reason, 80)}`,
              ].join('\n'),
              inline: false,
            });
          }
        }
        break;
      }

      // ═══════════════════════════════════════
      // AFK
      // ═══════════════════════════════════════
      case 'afk': {
        const afkMap = afkDB.getAll(guild.id) || {};
        const afkList = Object.entries(afkMap).map(([uid, d]) => ({ user_id: uid, ...d }));
        totalPages = Math.max(1, Math.ceil(afkList.length / ITEMS_PER_PAGE));
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_afk_title', { n: afkList.length }))
          .setColor(0xffd700);

        if (!afkList.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_afk_empty'));
        } else {
          const start = page * ITEMS_PER_PAGE;
          for (const a of afkList.slice(start, start + ITEMS_PER_PAGE)) {
            embed.addFields({
              name: t(lang, 'adminPanel', 'ap_afk_user', { user: `<@${a.user_id}>` }),
              value: [
                t(lang, 'adminPanel', 'ap_afk_reason', { reason: truncate(a.reason, 100) }),
                t(lang, 'adminPanel', 'ap_afk_since', { time: formatTimeAgo(a.since, lang) }),
              ].join('\n'),
              inline: false,
            });
          }
        }
        break;
      }

      // ═══════════════════════════════════════
      // CUSTOM COMMANDS
      // ═══════════════════════════════════════
      case 'custom': {
        const cmds = customCmdsDB.getAll(guild.id);
        totalPages = Math.max(1, Math.ceil(cmds.length / ITEMS_PER_PAGE));
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_custom_title', { n: cmds.length }))
          .setColor(0x57f287);

        if (!cmds.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_custom_empty'));
        } else {
          const start = page * ITEMS_PER_PAGE;
          for (const c of cmds.slice(start, start + ITEMS_PER_PAGE)) {
            embed.addFields({
              name: `\`=${c.trigger}\``,
              value: [
                t(lang, 'adminPanel', 'ap_custom_name', { name: c.trigger }),
                t(lang, 'adminPanel', 'ap_custom_response', { response: truncate(c.response, 100) }),
              ].join('\n'),
              inline: false,
            });
          }
        }
        break;
      }

      // ═══════════════════════════════════════
      // ALIASES
      // ═══════════════════════════════════════
      case 'aliases': {
        const aliases = aliasesDB.getAll(guild.id);
        totalPages = Math.max(1, Math.ceil(aliases.length / ITEMS_PER_PAGE));
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_aliases_title', { n: aliases.length }))
          .setColor(0x1abc9c);

        if (!aliases.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_aliases_empty'));
        } else {
          const start = page * ITEMS_PER_PAGE;
          for (const a of aliases.slice(start, start + ITEMS_PER_PAGE)) {
            embed.addFields({
              name: `\`=${a.alias}\``,
              value: `→ \`=${a.original_command}\``,
              inline: true,
            });
          }
        }
        break;
      }

      // ═══════════════════════════════════════
      // MODS
      // ═══════════════════════════════════════
      case 'mods': {
        const allMods = commandPermissions.getAllModerators(guild.id);
        const entries = Object.entries(allMods);
        totalPages = Math.max(1, Math.ceil(entries.length / ITEMS_PER_PAGE));
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_mods_title', { n: entries.length }))
          .setColor(0x9b59b6);

        if (!entries.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_mods_empty'));
        } else {
          const start = page * ITEMS_PER_PAGE;
          for (const [cmd, roleIds] of entries.slice(start, start + ITEMS_PER_PAGE)) {
            const roles = roleIds
              .map((rid) => guild.roles.cache.get(rid)?.toString() || `\`${rid}\``)
              .join(', ');
            embed.addFields({
              name: `\`=${cmd}\``,
              value: roles || '—',
              inline: false,
            });
          }
        }
        break;
      }

      // ═══════════════════════════════════════
      // CHANNELS
      // ═══════════════════════════════════════
      case 'channels': {
        const channels = channelsDB.getAll(guild.id);
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_channels_title'))
          .setColor(0x3498db);

        const adminIds = channels.admin || [];
        const generalIds = channels.general || [];

        embed.addFields(
          {
            name: `${t(lang, 'adminPanel', 'ap_channels_admin')} (${adminIds.length})`,
            value: adminIds.length
              ? adminIds.slice(0, 15).map((id) => `<#${id}>`).join('\n')
              : t(lang, 'adminPanel', 'ap_channels_none'),
            inline: false,
          },
          {
            name: `${t(lang, 'adminPanel', 'ap_channels_general')} (${generalIds.length})`,
            value: generalIds.length
              ? generalIds.slice(0, 15).map((id) => `<#${id}>`).join('\n')
              : t(lang, 'adminPanel', 'ap_channels_none'),
            inline: false,
          }
        );
        break;
      }

      // ═══════════════════════════════════════
      // ACTIONS
      // ═══════════════════════════════════════
      case 'actions': {
        const actions = panelDB.getRecentActions(guild.id, 100);
        totalPages = Math.max(1, Math.ceil(actions.length / ITEMS_PER_PAGE));
        embed
          .setTitle(t(lang, 'adminPanel', 'ap_actions_title', { n: actions.length }))
          .setColor(0x95a5a6);

        if (!actions.length) {
          embed.setDescription(t(lang, 'adminPanel', 'ap_actions_empty'));
        } else {
          const start = page * ITEMS_PER_PAGE;
          for (const a of actions.slice(start, start + ITEMS_PER_PAGE)) {
            embed.addFields({
              name: `📜 ${a.action_type}`,
              value: [
                t(lang, 'adminPanel', 'ap_action_by', { user: `<@${a.actor_id}>` }),
                t(lang, 'adminPanel', 'ap_action_type', { type: a.action_type }),
                a.details ? t(lang, 'adminPanel', 'ap_action_details', { details: truncate(a.details, 80) }) : null,
                t(lang, 'adminPanel', 'ap_action_time', { time: formatTimeAgo(a.created_at, lang) }),
              ].filter(Boolean).join('\n'),
              inline: false,
            });
          }
        }
        break;
      }

      default:
        embed.setTitle('❌ Unknown').setColor(0xed4245).setDescription('Unknown category');
    }
  } catch (err) {
    logger.error('buildEmbed error:', err.message);
    embed
      .setTitle(t(lang, 'adminPanel', 'ap_error_title'))
      .setColor(0xed4245)
      .setDescription(t(lang, 'adminPanel', 'ap_error_desc', { error: String(err.message).slice(0, 200) }));
  }

  embed.setFooter({
    text: t(lang, 'adminPanel', 'ap_page_footer', {
      page: page + 1,
      total: totalPages,
      id: guild.id,
    }),
  });

  return { embed, totalPages };
}

// ============================================
// Build Components
// ============================================
function buildComponents(category, page, totalPages, lang) {
  const rows = [];

  // Select Menu
  const select = new StringSelectMenuBuilder()
    .setCustomId('panel_select')
    .setPlaceholder(t(lang, 'adminPanel', 'select_placeholder'))
    .addOptions(
      getCategories(lang).map((c) => ({
        label: c.label.slice(0, 100),
        value: c.value,
        default: c.value === category,
      }))
    );

  rows.push(new ActionRowBuilder().addComponents(select));

  // Nav buttons (if paginated)
  if (totalPages > 1) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('panel_prev')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('panel_page')
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('panel_next')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );
    rows.push(navRow);
  }

  // Action buttons
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('panel_refresh')
      .setLabel(t(lang, 'adminPanel', 'btn_refresh'))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('panel_close')
      .setLabel(t(lang, 'adminPanel', 'btn_close'))
      .setStyle(ButtonStyle.Danger)
  );
  rows.push(actionRow);

  return rows;
}

// ============================================
// Commands
// ============================================
export const commands = [
  {
    name: 'adminpanel',
    description: 'لوحة تحكم الأدمن',
    usage: '=adminpanel',
    aliases: ['apanel', 'لوحة'],
    category: 'admin',
    cooldown: 5,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has('Administrator')) {
        return replyHelper(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setDescription(t(lang, 'adminPanel', 'admin_only')),
          ],
        });
      }

      const { embed, totalPages } = await buildEmbed('overview', 0, message.guild, lang);
      const components = buildComponents('overview', 0, totalPages, lang);

      const panelMsg = await message.channel.send({ embeds: [embed], components });

      // Collector
      const collector = panelMsg.createMessageComponentCollector({
        time: PANEL_TIMEOUT,
      });

      let currentCategory = 'overview';
      let currentPage = 0;

      collector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) {
          return i.reply({
            content: t(lang, 'adminPanel', 'not_yours'),
            ephemeral: true,
          }).catch(() => {});
        }

        try {
          if (i.isStringSelectMenu()) {
            currentCategory = i.values[0];
            currentPage = 0;
          } else if (i.isButton()) {
            if (i.customId === 'panel_prev') {
              currentPage = Math.max(0, currentPage - 1);
            } else if (i.customId === 'panel_next') {
              currentPage += 1;
            } else if (i.customId === 'panel_refresh') {
              // same page
            } else if (i.customId === 'panel_close') {
              await i.update({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0x57f287)
                    .setDescription(t(lang, 'adminPanel', 'closed_msg')),
                ],
                components: [],
              }).catch(() => {});
              collector.stop();
              return;
            }
          }

          const { embed, totalPages } = await buildEmbed(
            currentCategory,
            currentPage,
            message.guild,
            lang
          );
          const components = buildComponents(currentCategory, currentPage, totalPages, lang);

          await i.update({ embeds: [embed], components }).catch(() => {});
        } catch (err) {
          logger.error('panel interaction error:', err.message);
        }
      });

      collector.on('end', () => {
        panelMsg.edit({ components: [] }).catch(() => {});
      });
    },
  },
];

export default { commands };
