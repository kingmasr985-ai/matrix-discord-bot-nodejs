/**
 * messageCreate.js
 * ============================================
 * معالج الرسائل — prefix commands
 * ============================================
 */

import { Events, PermissionsBitField } from 'discord.js';
import { logger, errorEmbed } from '../utils.js';
import { guilds } from '../database.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    // تجاهل البوتات
    if (message.author.bot) return;

    // تجاهل DM
    if (!message.guild) return;

    // ===== الحصول على prefix =====
    let prefix = '=';
    try {
      prefix = guilds.getPrefix(message.guild.id);
    } catch (err) {
      // لو فيه مشكلة، استخدم الافتراضي
      prefix = '=';
    }

    // ===== التحقق إن الرسالة تبدأ بالـ prefix =====
    if (!message.content.startsWith(prefix)) return;

    // ===== تحليل الأمر =====
    const args = message.content
      .slice(prefix.length)
      .trim()
      .split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (!commandName) return;

    // ===== البحث عن الأمر =====
    let command = client.commands.get(commandName);

    // لو مش موجود، دور في الـ aliases
    if (!command) {
      const aliasTarget = client.aliases.get(commandName);
      if (aliasTarget) {
        command = client.commands.get(aliasTarget);
      }
    }

    if (!command) return;

    // ===== Cooldown =====
    if (!client.cooldowns.has(command.name)) {
      client.cooldowns.set(command.name, new Map());
    }

    const now = Date.now();
    const timestamps = client.cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(message.author.id)) {
      const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        const reply = await message.reply({
          embeds: [
            errorEmbed(
              `⏳ انتظر **${timeLeft.toFixed(1)}s** قبل استخدام \`${command.name}\` مرة أخرى`
            ),
          ],
        });
        setTimeout(() => reply.delete().catch(() => {}), 3000);
        return;
      }
    }

    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    // ===== تنفيذ الأمر =====
    try {
      await command.execute(message, args, client);
    } catch (err) {
      logger.error(`Error in command ${command.name}:`, err);

      const errorMsg = await message.reply({
        embeds: [errorEmbed('حدث خطأ أثناء تنفيذ الأمر')],
      });
      setTimeout(() => errorMsg.delete().catch(() => {}), 5000);
    }
  },
};
