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

      // Override credentials from environment variables if available
      if (process.env.WILLSUB_USERNAME || process.env.WILLSUB_PASSWORD) {
        this.config.credentials = {
          username: process.env.WILLSUB_USERNAME || this.config.credentials.username,
          password: process.env.WILLSUB_PASSWORD || this.config.credentials.password
        };
      }
      
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
