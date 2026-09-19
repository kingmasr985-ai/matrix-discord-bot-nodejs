/**
 * custom-help.js
 * ============================================
 * دليل الأوامر المخصص — Node.js
 * ============================================
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { logger, replyHelper, t } from '../utils.js';
import {
  guilds,
  customCmdsDB,
  commandConfigs,
} from '../database.js';

const ITEMS_PER_PAGE = 8;

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
// بناء الصفحات
// ============================================
function buildPages(client, guildId, filterCategory, lang) {
  // 1. أوامر حقيقية من client
  const entries = [];

  for (const [cmdName, cmd] of client.commands) {
    if (cmd.hidden) continue;

    const configs = commandConfigs.getAll(guildId);
    const config = configs[cmdName] || {};

    if (config.enabled === false) continue;

    const category = config.custom_category || cmd.category || 'General';
    if (filterCategory && category.toLowerCase() !== filterCategory.toLowerCase()) continue;

    entries.push({
      name: config.custom_name || cmd.name,
      desc: config.custom_description || cmd.description || t(lang, 'customHelp', 'ch_no_desc') || 'No description',
      usage: config.custom_usage || `=${cmd.name}`,
      category,
      type: 'command',
    });
  }

  // 2. أوامر مخصصة من DB
  const customList = customCmdsDB.getAll(guildId);
  for (const cc of customList) {
    const category = 'Custom Commands';
    if (filterCategory && category.toLowerCase() !== filterCategory.toLowerCase()) continue;

    entries.push({
      name: cc.trigger,
      desc: t(lang, 'customHelp', 'ch_custom_desc') || 'أمر مخصص',
      usage: `=${cc.trigger}`,
      category,
      type: 'custom',
    });
  }

  // ترتيب
  entries.sort((a, b) => a.name.localeCompare(b.name));

  // pagination
  const total = entries.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const pages = [];

  for (let p = 0; p < totalPages; p++) {
    const start = p * ITEMS_PER_PAGE;
    const chunk = entries.slice(start, start + ITEMS_PER_PAGE);

    const title = t(lang, 'customHelp', 'ch_title') || '📖 دليل الأوامر';
    const pageInfo = (t(lang, 'customHelp', 'ch_page_info') || 'Total: {total} • Page {page}/{pages}')
      .replace('{total}', total)
      .replace('{page}', p + 1)
      .replace('{pages}', totalPages);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(pageInfo)
      .setColor(0xa855f7);

    for (const entry of chunk) {
      const icon = entry.type === 'custom' ? '🔧' : '⌨️';
      const value = [
        entry.desc,
        `**الاستخدام:** \`${entry.usage}\``,
      ].join('\n');

      embed.addFields({
        name: `${icon} \`${entry.name}\` • _${entry.category}_`,
        value: value.slice(0, 1024),
        inline: false,
      });
    }

    embed.setFooter({
      text: lang === 'ar' ? 'استخدم الأزرار للتنقل' : 'Use buttons to navigate',
    });

    pages.push(embed);
  }

  if (!pages.length) {
    pages.push(
      new EmbedBuilder()
        .setTitle(t(lang, 'customHelp', 'ch_title') || '📖 دليل الأوامر')
        .setDescription(lang === 'ar' ? 'لا توجد أوامر لعرضها.' : 'No commands to display.')
        .setColor(0xa855f7)
    );
  }

  return pages;
}

// ============================================
// Navigation
// ============================================
function buildNavRow(page, total, lang) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ch_prev')
      .setLabel(t(lang, 'customHelp', 'ch_view_prev') || '◀ السابق')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('ch_page')
      .setLabel(`${page + 1} / ${total}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('ch_next')
      .setLabel(t(lang, 'customHelp', 'ch_view_next') || 'التالي ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= total - 1),
    new ButtonBuilder()
      .setCustomId('ch_close')
      .setLabel(t(lang, 'customHelp', 'ch_view_close') || '✖ إغلاق')
      .setStyle(ButtonStyle.Danger)
  );
}

// ============================================
// الأوامر
// ============================================
export const commands = [
  {
    name: 'custom',
    description: 'عرض دليل الأوامر المخصص',
    usage: '=custom [category]',
    aliases: ['customhelp', 'chelp', 'مخصص'],
    category: 'general',
    cooldown: 3,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);
      const filterCategory = args[0] || null;

      try {
        const pages = buildPages(client, message.guild.id, filterCategory, lang);

        let currentPage = 0;
        const msg = await message.channel.send({
          embeds: [pages[0]],
          components: [buildNavRow(0, pages.length, lang)],
        });

        const collector = msg.createMessageComponentCollector({
          time: 180 * 1000,
        });

        collector.on('collect', async (i) => {
          if (i.user.id !== message.author.id) {
            return i.reply({
              content: t(lang, 'customHelp', 'ch_view_not_yours') || '❌ هذه القائمة ليست لك.',
              ephemeral: true,
            }).catch(() => {});
          }

          try {
            if (i.customId === 'ch_prev') {
              currentPage = Math.max(0, currentPage - 1);
            } else if (i.customId === 'ch_next') {
              currentPage = Math.min(pages.length - 1, currentPage + 1);
            } else if (i.customId === 'ch_close') {
              await i.update({
                content: lang === 'ar' ? '✅ تم الإغلاق.' : '✅ Closed.',
                embeds: [],
                components: [],
              }).catch(() => {});
              collector.stop();
              return;
            }

            await i.update({
              embeds: [pages[currentPage]],
              components: [buildNavRow(currentPage, pages.length, lang)],
            }).catch(() => {});
          } catch (err) {
            logger.error('custom-help interaction error:', err.message);
          }
        });

        collector.on('end', () => {
          msg.edit({ components: [] }).catch(() => {});
        });
      } catch (err) {
        logger.error('custom-help error:', err.message);
        return replyHelper(message, {
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setDescription('❌ حدث خطأ أثناء عرض الأوامر.'),
          ],
        });
      }
    },
  },
];

export default { commands };
