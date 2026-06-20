import { PluginSettings } from './types';

export const DEFAULT_PORT = 4000;

export const DEFAULT_SETTINGS: PluginSettings = {
  autoStart: false,
  port: DEFAULT_PORT,
  showNotifications: true,
  autoRestart: true,
  maxRestartAttempts: 3,
};

export const SERVER_READY_PATTERNS = [
  /运行.*http:\/\/localhost:\d+/,
  /listening on.*:\d+/,
  /server.*started/i,
  /Model Runner 运行/,
];

export const LOG_COLORS = {
  INFO: '#888',
  WARN: '#f59e0b',
  ERROR: '#ef4444',
};

export type { PluginSettings };
