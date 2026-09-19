/**
 * index.js
 * ============================================
 * نقطة الدخول — Bot + API Server
 * ============================================
 */

import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import config, { validateConfig, printConfig } from './config.js';
import { logger } from './utils.js';
import { hmacMiddleware } from './auth.js';

// API Routes
import { setupApiRoutes } from './api/index.js';

// Listeners
import { setupAliasesListener } from './commands/aliases.js';
import { setupCustomCommandsListener } from './commands/custom-commands.js';
import { startTempPunishmentsLoop } from './commands/temp-punishments.js';
import { startJailAutoReleaseLoop } from './commands/jail.js';
import { registerWelcomeListeners } from './commands/welcome.js';
import { registerLoggingListeners } from './commands/logging.js';
import { setupAutoResponderListener } from './commands/auto-responder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// 1. التحقق من الإعدادات
// ============================================
if (!validateConfig()) {
  process.exit(1);
}
printConfig();

// ============================================
// 2. Discord Client
// ============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
    Partials.Reaction,
  ],
});

client.commands = new Collection();
client.aliases = new Collection();
client.cooldowns = new Collection();

// ============================================
// 3. تحميل الأوامر
// ============================================
async function loadCommands() {
  const commandsPath = config.paths.commands;

  try {
    const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
    logger.info(`Loading ${commandFiles.length} command files...`);

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const fileUrl = pathToFileURL(filePath).href;

      try {
        const command = await import(fileUrl);
        const cmd = command.default || command;

        if (Array.isArray(cmd.commands)) {
          for (const c of cmd.commands) {
            client.commands.set(c.name, c);
            if (c.aliases) {
              c.aliases.forEach((a) => client.aliases.set(a, c.name));
            }
          }
        } else if (cmd.name) {
          client.commands.set(cmd.name, cmd);
          if (cmd.aliases) {
            cmd.aliases.forEach((a) => client.aliases.set(a, cmd.name));
          }
        }
      } catch (err) {
        logger.error(`Failed to load ${file}:`, err.message);
      }
    }

    logger.info(`✅ Total commands loaded: ${client.commands.size}`);
  } catch (err) {
    logger.error('Failed to read commands directory:', err.message);
  }
}

// ============================================
// 4. تحميل الأحداث
// ============================================
async function loadEvents() {
  const eventsPath = config.paths.events;

  try {
    const eventFiles = readdirSync(eventsPath).filter((f) => f.endsWith('.js'));
    logger.info(`Loading ${eventFiles.length} event files...`);

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);
      const fileUrl = pathToFileURL(filePath).href;

      try {
        const event = await import(fileUrl);
        const evt = event.default || event;

        if (evt.name && evt.execute) {
          if (evt.once) {
            client.once(evt.name, (...args) => evt.execute(...args, client));
          } else {
            client.on(evt.name, (...args) => evt.execute(...args, client));
          }
        }
      } catch (err) {
        logger.error(`Failed to load ${file}:`, err.message);
      }
    }

    logger.info(`✅ Total events loaded`);
  } catch (err) {
    logger.error('Failed to read events directory:', err.message);
  }
}

// ============================================
// 5. Express API Server
// ============================================
function startApiServer() {
  const app = express();

  // Middleware
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({
    origin: [
      config.env.dashboardUrl || 'http://localhost:5173',
      'https://*.vercel.app',
    ],
    credentials: true,
  }));

  app.use(express.json({
    limit: '5mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }));

  // ✅ GET/HEAD → rawBody = سلسلة فاضية
  app.use((req, res, next) => {
    if (!req.rawBody) {
      req.rawBody = Buffer.from('');
    }
    next();
  });

  // HMAC verification (ما عدا /api/health)
  app.use('/api', hmacMiddleware);

  // Setup API routes
  setupApiRoutes(app, client);

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('API Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start
  app.listen(config.api.port, config.api.host, () => {
    logger.info(`🌐 API Server: http://${config.api.host}:${config.api.port}`);
    logger.info(`📡 Health: http://localhost:${config.api.port}/api/health`);
  });

  return app;
}

// ============================================
// 6. Error Handling
// ============================================
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('SIGINT', () => {
  logger.info('🛑 Shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Shutting down...');
  client.destroy();
  process.exit(0);
});

// ============================================
// 7. Main
// ============================================
async function main() {
  logger.info('🚀 Starting Matrix Bot...');

  // ابدأ API Server
  startApiServer();

  // حمّل الأوامر والأحداث
  await loadCommands();
  await loadEvents();

  // شغّل loops + listeners
  startJailAutoReleaseLoop(client);
  startTempPunishmentsLoop(client);
  setupAliasesListener(client);
  setupCustomCommandsListener(client);
  registerWelcomeListeners(client);
  registerLoggingListeners(client);
  setupAutoResponderListener(client);

  // سجل الدخول
  try {
    await client.login(config.discord.token);
  } catch (err) {
    logger.error('Failed to login:', err.message);
    process.exit(1);
  }
}

main();
