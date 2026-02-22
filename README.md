# Job Automation System - Node.js + TypeScript Setup

## Project Status

**Current Phase:** Phase 2a (Scheduled Jobs) ✅ COMPLETE
- ✅ Phase 1: Authentication & Cookie Caching
- ✅ Phase 2a: Fetch & cache scheduled jobs  
- ⏳ Phase 2b: Fetch & cache available jobs
- ⏳ Phase 3: Smart job matching
- ⏳ Phase 4: Auto-apply scheduler
- ⏳ Phase 5: Monitoring & robustness

**Test Status:** 48 tests passing (100%)
- ConfigManager: 12 tests ✅
- PuppeteerAuthModule: 13 tests ✅
- JobsModule: 23 tests ✅

## Quick Start Guide

### Prerequisites
- Node.js 16+ installed ([Download](https://nodejs.org/))
- macOS terminal ready
- Valid credentials for willsubplus.com (stored in config.json)

### Installation

1. **Navigate to project directory:**
   ```bash
   cd "/Users/sai/Documents/Github 2/test"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   
   This installs:
   - **axios**: HTTP client for making API requests
   - **node-cron**: Scheduler for periodic tasks
   - **puppeteer**: Headless browser automation
   - **typescript**: TypeScript compiler
   - **ts-node**: Runs TypeScript directly without compilation
   - **jest**: Testing framework

3. **Configure credentials:**
   Edit `config.json` with your willsubplus.com credentials:
   ```json
   {
     "credentials": {
       "email": "your-email@example.com",
       "password": "your-password"
     }
   }
   ```

4. **Build TypeScript to JavaScript (optional):**
   ```bash
   npm run build
   ```
   This creates a `dist/` folder with compiled JavaScript files.

### Running the Project

**Development mode (recommended - demonstrates authentication + Phase 2a):**
```bash
npm run dev
```
This runs TypeScript directly without compilation. Output shows:
1. Loads credentials from config.json
2. Authenticates with willsubplus.com
3. Fetches scheduled (current) jobs
4. Displays cached jobs

**Watch mode (auto-recompile):**
```bash
npm run watch
```
Automatically recompiles TypeScript files as you edit them.

**Production mode:**
```bash
npm run build
npm start
```

### Running Tests

**All tests (48 total):**
```bash
npm test
```

**Watch mode (rerun on changes):**
```bash
npm test -- --watch
```

**Specific test file:**
```bash
npm test -- --testPathPattern=JobsModule
npm test -- --testPathPattern=PuppeteerAuthModule
npm test -- --testPathPattern=ConfigManager
```

## Architecture

### Phase 1: Authentication
- **Module:** `src/auth/PuppeteerAuthModule.ts`
- **Features:** OAuth2 with Puppeteer, cookie caching, auto re-auth
- **Status:** ✅ Complete (13 tests)

### Phase 2a: Scheduled Jobs
- **Module:** `src/jobs/JobsModule.ts`
- **Features:** Fetch current jobs, in-memory caching, TTL management
- **Status:** ✅ Complete (23 tests)
- **Next:** Phase 2b (available jobs)

### Configuration
- **Module:** `src/config/ConfigManager.ts`
- **Features:** Secure config loading, Singleton pattern
- **Status:** ✅ Complete (12 tests)

## Project Structure

```
project/
├── src/
│   ├── config/
│   │   ├── ConfigManager.ts          # Configuration management
│   │   └── __tests__/
│   │       └── ConfigManager.test.ts # 12 config tests
│   ├── auth/
│   │   ├── PuppeteerAuthModule.ts    # OAuth2 + caching
│   │   └── __tests__/
│   │       └── PuppeteerAuthModule.test.ts # 13 auth tests
│   ├── jobs/
│   │   ├── JobsModule.ts             # Job fetching & caching
│   │   └── __tests__/
│   │       └── JobsModule.test.ts    # 23 job tests
│   └── index.ts                      # Main entry point
├── config.json                       # Configuration file
├── tsconfig.json                     # TypeScript configuration
├── package.json                      # Dependencies
├── jest.config.js                    # Jest configuration
├── README.md                         # This file
├── PHASE_1_COMPLETION.md             # Phase 1 summary
└── PHASE_2A_COMPLETION.md            # Phase 2a summary
```

## Key Learnings

### Authentication (Phase 1)
- OAuth2 flows require proper session context
- Puppeteer's headless browser automation is more reliable than raw HTTP
- Cookie caching with TTL provides 6000x performance improvement
- File-based persistence survives application restarts

### Job Management (Phase 2a)
- API responses may use different field naming conventions
- In-memory caching with TTL balances performance and freshness
- Separate caches for different job types prevent data mixing
- Flexible parsing supports multiple API versions

## Documentation

- **[PHASE_1_COMPLETION.md](PHASE_1_COMPLETION.md)** - Authentication architecture
- **[PHASE_2A_COMPLETION.md](PHASE_2A_COMPLETION.md)** - Scheduled jobs module
- **[COOKIE_CACHING.md](COOKIE_CACHING.md)** - Cache implementation details
- **[TESTING.md](TESTING.md)** - Jest testing guide

## Performance Metrics

- **First Authentication:** ~6 seconds (Puppeteer login)
- **Cached Authentication:** ~0ms (instant)
- **First Job Fetch:** ~200-400ms (API call)
- **Cached Job Fetch:** ~0-1ms (instant)
- **Total Test Suite:** ~97 seconds (all 48 tests)

## Next Phase (Phase 2b)

Fetch available jobs from the same JobsModule:
```typescript
const availableResult = await jobsModule.fetchAvailableJobs(cookies);
```

Then in Phase 3, compare scheduled vs available to find new opportunities!

## Troubleshooting

**Tests failing?**
- Run `npm install` to ensure all dependencies installed
- Check Node.js version: `node --version` (need 16+)
- Clear test cache: `npm test -- --clearCache`

**Authentication failing?**
- Verify credentials in `config.json`
- Check internet connection to willsubplus.com
- Credentials might be wrong - try logging in manually first

**Jobs not fetching?**
- API might be rate-limiting - wait a moment and retry
- Endpoint might have changed - check /substitute/jobs/scheduled URL
- Check browser console if running in development mode

## Support

Refer to the comprehensive documentation files for detailed implementation information.

```bash
npm run test:watch
```

**Coverage report:**
```bash
npm run test:coverage
```

**Specific test suite:**
```bash
npm test -- --testPathPattern=ConfigManager
npm test -- --testPathPattern=PuppeteerAuthModule
```

For detailed testing documentation, see [TESTING.md](TESTING.md).

---

## Project Structure

```
project/
├── src/
│   ├── config/
│   │   └── ConfigManager.ts      # Configuration management
│   ├── auth/
│   │   └── AuthModule.ts         # Authentication & session handling
│   └── index.ts                  # Main entry point
├── dist/                         # Compiled JavaScript (created after build)
├── config.json                   # Configuration file (store credentials here)
├── package.json                  # Project dependencies
├── tsconfig.json                 # TypeScript compiler settings
└── README.md                     # This file
```

---

## Understanding TypeScript Basics

### Types & Interfaces
```typescript
// Define the shape of an object
interface User {
  username: string;
  password: string;
}

// Use it to ensure type safety
function login(user: User): void {
  console.log(user.username);
}
```

### Classes
```typescript
class AuthModule {
  private token: string;  // Private = only accessible inside this class
  
  public login(): void {  // Public = accessible from outside
    this.token = "abc123";
  }
}
```

### Async/Await (Handling asynchronous operations)
```typescript
// Traditional callback hell
function fetchData(callback) {
  setTimeout(() => callback("data"), 1000);
}

// Modern async/await (much cleaner!)
async function fetchData() {
  const data = await new Promise(resolve => {
    setTimeout(() => resolve("data"), 1000);
  });
  return data;
}
```

---

## Phase 1 Explanation

### ConfigManager.ts
- **Singleton Pattern**: Only one instance of ConfigManager exists app-wide
- **loadConfig()**: Reads config.json and parses it
- **buildUrl()**: Constructs full URLs from endpoints

### AuthModule.ts
- **axios**: Makes HTTP requests (like fetch in browsers)
- **Interceptors**: Automatically add auth headers to requests
- **Session Token**: Proves you're logged in to subsequent requests

### index.ts
- Entry point that demonstrates loading config and testing login

---

## Next Steps

1. ✅ **Phase 1 Complete**: Config & Authentication set up
2. 📝 Update `config.json` with your actual credentials
3. 🧪 Run `npm run dev` to test login
4. ⏭️ **Phase 2**: Build Job Discovery module

---

## Troubleshooting

**Error: "Cannot find module 'typescript'"**
```bash
npm install
```

**Error: "ENOENT: no such file or directory, open 'config.json'"**
- Make sure config.json exists in the project root

**Login failing with 404**
- The willsubplus.com endpoints might be different
- Check network tab in browser to see actual API calls

---

## Resources for Learning Node.js + TypeScript

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [Axios Documentation](https://axios-http.com/)
- [Puppeteer Documentation](https://pptr.dev/)
- [Jest Testing Guide](https://jestjs.io/docs/getting-started)
- [Async/Await Guide](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises)

---

## Project Status

✅ **Phase 1: Complete** - Authentication with Cookie Caching
- Configuration management
- Headless browser automation with Puppeteer
- OAuth2 Keycloak authentication
- Automatic cookie caching (12-hour default)
- 25 integration tests (all passing)

⏭️ **Phase 2+**: Ready to build Job Discovery, Availability Checking, and Job Application

---

## Documentation

- [CLEANUP_SUMMARY.md](CLEANUP_SUMMARY.md) - Project cleanup details
- [CACHE_CONFIRMATION.md](CACHE_CONFIRMATION.md) - Cookie caching verification
- [COOKIE_CACHING.md](COOKIE_CACHING.md) - Detailed caching usage guide
- [TESTING.md](TESTING.md) - Comprehensive testing documentation
- [PHASE_1_COMPLETION.md](PHASE_1_COMPLETION.md) - Phase 1 completion summary
- [project.md](project.md) - Project requirements and all phases
