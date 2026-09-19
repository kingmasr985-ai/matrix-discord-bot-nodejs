/**
 * ready.js
 * ============================================
 * يشتغل مرة واحدة لما البوت يدخل Discord
 * ============================================
 */

import { Events, ActivityType } from 'discord.js';
import { logger } from '../utils.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info('═══════════════════════════════════════════');
    logger.info(`✅ Bot ready: ${client.user.tag}`);
    logger.info(`📊 Guilds: ${client.guilds.cache.size}`);
    logger.info(`👥 Users: ${client.users.cache.size}`);
    logger.info(`📡 Ping: ${client.ws.ping}ms`);
    logger.info('═══════════════════════════════════════════');

    // ===== Status =====
    client.user.setPresence({
      activities: [
        {
          name: `${client.guilds.cache.size} servers | =help`,
          type: ActivityType.Watching,
        },
      ],
      status: 'online',
    });

    // ===== تسجيل الأوامر (slash commands) =====
    // (هنعمله بعدين)
  },
};
