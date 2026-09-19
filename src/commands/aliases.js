/**
 * aliases.js
 * ============================================
 * الأوامر المستعارة — Node.js
 * ============================================
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from 'discord.js';

import {
  guilds,
  aliasesDB,
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
  MAX_ALIASES,
  MAX_ALIAS_LENGTH,
  AVAILABLE_COMMANDS,
  cleanCommandName,
} from '../constants.js';

const ITEMS_PER_PAGE = 10;

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

function tr(lang, key, vars = {}) {
  let text = t(lang, 'aliases', key) || key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return text;
}

function httpErrorMessage(e) {
  if (e.status === 503) return '⚠️ Discord issue (503) — try again';
  if (e.status === 429) return '⚠️ Rate limited';
  if (e.status === 502) return '⚠️ Gateway Error (502)';
  if (e.status === 504) return '⚠️ Timeout (504)';
  return `❌ Discord API failed (${e.status})`;
}

async function sendConfirmation(target, isSlash, lang, prompt) {
  const authorId = isSlash ? target.user.id : target.author.id;
  const yesId = `al_yes_${authorId}_${Date.now()}`;
  const noId = `al_no_${authorId}_${Date.now()}`;

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
// بناء صفحات قائمة الأوامر المستعارة
// ============================================
function buildPages(guildId, lang) {
  const list = aliasesDB.getAll(guildId);
  if (!list.length) return [];

  const pages = [];
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  for (let p = 0; p < totalPages; p++) {
    const start = p * ITEMS_PER_PAGE;
    const chunk = list.slice(start, start + ITEMS_PER_PAGE);

    const embed = new EmbedBuilder()
      .setTitle(tr(lang, 'alias_list_title') || '📋 Aliases')
      .setColor(0x5865f2)
      .setFooter({
        text: `${total} aliases • ${p + 1}/${totalPages}`,
      })
      .setTimestamp();

    for (const item of chunk) {
      embed.addFields({
        name: `\`=${item.alias}\``,
        value: `→ \`=${item.original_command}\`\n> <@${item.created_by || '0'}>`,
        inline: true,
      });
    }

    pages.push(embed);
  }

  return pages;
}

function buildNavRow(page, total, lang) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('al_prev')
      .setLabel(tr(lang, 'aliases_btn_prev') || '◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('al_home')
      .setLabel(tr(lang, 'aliases_btn_home') || '🏠')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('al_next')
      .setLabel(tr(lang, 'aliases_btn_next') || '▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= total - 1),
    new ButtonBuilder()
      .setCustomId('al_close')
      .setLabel(tr(lang, 'aliases_btn_close') || '✖')
      .setStyle(ButtonStyle.Danger)
  );
}

// ============================================
// الأوامر
// ============================================
export const commands = [

  // ═══════════════════════════════════════════
  // ALIAS — إضافة
  // ═══════════════════════════════════════════
  {
    name: 'alias',
    description: 'إضافة اختصار لأمر',
    usage: '=alias <alias> <command>',
    aliases: ['اختصار'],
    category: 'aliases',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'alias_cmd_admin_only') || '❌ Admin only.')] });
      }

      const aliasName = cleanCommandName(args[0]);
      const original = cleanCommandName(args[1]);

      if (!aliasName || !original) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_original_missing') || '❌ Usage: =alias <alias> <command>')],
        });
      }

      if (aliasName.length > MAX_ALIAS_LENGTH) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_invalid_length', { max: MAX_ALIAS_LENGTH }) || `❌ Max ${MAX_ALIAS_LENGTH} chars.`)],
        });
      }

      if (!/^[a-z0-9_\-]+$/i.test(aliasName)) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_bad_name') || '❌ Bad alias name.')],
        });
      }

      if (aliasName === original) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_same') || '❌ Alias = command.')],
        });
      }

      if (!AVAILABLE_COMMANDS.includes(original)) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_original_missing_cmd', { cmd: original }) || `❌ Unknown command: ${original}`)],
        });
      }

      const existing = aliasesDB.get(message.guild.id, aliasName);
      if (existing) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_already_exists', { alias: aliasName }) || `⚠️ Alias exists.`)],
        });
      }

      const count = aliasesDB.count(message.guild.id);
      if (count >= MAX_ALIASES) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_max', { max: MAX_ALIASES }) || `❌ Max ${MAX_ALIASES}`)],
        });
      }

      if (!AVAILABLE_COMMANDS.includes(aliasName) === false) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_command_exists', { alias: aliasName }) || `⚠️ Is a real command.`)],
        });
      }

      try {
        aliasesDB.add(message.guild.id, aliasName, original, message.author.id);
        return replyHelper(message, {
          embeds: [successEmbed(
            tr(lang, 'alias_add_success_cmd', { alias: aliasName, cmd: original })
            || `✅ \`=${aliasName}\` → \`=${original}\``
          )],
        });
      } catch (err) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_add_failed') || '❌ Failed.')],
        });
      }
    },
  },

  // ═══════════════════════════════════════════
  // UNALIAS — حذف
  // ═══════════════════════════════════════════
  {
    name: 'unalias',
    description: 'حذف اختصار',
    usage: '=unalias <alias>',
    aliases: ['حذف_اختصار'],
    category: 'aliases',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message, args) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'alias_cmd_admin_only') || '❌ Admin only.')] });
      }

      const aliasName = cleanCommandName(args[0]);
      if (!aliasName) {
        return replyHelper(message, { embeds: [errorEmbed('❌ Usage: =unalias <alias>')] });
      }

      const existed = aliasesDB.get(message.guild.id, aliasName);
      if (!existed) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_del_not_found_cmd', { alias: aliasName }) || `❌ Not found.`)],
        });
      }

      try {
        const ok = aliasesDB.remove(message.guild.id, aliasName);
        if (!ok) {
          return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'alias_del_failed') || '❌ Failed.')] });
        }
        return replyHelper(message, {
          embeds: [successEmbed(tr(lang, 'alias_del_success_cmd', { alias: aliasName }) || `🗑 Removed \`=${aliasName}\``)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'alias_del_failed') || '❌ Failed.')] });
      }
    },
  },

  // ═══════════════════════════════════════════
  // ALIASES — عرض
  // ═══════════════════════════════════════════
  {
    name: 'aliases',
    description: 'عرض كل الأوامر المستعارة',
    usage: '=aliases',
    aliases: ['الاختصارات'],
    category: 'aliases',
    cooldown: DEFAULT_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);
      const pages = buildPages(message.guild.id, lang);

      if (!pages.length) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_list_empty_cmd') || '⚠️ لا يوجد اختصارات.')],
        });
      }

      let page = 0;
      const msg = await message.channel.send({
        embeds: [pages[0]],
        components: [buildNavRow(0, pages.length, lang)],
      });

      const collector = msg.createMessageComponentCollector({ time: 180 * 1000 });

      collector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) {
          return i.reply({
            content: tr(lang, 'aliases_view_not_yours') || '❌ ليس لك.',
            ephemeral: true,
          }).catch(() => {});
        }

        try {
          if (i.customId === 'al_prev') page = Math.max(0, page - 1);
          else if (i.customId === 'al_home') page = 0;
          else if (i.customId === 'al_next') page = Math.min(pages.length - 1, page + 1);
          else if (i.customId === 'al_close') {
            await i.update({
              content: tr(lang, 'aliases_closed_msg') || '✅ Closed.',
              embeds: [],
              components: [],
            }).catch(() => {});
            collector.stop();
            return;
          }

          await i.update({
            embeds: [pages[page]],
            components: [buildNavRow(page, pages.length, lang)],
          }).catch(() => {});
        } catch (err) {
          logger.debug('aliases interaction:', err.message);
        }
      });

      collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    },
  },

  // ═══════════════════════════════════════════
  // CLEARALIASES
  // ═══════════════════════════════════════════
  {
    name: 'clearaliases',
    description: 'حذف كل الأوامر المستعارة',
    usage: '=clearaliases',
    aliases: ['مسح_الاختصارات'],
    category: 'aliases',
    cooldown: DANGEROUS_COOLDOWN,

    async execute(message) {
      const lang = await getLang(message.guild.id);

      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyHelper(message, { embeds: [errorEmbed(tr(lang, 'alias_cmd_admin_only') || '❌ Admin only.')] });
      }

      const count = aliasesDB.count(message.guild.id);
      if (!count) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_clear_empty') || '✅ لا يوجد شيء.')],
        });
      }

      const confirmed = await sendConfirmation(
        message,
        false,
        lang,
        tr(lang, 'alias_clear_confirm', { n: count }) || `⚠️ Clear ${count}?`
      );

      if (!confirmed) {
        return replyHelper(message, {
          embeds: [errorEmbed(tr(lang, 'alias_clear_cancelled') || '❌ Cancelled.')],
        });
      }

      try {
        const removed = aliasesDB.clear(message.guild.id);
        return replyHelper(message, {
          embeds: [successEmbed(tr(lang, 'alias_clear_success_cmd', { n: removed }) || `🗑 Cleared ${removed}`)],
        });
      } catch (err) {
        return replyHelper(message, { embeds: [errorEmbed('❌ ' + err.message.slice(0, 100))] });
      }
    },
  },
];

// ============================================
// Alias Listener — يعالج الرسائل ويحوّلها
// ============================================
export function setupAliasesListener(client) {
  client.on('messageCreate', async (message) => {
    try {
      if (!message.guild || message.author.bot) return;
      if (!message.content.startsWith('=')) return;

      const args = message.content.slice(1).trim().split(/\s+/);
      const cmdName = cleanCommandName(args.shift());
      if (!cmdName) return;

      const alias = aliasesDB.get(message.guild.id, cmdName);
      if (!alias) return;

      const target = client.commands.get(alias.original_command);
      if (!target) return;

      try {
        await target.execute(message, args, client);
      } catch (err) {
        logger.error(`alias exec (${cmdName}->${alias.original_command}):`, err.message);
      }
    } catch (err) {
      logger.debug('aliases listener error:', err.message);
    }
  });

  logger.info('✅ Aliases listener registered');
}

export default { commands, setupAliasesListener };
