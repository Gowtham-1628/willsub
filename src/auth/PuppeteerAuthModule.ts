import puppeteer, { Browser, Page } from 'puppeteer';
import ConfigManager from '../config/ConfigManager';
import * as fs from 'fs';

/**
 * PuppeteerAuthModule with Cookie Caching
 * 
 * This module now includes:
 * - Automatic cookie caching to file
 * - Cookie reuse for faster subsequent logins
 * - Automatic cache expiration (configurable TTL)
 * - Fallback to fresh login if cache is invalid
 * 
 * Why cookie caching?
 * - Eliminates need to re-authenticate for every request
 * - Reduces API load and rate limiting issues
 * - Much faster for periodic job checking (15-second intervals)
 * - Reduces resource usage (no browser launch needed)
 * - Industry-standard practice for automation
 */

interface LoginResponse {
  success: boolean;
  cookies?: string;
  bearerToken?: string;
  userId?: string;
  message?: string;
}

interface CachedSession {
  cookies: string;
  bearerToken?: string;
  userId?: string;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class PuppeteerAuthModule {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private configManager: ConfigManager;
  private isAuthenticated: boolean = false;
  private cachedCookies: string | null = null;
  private cachedToken: string | null = null;
  private cachedUserId: string | null = null;
  private cacheFilePath: string = './auth_cache.json';
  private cookieTTL: number = 12 * 60 * 60 * 1000; // 12 hours default

  constructor(cacheFilePath?: string, ttlHours?: number) {
    this.configManager = ConfigManager.getInstance();
    if (cacheFilePath) {
      this.cacheFilePath = cacheFilePath;
    }
    if (ttlHours) {
      this.cookieTTL = ttlHours * 60 * 60 * 1000;
    }
  }

  /**
   * Load cached cookies from file if they exist and are still valid
   * - Returns true if valid cache found and loaded
   * - Returns false if no cache or cache is expired
   */
  private loadCachedCookies(): boolean {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        console.log('📝 No cached session found');
        return false;
      }

      const cached = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf-8')) as CachedSession;
      const now = Date.now();
      const age = now - cached.timestamp;
      const isExpired = age > cached.ttl;

      if (isExpired) {
        console.log(`⏰ Cached session expired (${Math.round(age / 1000)}s old)`);
        this.clearCache();
        return false;
      }

      console.log(`✓ Valid cached session found (${Math.round(age / 1000)}s old)`);
      this.cachedCookies = cached.cookies;
      this.cachedToken = cached.bearerToken || null;
      this.cachedUserId = cached.userId || null;
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      console.log('⚠️ Error loading cache:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Save cookies to cache file
   * - Enables reuse across application restarts
   * - Stores timestamp for TTL validation
   */
  private saveCookies(cookies: string, bearerToken?: string, userId?: string): void {
    try {
      const session: CachedSession = {
        cookies,
        bearerToken,
        userId,
        timestamp: Date.now(),
        ttl: this.cookieTTL
      };
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(session));
      console.log('💾 Cached session saved');
    } catch (error) {
      console.warn('⚠️ Could not save cache:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Clear cached cookies
   */
  private clearCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        fs.unlinkSync(this.cacheFilePath);
        console.log('🗑️ Cache cleared');
      }
    } catch (error) {
      console.warn('⚠️ Could not clear cache:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Load cache from file
   * - Returns the cached session object or null if not found/invalid
   */
  private loadCacheFromFile(): CachedSession | null {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return null;
      }
      const cached = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf-8')) as CachedSession;
      return cached;
    } catch (error) {
      return null;
    }
  }

  /**
   * Initialize Puppeteer browser
   */
  private async initBrowser(): Promise<void> {
    try {
      console.log('🌐 Launching headless browser...');
      
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 720 });
      
      console.log('✓ Browser launched successfully');
    } catch (error) {
      throw new Error(`Failed to launch browser: ${error}`);
    }
  }

  /**
   * Close the browser
   */
  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      console.log('✓ Browser closed');
    }
  }

  /**
   * Check if we have valid cached cookies
   * - Perfect for periodic job checking
   * - Returns true if cache is valid, no need to authenticate
   * - Returns false if need to re-authenticate
   */
  public hasCachedSession(): boolean {
    return this.cachedCookies !== null && this.isAuthenticated;
  }

  /**
   * Get cached cookies without authenticating
   * - Used for making API requests with stored session
   */
  public getCachedCookies(): string | null {
    return this.cachedCookies;
  }

  /**
   * Login with automatic cookie caching
   * 
   * Flow:
   * 1. Check if cached cookies exist and are valid
   * 2. If valid cache -> return immediately (fast!)
   * 3. If no cache -> authenticate via browser (slower, first time only)
   * 4. Save cookies to cache for next time
   */
  public async login(username?: string, password?: string): Promise<LoginResponse> {
    try {
      // Step 1: Try to use cached cookies first
      if (this.loadCachedCookies()) {
        return {
          success: true,
          cookies: this.cachedCookies || undefined,
          bearerToken: this.cachedToken || undefined,
          userId: this.cachedUserId || undefined,
          message: 'Using cached session'
        };
      }

      // Step 2: Need to authenticate with browser
      await this.initBrowser();

      if (!this.page) {
        throw new Error('Failed to initialize page');
      }

      // Get credentials
      const creds = this.configManager.get('credentials');
      const loginUser = username || creds?.username;
      const loginPass = password || creds?.password;

      if (!loginUser || !loginPass) {
        throw new Error('Credentials not provided and not found in config');
      }

      /**
       * Step 3: Navigate to app and trigger OAuth2 flow
       */
      console.log(`🔐 Navigating to willsubplus.com...`);
      await this.page.goto('https://willsubplus.com', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      const pageUrl = this.page.url();
      console.log(`   Redirected to: ${pageUrl}`);

      /**
       * Step 4: Wait for login form
       */
      try {
        await this.page.waitForSelector('#username', { timeout: 10000 });
      } catch (error) {
        console.log('   ⚠️ Login form not found');
        throw error;
      }

      /**
       * Step 5: Fill in and submit credentials
       */
      console.log('📝 Entering credentials...');
      await this.page.type('#username', loginUser, { delay: 50 });
      await this.page.type('#password', loginPass, { delay: 50 });

      console.log('🚀 Submitting login form...');
      
      const navigationPromise = this.page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.page.click('#kc-login');
      await navigationPromise;

      /**
       * Step 6: Verify we're authenticated
       */
      const finalUrl = this.page.url();
      console.log(`✓ Login complete! Final URL: ${finalUrl}`);

      if (!finalUrl.includes('willsubplus.com')) {
        throw new Error(`Unexpected final URL: ${finalUrl}`);
      }

      /**
       * Step 7: Extract and cache cookies + Bearer token
       */
      const cookies = await this.page.cookies();
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      console.log(`✓ Obtained ${cookies.length} cookies`);

      /**
       * Step 8: Try to extract Bearer token from localStorage or page data
       */
      let bearerToken = '';
      let userId = '';
      
      try {
        // Extract from localStorage
        const localStorageData = await this.page.evaluate(() => {
          const keys = Object.keys(localStorage);
          const data: { [key: string]: string } = {};
          for (let key of keys) {
            data[key] = localStorage.getItem(key) || '';
          }
          return data;
        });
        
        // Look for access token (not refresh token)
        for (const [key, value] of Object.entries(localStorageData)) {
          if ((key.includes('access_token') || key === 'token') && 
              typeof value === 'string' && value.includes('eyJ')) {
            bearerToken = value.replace(/"/g, '');
            console.log(`✓ Found Bearer token in localStorage[${key}]`);
            break;
          }
        }

        // If no access token found, try refresh token as fallback
        if (!bearerToken) {
          for (const [key, value] of Object.entries(localStorageData)) {
            if (key.includes('token') && typeof value === 'string' && value.includes('eyJ')) {
              bearerToken = value.replace(/"/g, '');
              console.log(`✓ Found token in localStorage[${key}] (fallback)`);
              break;
            }
          }
        }

        // Try to extract userId from JWT token
        if (bearerToken) {
          try {
            const parts = bearerToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
              console.log(`🔍 JWT Payload keys:`, Object.keys(payload));
              
              // Try different userId field names
              if (payload.userId) {
                userId = payload.userId;
              } else if (payload.sub && !payload.sub.includes(':')) {
                userId = payload.sub;
              } else if (payload.sub && payload.sub.includes(':')) {
                // Extract numeric ID from composite sub (e.g., "f:123:456")
                const subParts = payload.sub.split(':');
                userId = subParts[subParts.length - 1];
              } else if (payload.preferred_username) {
                userId = payload.preferred_username;
              }
              
              if (userId) {
                console.log(`✓ Extracted userId from token: ${userId}`);
              } else {
                console.warn(`⚠️  Could not extract userId. Available: ${JSON.stringify(payload).substring(0, 200)}`);
              }
            }
          } catch (e) {
            console.warn('⚠️  Could not parse JWT token:', e instanceof Error ? e.message : e);
          }
        }
      } catch (e) {
        console.warn('⚠️  Could not access localStorage');
      }

      // Cache the credentials
      this.saveCookies(cookieString, bearerToken, userId);
      this.cachedCookies = cookieString;
      this.cachedToken = bearerToken;
      this.cachedUserId = userId;
      this.isAuthenticated = true;

      return {
        success: true,
        cookies: cookieString,
        bearerToken: bearerToken,
        userId: userId,
        message: 'Login successful - session cached'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('✗ Login failed:', errorMessage);
      return {
        success: false,
        message: errorMessage
      };
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * Verify and refresh auth if needed
   * - Checks if current token might be expired or invalid
   * - Refreshes if cache is stale or if explicitly requested
   */
  public async verifyAndRefreshAuth(forceRefresh: boolean = false): Promise<LoginResponse> {
    if (forceRefresh) {
      console.log('🔄 Auth verification: Force refresh requested');
      return this.reAuthenticate();
    }

    // Check if we have a valid cached session
    if (this.hasCachedSession() && this.cachedToken) {
      const cache = this.loadCacheFromFile();
      if (cache) {
        const ageMs = Date.now() - cache.timestamp;
        const ageHours = Math.round(ageMs / (60 * 60 * 1000));
        const ttlHours = Math.round(cache.ttl / (60 * 60 * 1000));
        
        console.log(`✓ Auth cache status: ${ageHours}h old (TTL: ${ttlHours}h)`);
        
        // If cache is more than 80% expired, refresh
        if (ageMs > cache.ttl * 0.8) {
          console.log('⚠️  Auth cache nearing expiration - refreshing...');
          return this.reAuthenticate();
        }
        
        // Cache is still valid
        return {
          success: true,
          bearerToken: this.cachedToken || undefined,
          userId: this.cachedUserId || undefined,
          message: 'Using cached session'
        };
      }
    }

    // No valid cache, perform fresh login
    console.log('🔑 No valid cached session - performing fresh login');
    return this.login();
  }

  /**
   * Force re-authentication (bypass cache)
   * - Useful if you suspect the session is invalid
   */
  public async reAuthenticate(username?: string, password?: string): Promise<LoginResponse> {
    console.log('🔄 Force re-authenticating...');
    this.clearCache();
    this.cachedCookies = null;
    this.isAuthenticated = false;
    return this.login(username, password);
  }

  /**
   * Get cached Bearer token
   */
  public getBearerToken(): string | null {
    return this.cachedToken;
  }

  /**
   * Get cached user ID
   */
  public getUserId(): string | null {
    return this.cachedUserId;
  }

  /**
   * Check if currently authenticated
   */
  public getAuthStatus(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Get page instance (for advanced automation)
   */
  public getPage(): Page | null {
    return this.page;
  }

  /**
   * Get browser instance (for advanced automation)
   */
  public getBrowser(): Browser | null {
    return this.browser;
  }
}

export default PuppeteerAuthModule;
export type { LoginResponse };
