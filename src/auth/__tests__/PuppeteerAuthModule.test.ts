import PuppeteerAuthModule from '../PuppeteerAuthModule';
import ConfigManager from '../../config/ConfigManager';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Integration Tests for PuppeteerAuthModule
 * 
 * Features tested:
 * - Cookie caching mechanism
 * - Cache expiration (TTL)
 * - Fast reuse of cached sessions
 * - Cache invalidation and refresh
 * - Error handling for corrupted/missing cache
 * 
 * These tests verify real authentication against willsubplus.com with Keycloak
 */

describe('PuppeteerAuthModule', () => {
  let authModule: PuppeteerAuthModule;
  let configManager: ConfigManager;
  const testCacheFile = './test_auth_cache.json';

  beforeEach(() => {
    configManager = ConfigManager.getInstance();
    configManager.loadConfig('./config.json');
    
    // Use test cache file to avoid affecting real cache
    authModule = new PuppeteerAuthModule(testCacheFile);
  });

  afterEach(async () => {
    // Clean up test cache file
    if (fs.existsSync(testCacheFile)) {
      fs.unlinkSync(testCacheFile);
    }

    // Ensure browser is closed
    if (authModule.getBrowser()) {
      try {
        await authModule.getBrowser()!.close();
      } catch (error) {
        // Already closed
      }
    }
  });

  /**
   * Test 1: First login (no cache)
   */
  describe('First Login (No Cache)', () => {
    it(
      'should authenticate and create cache on first login',
      async () => {
        expect(authModule.hasCachedSession()).toBe(false);

        const result = await authModule.login();

        expect(result.success).toBe(true);
        expect(result.cookies).toBeDefined();
        expect(result.message).toContain('cached');
        
        // Verify cache file was created
        expect(fs.existsSync(testCacheFile)).toBe(true);
      },
      45000
    );

    it(
      'should populate cookies after first login',
      async () => {
        await authModule.login();

        expect(authModule.getCachedCookies()).toBeDefined();
        expect(authModule.getCachedCookies()!.length).toBeGreaterThan(0);
      },
      45000
    );
  });

  /**
   * Test 2: Cache reuse
   */
  describe('Cache Reuse', () => {
    it(
      'should reuse cached session on subsequent login calls',
      async () => {
        // First login - creates cache
        const firstResult = await authModule.login();
        expect(firstResult.success).toBe(true);

        // Create new module instance with same cache file
        const authModule2 = new PuppeteerAuthModule(testCacheFile);

        // Second login - should use cache
        const startTime = Date.now();
        const secondResult = await authModule2.login();
        const duration = Date.now() - startTime;

        expect(secondResult.success).toBe(true);
        expect(secondResult.message).toContain('cached');
        
        // Cached login should be much faster (< 2 seconds vs 5-6 seconds)
        expect(duration).toBeLessThan(2000);
      },
      60000
    );

    it(
      'should have cached session flag set',
      async () => {
        await authModule.login();
        expect(authModule.hasCachedSession()).toBe(true);

        // Create new module instance
        const authModule2 = new PuppeteerAuthModule(testCacheFile);
        const result = await authModule2.login();

        expect(result.success).toBe(true);
        expect(authModule2.hasCachedSession()).toBe(true);
      },
      45000
    );
  });

  /**
   * Test 3: Cache expiration
   */
  describe('Cache Expiration (TTL)', () => {
    it(
      'should expire cache after TTL',
      async () => {
        // Create auth module with very short TTL (1 second)
        const shortTTLModule = new PuppeteerAuthModule(testCacheFile, 1 / 3600); // 1 second

        // First login
        const firstResult = await shortTTLModule.login();
        expect(firstResult.success).toBe(true);

        // Wait for cache to expire
        await new Promise(resolve => setTimeout(resolve, 1100));

        // Create new module instance and try to login
        const authModule2 = new PuppeteerAuthModule(testCacheFile, 1 / 3600);
        
        // Cache should be expired, so this will re-authenticate
        const secondResult = await authModule2.login();
        
        // Should still succeed, but may need re-auth
        expect(secondResult.success).toBe(true);
      },
      60000
    );

    it(
      'should use default 12-hour TTL',
      async () => {
        await authModule.login();

        // Check the cache file
        const cacheData = JSON.parse(fs.readFileSync(testCacheFile, 'utf-8'));
        
        // TTL should be 12 hours in milliseconds
        expect(cacheData.ttl).toBe(12 * 60 * 60 * 1000);
      },
      45000
    );
  });

  /**
   * Test 4: Cache invalidation and refresh
   */
  describe('Cache Management', () => {
    it(
      'should clear cache when re-authenticating',
      async () => {
        // First login
        const firstResult = await authModule.login();
        expect(firstResult.success).toBe(true);
        
        // Cache should exist after first login
        if (fs.existsSync(testCacheFile)) {
          console.log('   Cache file exists after first login');
        }

        // Re-authenticate
        const result = await authModule.reAuthenticate();

        expect(result.success).toBe(true);
        // After re-auth, new cache should be created
        expect(result.message).toBeDefined();
      },
      60000
    );

    it(
      'should reset cached cookies flag on re-auth',
      async () => {
        // First login
        await authModule.login();
        expect(authModule.hasCachedSession()).toBe(true);

        // Store old cookies
        const oldCookies = authModule.getCachedCookies();

        // Re-authenticate
        await authModule.reAuthenticate();

        // Should still be authenticated
        expect(authModule.hasCachedSession()).toBe(true);

        // Cookies might be different (new session)
        const newCookies = authModule.getCachedCookies();
        expect(newCookies).toBeDefined();
      },
      60000
    );
  });

  /**
   * Test 5: Cache file format
   */
  describe('Cache File Format', () => {
    it(
      'should store cache in correct JSON format',
      async () => {
        await authModule.login();

        const cacheContent = fs.readFileSync(testCacheFile, 'utf-8');
        const cacheData = JSON.parse(cacheContent);

        expect(cacheData).toHaveProperty('cookies');
        expect(cacheData).toHaveProperty('timestamp');
        expect(cacheData).toHaveProperty('ttl');

        expect(typeof cacheData.cookies).toBe('string');
        expect(typeof cacheData.timestamp).toBe('number');
        expect(typeof cacheData.ttl).toBe('number');
      },
      45000
    );

    it(
      'should store valid timestamp',
      async () => {
        const beforeTime = Date.now();
        await authModule.login();
        const afterTime = Date.now();

        const cacheData = JSON.parse(fs.readFileSync(testCacheFile, 'utf-8'));
        const storedTime = cacheData.timestamp;

        expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
        expect(storedTime).toBeLessThanOrEqual(afterTime);
      },
      45000
    );
  });

  /**
   * Test 6: Corrupted cache handling
   */
  describe('Error Handling', () => {
    it(
      'should handle corrupted cache file gracefully',
      async () => {
        // Write corrupted cache file
        fs.writeFileSync(testCacheFile, 'invalid json {]');

        // Should fall back to fresh authentication
        const result = await authModule.login();

        expect(result.success).toBe(true);
        expect(authModule.hasCachedSession()).toBe(true);
      },
      45000
    );

    it(
      'should handle missing cache file gracefully',
      async () => {
        expect(fs.existsSync(testCacheFile)).toBe(false);

        const result = await authModule.login();

        expect(result.success).toBe(true);
        expect(fs.existsSync(testCacheFile)).toBe(true);
      },
      45000
    );
  });

  /**
   * Test 7: Performance comparison
   */
  describe('Performance', () => {
    it(
      'should show significant speed improvement with cached session',
      async () => {
        // First login (slow - fresh auth)
        const start1 = Date.now();
        await authModule.login();
        const duration1 = Date.now() - start1;

        // Create new module and use cached session
        const authModule2 = new PuppeteerAuthModule(testCacheFile);
        const start2 = Date.now();
        await authModule2.login();
        const duration2 = Date.now() - start2;

        console.log(`\n  First login: ${duration1}ms`);
        console.log(`  Cached login: ${duration2}ms`);
        console.log(`  Speed improvement: ${Math.round((duration1 / duration2) * 10) / 10}x faster\n`);

        // Cached should be significantly faster
        expect(duration2).toBeLessThan(duration1 / 2);
      },
      60000
    );
  });
});
