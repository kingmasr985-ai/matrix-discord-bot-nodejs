/**
 * index.js
 * Setup كل الـ API routes (Stages A + B + C)
 */

import { logger } from '../utils.js';
import { notFoundHandler } from './middleware.js';

// Stage A
import { registerGuildsRoutes } from './guilds.js';
import { registerStatsRoutes } from './stats.js';

// Stage B
import { registerWarningsRoutes } from './warnings.js';
import { registerJailedRoutes } from './jailed.js';
import { registerTempRoutes } from './temp.js';
import { registerCustomRoutes } from './custom.js';
import { registerAliasesRoutes } from './aliases.js';
import { registerModeratorsRoutes } from './moderators.js';
import { registerChannelsRoutes } from './channels.js';

// Stage C
import { registerLogsRoutes } from './logs.js';
import { registerAfkRoutes } from './afk.js';
import { registerConfigsRoutes } from './configs.js';
import { registerEmbedsRoutes } from './embeds.js';
import { registerSettingsRoutes } from './settings.js';
import { registerCommandsRoutes } from './commands.js';
import { registerResourcesRoutes } from './resources.js';
import { registerOwnerRoutes } from './owner.js';
import { registerDashboardCompatRoutes } from './dashboard-compat.js';

export function setupApiRoutes(app, client) {
  logger.info('🔧 Setting up API routes...');

  // Stage A
  registerGuildsRoutes(app, client);
  registerStatsRoutes(app, client);

  // Stage B
  registerWarningsRoutes(app, client);
  registerJailedRoutes(app, client);
  registerTempRoutes(app, client);
  registerCustomRoutes(app, client);
  registerAliasesRoutes(app, client);
  registerModeratorsRoutes(app, client);
  registerChannelsRoutes(app, client);

  // Stage C
  registerLogsRoutes(app, client);
  registerAfkRoutes(app, client);
  registerConfigsRoutes(app, client);
  registerEmbedsRoutes(app, client);
  registerSettingsRoutes(app, client);
  // Dashboard Compat MUST be before commands (avoids :name conflict)

  registerDashboardCompatRoutes(app, client);

  

  registerCommandsRoutes(app, client);
  registerResourcesRoutes(app, client);
  registerOwnerRoutes(app, client);

  // 404
  app.use('/api', notFoundHandler);

  logger.info('✅ All API routes ready (A + B + C)');
}

export default { setupApiRoutes };
