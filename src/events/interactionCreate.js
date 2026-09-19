/**
 * interactionCreate.js
 * ============================================
 * معالج التفاعلات (buttons, selects, modals)
 * ============================================
 */

import { Events } from 'discord.js';
import { logger, errorEmbed } from '../utils.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // ===== Slash Commands =====
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        if (command.executeSlash) {
          await command.executeSlash(interaction, client);
        } else {
          await interaction.reply({
            content: '❌ هذا الأمر غير مدعوم كـ slash command حالياً',
            ephemeral: true,
          });
        }
      } catch (err) {
        logger.error(`Slash command error (${command.name}):`, err);

        const reply = {
          embeds: [errorEmbed('حدث خطأ أثناء تنفيذ الأمر')],
          ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
      return;
    }

    // ===== Buttons =====
    if (interaction.isButton()) {
      try {
        const handler = client.buttons?.get(interaction.customId);
        if (handler) {
          await handler(interaction, client);
        }
        // ✅ نتجاهل الأزرار اللي بيتعامل معاها collectors
      } catch (err) {
        logger.error('Button error:', err);
        await interaction
          .reply({
            embeds: [errorEmbed('حدث خطأ')],
            ephemeral: true,
          })
          .catch(() => {});
      }
      return;
    }

    // ===== Select Menus =====
    if (interaction.isAnySelectMenu()) {
      try {
        const handler = client.selects?.get(interaction.customId);
        if (handler) {
          await handler(interaction, client);
        }
        // ✅ نتجاهل القوائم اللي بيتعامل معاها collectors
      } catch (err) {
        logger.error('Select menu error:', err);
      }
      return;
    }

    // ===== Modals =====
    if (interaction.isModalSubmit()) {
      try {
        const handler = client.modals?.get(interaction.customId);
        if (handler) {
          await handler(interaction, client);
        }
      } catch (err) {
        logger.error('Modal error:', err);
      }
      return;
    }
  },
};
