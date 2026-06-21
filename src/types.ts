export interface ServerConfig {
  sources: Source[];
  activeSourceId: string;
  timeout: number;
  retries: number;
  modelRoutes?: Record<string, ModelRoute>;
}

export interface Source {
  id: string;
  name: string;
  baseUrl: string;
  apiKeys: string[];
}

export interface ModelRoute {
  preferredPlatforms: string[];
  disabledPlatforms: string[];
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'circuit_open';
  lastCheck: string | null;
  errorRate: number;
  avgLatencyMs: number;
  consecutiveFailures: number;
  circuitOpenAt: string | null;
}

export interface ServiceConfig {
  port?: number;
  timeout?: number;
  retries?: number;
  logLevel?: 'INFO' | 'WARN' | 'ERROR';
  searchEngine?: string;
  apiKey?: string;
  [key: string]: any;
}

export interface PluginSettings {
  autoStart: boolean;
  port: number;
  showNotifications: boolean;
  autoRestart: boolean;
  maxRestartAttempts: number;
  serviceConfigs?: Record<string, ServiceConfig>;
}
