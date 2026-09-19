/**
 * config.js
 * ============================================
 * تحميل الإعدادات من .env + قيم افتراضية
 * ============================================
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// تحميل .env
dotenv.config();

// مسار المشروع
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// ============================================
// Helper: قراءة متغير مع قيمة افتراضية
// ============================================
function env(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue === undefined) {
      console.warn(`⚠️  Missing env variable: ${key}`);
    }
    return defaultValue;
  }
  return value;
}

function envInt(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================
// Config Object
// ============================================
const config = {
  // ===== Discord =====
  discord: {
    token: env('DISCORD_TOKEN'),
    clientId: env('DISCORD_CLIENT_ID'),
    guildId: env('DISCORD_GUILD_ID'),
  },

  // ===== API Server =====
  api: {
    port: envInt('API_PORT', 8000),
    host: env('API_HOST', '0.0.0.0'),
    secret: env('API_SECRET', 'change_me'),
  },

  // ===== Database =====
  database: {
    path: env('DB_PATH', join(ROOT_DIR, 'data', 'database.db')),
  },

  // ===== Environment =====
  env: {
    nodeEnv: env('NODE_ENV', 'development'),
    dashboardUrl: env('DASHBOARD_URL', 'http://localhost:5173'),
    logLevel: env('LOG_LEVEL', 'info'),
    isDev: env('NODE_ENV', 'development') === 'development',
    isProd: env('NODE_ENV', 'development') === 'production',
  },

  // ===== Paths =====
  paths: {
    root: ROOT_DIR,
    data: join(ROOT_DIR, 'data'),
    logs: join(ROOT_DIR, 'logs'),
    src: join(ROOT_DIR, 'src'),
    commands: join(ROOT_DIR, 'src', 'commands'),
    events: join(ROOT_DIR, 'src', 'events'),
    translations: join(ROOT_DIR, 'src', 'translations.json'),
  },

  // ===== Bot =====
  bot: {
    defaultPrefix: '=',
    defaultLanguage: 'ar',
    supportedLanguages: ['ar', 'en'],
    colors: {
      primary: 0x5865F2,
      success: 0x57F287,
      warning: 0xFEE75C,
      error: 0xED4245,
      info: 0x5865F2,
    },
    emojis: {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      loading: '⏳',
    },
  },
};

// ============================================
// Validation
// ============================================
export function validateConfig() {
  const errors = [];

  if (!config.discord.token) {
    errors.push('DISCORD_TOKEN is missing in .env');
  }

  if (!config.discord.clientId) {
    errors.push('DISCORD_CLIENT_ID is missing in .env');
  }

  if (errors.length > 0) {
    console.error('\n❌ Configuration Errors:\n');
    errors.forEach((err) => console.error(`   • ${err}`));
    console.error('\n💡 عدّل ملف .env وأضف القيم الناقصة.\n');
    return false;
  }

  return true;
}

// ============================================
// Print Config (بدون secrets)
// ============================================
export function printConfig() {
  console.log('\n📋 Configuration:');
  console.log(`   Environment : ${config.env.nodeEnv}`);
  console.log(`   Log Level   : ${config.env.logLevel}`);
  console.log(`   API Port    : ${config.api.port}`);
  console.log(`   DB Path     : ${config.database.path}`);
  console.log(`   Bot Prefix  : ${config.bot.defaultPrefix}`);
  console.log(`   Language    : ${config.bot.defaultLanguage}`);
  console.log(`   Token       : ${config.discord.token ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Client ID   : ${config.discord.clientId ? '✅ Set' : '❌ Missing'}`);
  console.log('');
}

export default config;
