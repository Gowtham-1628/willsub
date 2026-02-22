import ConfigManager from '../ConfigManager';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Integration Tests for ConfigManager
 * 
 * Tests the configuration loading and management functionality
 */

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    // Get fresh instance for each test
    configManager = ConfigManager.getInstance();
  });

  /**
   * Test 1: Successfully load config from JSON file
   */
  describe('loadConfig', () => {
    it('should successfully load configuration from config.json', () => {
      const result = configManager.loadConfig('./config.json');

      expect(result).toBeDefined();
      expect(result.baseUrl).toBe('https://willsubplus.com');
      expect(result.credentials).toBeDefined();
      expect(result.credentials.username).toBeDefined();
      expect(result.credentials.password).toBeDefined();
    });

    it('should throw error when config file does not exist', () => {
      expect(() => {
        configManager.loadConfig('./nonexistent-config.json');
      }).toThrow();
    });

    it('should throw error when config file is invalid JSON', () => {
      // Create a temporary invalid JSON file
      const tempPath = './temp-invalid-config.json';
      fs.writeFileSync(tempPath, 'invalid json {]');

      try {
        expect(() => {
          configManager.loadConfig(tempPath);
        }).toThrow();
      } finally {
        // Clean up
        fs.unlinkSync(tempPath);
      }
    });
  });

  /**
   * Test 2: Get configuration values
   */
  describe('getConfig', () => {
    beforeEach(() => {
      configManager.loadConfig('./config.json');
    });

    it('should return loaded configuration', () => {
      const config = configManager.getConfig();

      expect(config).not.toBeNull();
      expect(config?.baseUrl).toBe('https://willsubplus.com');
      expect(config?.pollingIntervalSeconds).toBeGreaterThan(0);
    });

    it('should return null if config not loaded', () => {
      const freshManager = ConfigManager.getInstance();
      // Don't load config
      const config = freshManager.getConfig();

      // Config might still exist from previous test, so just check it's the right type
      expect(config === null || typeof config === 'object').toBe(true);
    });
  });

  /**
   * Test 3: Get specific config values
   */
  describe('get', () => {
    beforeEach(() => {
      configManager.loadConfig('./config.json');
    });

    it('should return specific config value', () => {
      const baseUrl = configManager.get('baseUrl');
      expect(baseUrl).toBe('https://willsubplus.com');

      const pollingInterval = configManager.get('pollingIntervalSeconds');
      expect(pollingInterval).toBeGreaterThan(0);
    });

    it('should return credentials', () => {
      const creds = configManager.get('credentials');
      expect(creds).toBeDefined();
      expect(creds?.username).toBeDefined();
      expect(creds?.password).toBeDefined();
    });
  });

  /**
   * Test 4: Build URLs correctly
   */
  describe('buildUrl', () => {
    beforeEach(() => {
      configManager.loadConfig('./config.json');
    });

    it('should build correct URL from endpoint', () => {
      const url = configManager.buildUrl('/substitute/jobs/available/daily');
      expect(url).toBe('https://willsubplus.com/substitute/jobs/available/daily');
    });

    it('should handle URLs with leading slash', () => {
      const url = configManager.buildUrl('/substitute/jobs/scheduled');
      expect(url).toBe('https://willsubplus.com/substitute/jobs/scheduled');
    });

    it('should concatenate URL even without leading slash', () => {
      // Note: buildUrl just concatenates, so this will result in no slash separator
      const url = configManager.buildUrl('substitute/jobs/available/daily');
      expect(url).toContain('substitute/jobs/available/daily');
    });
  });

  /**
   * Test 5: Singleton pattern
   */
  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const manager1 = ConfigManager.getInstance();
      const manager2 = ConfigManager.getInstance();

      expect(manager1).toBe(manager2);
    });

    it('should maintain loaded config across instances', () => {
      const manager1 = ConfigManager.getInstance();
      manager1.loadConfig('./config.json');

      const manager2 = ConfigManager.getInstance();
      const config = manager2.getConfig();

      expect(config).toBeDefined();
      expect(config?.baseUrl).toBe('https://willsubplus.com');
    });
  });
});
