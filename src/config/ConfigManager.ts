import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * ConfigManager handles loading and managing application configuration
 */

interface Credentials {
  username: string;
  password: string;
}

interface JobFilteringConfig {
  enabled: boolean;
  filterByPositionType?: { enabled: boolean; preferred?: string[]; exclude?: string[] };
  filterByBuilding?: {
    enabled: boolean;
    preferred?: string[];
    exclude?: string[];
    preferredBuildingIds?: number[];
    excludeBuildingIds?: number[];
  };
  filterByScheduleType?: { enabled: boolean; preferred?: string[] };
  filterByDuration?: {
    enabled: boolean;
    minDays?: number;
    maxDays?: number;
    onlyMultipleDays?: boolean;
  };
  filterByJobType?: {
    enabled: boolean;
    includeLongTerm?: boolean;
    includeShortTerm?: boolean;
  };
}

interface AutoApplyConfig {
  enabled: boolean;
  autoApplyOnMatches: boolean;
  dryRunMode: boolean;
}

interface SchedulingConfig {
  enabled: boolean;
  pollingIntervalSeconds: number;
}

interface DisplayConfig {
  showScheduledJobsTable: boolean;
  showAvailableJobsTable: boolean;
  showLongTermJobsTable: boolean;
  showFilteredJobsDetails: boolean;
}

interface AuthenticationConfig {
  enableAutoRefreshOn401: boolean;
  refreshThresholdPercent: number;
}

interface LoggingConfig {
  enabled: boolean;
  logToFile: boolean;
  logDirectory: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  includeTimestamp: boolean;
  maxLogFiles: number;
}

interface Config {
  baseUrl: string;
  loginEndpoint: string;
  jobsEndpoint: string;
  scheduledJobsEndpoint: string;
  jobApplicationEndpoint: string;
  pollingIntervalSeconds: number;
  credentials: Credentials;
  jobFiltering?: JobFilteringConfig;
  autoApply?: AutoApplyConfig;
  scheduling?: SchedulingConfig;
  display?: DisplayConfig;
  authentication?: AuthenticationConfig;
  logging?: LoggingConfig;
}

class ConfigManager {
  private static instance: ConfigManager;
  private config: Config | null = null;

  /**
   * Singleton pattern: ensures only one instance of ConfigManager exists
   * This is useful for managing a single configuration throughout the app
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from JSON file
   * - Reads the config.json file from the root directory
   * - Parses it and validates the structure
   * - Throws error if file doesn't exist or is invalid JSON
   */
  public loadConfig(configPath: string = './config.json'): Config {
    try {
      // Load environment variables from .env file
      dotenv.config();

      // Read the config file
      const absolutePath = path.resolve(configPath);
      const fileContent = fs.readFileSync(absolutePath, 'utf-8');
      
      // Parse JSON string to object and cast it to Config type
      this.config = JSON.parse(fileContent) as Config;

      // Override settings from environment variables if available
      this.applyEnvironmentOverrides();
      
      console.log('✓ Configuration loaded successfully');
      return this.config;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in config file: ${error.message}`);
      }
      throw new Error(`Failed to load config file: ${error}`);
    }
  }

  /**
   * Apply environment variable overrides to the loaded config
   * This allows cloud deployments to configure the app without modifying config.json
   */
  private applyEnvironmentOverrides(): void {
    if (!this.config) return;

    // Credentials (most important for cloud deployments)
    if (process.env.WILLSUB_USERNAME || process.env.WILLSUB_PASSWORD) {
      this.config.credentials = {
        username: process.env.WILLSUB_USERNAME || this.config.credentials.username,
        password: process.env.WILLSUB_PASSWORD || this.config.credentials.password
      };
    }

    // Base URL
    if (process.env.WILLSUB_BASE_URL) {
      this.config.baseUrl = process.env.WILLSUB_BASE_URL;
    }

    // Polling interval
    if (process.env.WILLSUB_POLLING_INTERVAL) {
      this.config.pollingIntervalSeconds = parseInt(process.env.WILLSUB_POLLING_INTERVAL, 10);
    }

    // Auto-apply settings
    if (process.env.WILLSUB_AUTO_APPLY_ENABLED !== undefined) {
      if (!this.config.autoApply) {
        this.config.autoApply = { enabled: false, autoApplyOnMatches: false, dryRunMode: true };
      }
      this.config.autoApply.enabled = process.env.WILLSUB_AUTO_APPLY_ENABLED === 'true';
    }

    if (process.env.WILLSUB_DRY_RUN !== undefined) {
      if (!this.config.autoApply) {
        this.config.autoApply = { enabled: false, autoApplyOnMatches: false, dryRunMode: true };
      }
      this.config.autoApply.dryRunMode = process.env.WILLSUB_DRY_RUN === 'true';
    }

    // Scheduling
    if (process.env.WILLSUB_SCHEDULING_ENABLED !== undefined) {
      if (!this.config.scheduling) {
        this.config.scheduling = { enabled: false, pollingIntervalSeconds: 30 };
      }
      this.config.scheduling.enabled = process.env.WILLSUB_SCHEDULING_ENABLED === 'true';
    }

    // Log level
    if (process.env.WILLSUB_LOG_LEVEL) {
      if (!this.config.logging) {
        this.config.logging = {
          enabled: true, logToFile: true, logDirectory: './logs',
          logLevel: 'info', includeTimestamp: true, maxLogFiles: 300
        };
      }
      this.config.logging.logLevel = process.env.WILLSUB_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
    }
  }

  /**
   * Get the current configuration
   * - Returns null if config hasn't been loaded yet
   * - Always call loadConfig() first
   */
  public getConfig(): Config | null {
    return this.config;
  }

  /**
   * Get specific configuration value
   * - Safer way to access config properties with fallback values
   */
  public get<K extends keyof Config>(key: K): Config[K] | undefined {
    return this.config?.[key];
  }

  /**
   * Build full URL from endpoint
   * - Combines baseUrl with endpoint path
   * - Useful for constructing API calls
   */
  public buildUrl(endpoint: string): string {
    const baseUrl = this.config?.baseUrl || 'https://willsubplus.com';
    return `${baseUrl}${endpoint}`;
  }
}

export default ConfigManager;
export type {
  Config,
  Credentials,
  JobFilteringConfig,
  AutoApplyConfig,
  SchedulingConfig,
  DisplayConfig,
  AuthenticationConfig,
  LoggingConfig
};
