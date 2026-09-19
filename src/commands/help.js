/**
 * help.js
 * ============================================
 * الدليل التفاعلي — Node.js
 * ============================================
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { logger, replyHelper, t } from '../utils.js';
import { guilds } from '../database.js';

// ============================================
// 15 صفحة
// ============================================
const PAGE_KEYS = [
  'home',
  'permissions',
  'admin',
  'warnings',
  'jail',
  'temp_pun',
  'roles',
  'channels',
  'info',
  'extra',
  'custom',
  'cmd_channels',
  'admin_panel',
  'aliases',
  'general',
];

const TOTAL_PAGES = PAGE_KEYS.length;

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
// HelpView — 4 أزرار
// ============================================
class HelpView extends ActionRowBuilder {
  constructor(authorId, lang, currentPage = 'home') {
    super();
    this.authorId = authorId;
    this.lang = lang;
    this.currentPage = currentPage;
    this._buildButtons();
  }

  _buildButtons() {
    this.components = [];

    const idx = PAGE_KEYS.indexOf(this.currentPage);
    const isFirst = idx === 0;
    const isLast = idx === TOTAL_PAGES - 1;

    const prevBtn = new ButtonBuilder()
      .setCustomId('help_prev')
      .setLabel(t(this.lang, 'help', 'btn_prev') || '⬅️ السابق')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isFirst);

    const homeBtn = new ButtonBuilder()
      .setCustomId('help_home')
      .setLabel(t(this.lang, 'help', 'btn_home') || '🏠 الرئيسية')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isFirst);

    const nextBtn = new ButtonBuilder()
      .setCustomId('help_next')
      .setLabel(t(this.lang, 'help', 'btn_next') || '➡️ التالي')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isLast);

    const closeBtn = new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel(t(this.lang, 'help', 'btn_close') || '✖️ إغلاق')
      .setStyle(ButtonStyle.Danger);

    this.addComponents(prevBtn, homeBtn, nextBtn, closeBtn);
  }

  buildEmbed() {
    const pageKey = this.currentPage;
    const title = t(this.lang, 'help', `${pageKey}_title`) || `📖 ${pageKey}`;
    const description = t(this.lang, 'help', `${pageKey}_desc`) || '...';

    const pageNum = PAGE_KEYS.indexOf(pageKey) + 1;
    const footerTemplate = t(this.lang, 'help', 'page_indicator') || '📄 Page {page}/{total}';
    const footer = footerTemplate
      .replace('{page}', pageNum)
      .replace('{total}', TOTAL_PAGES);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description.slice(0, 4096))
      .setColor(0x5865f2)
      .setFooter({ text: footer });

    return embed;
  }

  async handleInteraction(interaction) {
    if (interaction.user.id !== this.authorId) {
      return interaction.reply({
        content: t(this.lang, 'help', 'not_yours') || '❌ هذا الدليل ليس لك.',
        ephemeral: true,
      }).catch(() => {});
    }

    const idx = PAGE_KEYS.indexOf(this.currentPage);

    if (interaction.customId === 'help_prev') {
      if (idx > 0) {
        this.currentPage = PAGE_KEYS[idx - 1];
      }
    } else if (interaction.customId === 'help_home') {
      this.currentPage = 'home';
    } else if (interaction.customId === 'help_next') {
      if (idx < TOTAL_PAGES - 1) {
        this.currentPage = PAGE_KEYS[idx + 1];
      }
    } else if (interaction.customId === 'help_close') {
      return interaction.update({
        content: t(this.lang, 'help', 'closed_msg') || '✅ تم إغلاق الدليل.',
        embeds: [],
        components: [],
      }).catch(() => {});
    }

    this._buildButtons();

    await interaction.update({
      embeds: [this.buildEmbed()],
      components: [this],
    }).catch(() => {});
  }
}

// ============================================
// أوامر
// ============================================
export const commands = [
  {
    name: 'cmds',
    description: 'عرض دليل الأوامر التفاعلي',
    usage: '=cmds',
    aliases: ['help', 'دليل', 'اوامر', 'أوامر'],
    category: 'general',
    cooldown: 3,

    async execute(message, args, client) {
      const lang = await getLang(message.guild.id);

      const view = new HelpView(message.author.id, lang);
      const embed = view.buildEmbed();

      const msg = await message.channel.send({
        embeds: [embed],
        components: [view],
      });

      // Collector
      const collector = msg.createMessageComponentCollector({
        time: 300 * 1000,
      });

      collector.on('collect', async (i) => {
        try {
          await view.handleInteraction(i);
        } catch (err) {
          logger.error('help interaction error:', err.message);
        }
      });

      collector.on('end', () => {
        msg.edit({ components: [] }).catch(() => {});
      });
    },
  },
];

export default { commands };
