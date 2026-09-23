import ConfigManager from './config/ConfigManager';
import PuppeteerAuthModule from './auth/PuppeteerAuthModule';
import JobsModule from './jobs/JobsModule';
import JobPreferencesManager from './jobs/JobPreferencesManager';
import JobComparisonModule from './jobs/JobComparisonModule';
import JobApplicationModule from './jobs/JobApplicationModule';
import JobScheduler from './scheduler/JobScheduler';
import FileLogger from './logger/FileLogger';
import TelegramNotifier from './notifications/TelegramNotifier';
import axios from 'axios';

const alertedBuildingJobIds = new Set<string>();

/**
 * Display jobs in a formatted table
 */
function displayJobsTable(jobs: any[]) {
  const displayJobs = jobs.slice(0, 10);
  const tableRows = displayJobs.map((job, idx) => {
    const scheduleType = job.schedules?.[0]?.scheduleType || 'N/A';
    const buildingObj = job.schedules?.[0]?.building;
    const building = buildingObj?.title || buildingObj?.name || 'N/A';
    const startDate = job.startDate || job.date || 'N/A';
    const endDate = job.endDate || startDate;
    const time = job.schedules?.[0]?.startTime || job.time || '';
    const title = job.positionTitle || job.position || job.positionType?.title || job.title || 'Untitled';
    return {
      '#': idx + 1,
      'Title': title,
      'Building': building,
      'Schedule Type': scheduleType,
      'Start Date': startDate,
      'End Date': endDate,
      'Time': time
    };
  });

  // Print table header
  console.log('');
  console.log('   # │ Title        │ Building     │ Schedule Type │ Start Date   │ End Date     │ Time');
  console.log('   ──┼──────────────┼──────────────┼───────────────┼──────────────┼──────────────┼─────────');

  // Print table rows
  tableRows.forEach(row => {
    const num = String(row['#']).padEnd(2);
    const title = String(row['Title']).padEnd(12);
    const building = String(row['Building']).padEnd(12);
    const scheduleType = String(row['Schedule Type']).padEnd(13);
    const startDate = String(row['Start Date']).padEnd(12);
    const endDate = String(row['End Date']).padEnd(12);
    const time = row['Time'];
    console.log(`   ${num}│ ${title}│ ${building}│ ${scheduleType}│ ${startDate}│ ${endDate}│ ${time}`);
  });
  console.log('');

  if (jobs.length > 10) {
    console.log(`   ... and ${jobs.length - 10} more jobs\n`);
  }
}

/**
 * Handle 401 errors by refreshing auth and retrying
 */
async function handleAuthError(
  authModule: PuppeteerAuthModule,
  retryFn: (token: string) => Promise<any>,
  telegram?: TelegramNotifier | null
): Promise<any> {
  console.log('\n🔄 Detected 401 - Attempting to refresh authentication...');
  const refreshResult = await authModule.reAuthenticate();
  
  if (refreshResult.success && refreshResult.bearerToken) {
    console.log('✓ Re-authentication successful - Retrying request...\n');
    if (telegram?.isEnabled()) {
      await telegram.notifyAuthRefresh();
    }
    return retryFn(refreshResult.bearerToken);
  } else {
    console.log('✗ Re-authentication failed\n');
    return null;
  }
}

/**
 * Load filter preferences from config and create a configured JobPreferencesManager
 */
function loadFilterPreferences(configManager: ConfigManager): { preferences: any; manager: JobPreferencesManager } {
  const manager = new JobPreferencesManager();
  let preferences: any = {};

  try {
    const config = configManager.getConfig();
    const jobFilteringConfig = config?.jobFiltering;

    if (jobFilteringConfig?.enabled) {
      if (jobFilteringConfig.filterByPositionType?.enabled) {
        if (jobFilteringConfig.filterByPositionType.preferred?.length) {
          preferences.preferredPositionTypes = jobFilteringConfig.filterByPositionType.preferred;
        }
        if (jobFilteringConfig.filterByPositionType.exclude?.length) {
          preferences.excludePositionTypes = jobFilteringConfig.filterByPositionType.exclude;
        }
      }

      if (jobFilteringConfig.filterByBuilding?.enabled) {
        if (jobFilteringConfig.filterByBuilding.preferred?.length) {
          preferences.preferredBuildings = jobFilteringConfig.filterByBuilding.preferred;
        }
        if (jobFilteringConfig.filterByBuilding.preferredBuildingIds?.length) {
          preferences.preferredBuildingIds = jobFilteringConfig.filterByBuilding.preferredBuildingIds;
        }
        if (jobFilteringConfig.filterByBuilding.exclude?.length) {
          preferences.excludeBuildings = jobFilteringConfig.filterByBuilding.exclude;
        }
        if (jobFilteringConfig.filterByBuilding.excludeBuildingIds?.length) {
          preferences.excludeBuildingIds = jobFilteringConfig.filterByBuilding.excludeBuildingIds;
        }
      }

      if (jobFilteringConfig.filterByScheduleType?.enabled) {
        if (jobFilteringConfig.filterByScheduleType.preferred?.length) {
          preferences.preferredScheduleTypes = jobFilteringConfig.filterByScheduleType.preferred;
        }
      }

      if (jobFilteringConfig.filterByDuration?.enabled) {
        if (jobFilteringConfig.filterByDuration.minDays) {
          preferences.minDays = jobFilteringConfig.filterByDuration.minDays;
        }
        if (jobFilteringConfig.filterByDuration.maxDays) {
          preferences.maxDays = jobFilteringConfig.filterByDuration.maxDays;
        }
        if (jobFilteringConfig.filterByDuration.onlyMultipleDays) {
          preferences.onlyMultipleDays = jobFilteringConfig.filterByDuration.onlyMultipleDays;
        }
      }

      if (jobFilteringConfig.filterByJobType?.enabled) {
        if (jobFilteringConfig.filterByJobType.includeLongTerm !== undefined) {
          preferences.includeLongTerm = jobFilteringConfig.filterByJobType.includeLongTerm;
        }
        if (jobFilteringConfig.filterByJobType.includeShortTerm !== undefined) {
          preferences.includeShortTerm = jobFilteringConfig.filterByJobType.includeShortTerm;
        }
        if (jobFilteringConfig.filterByJobType.includeSupplemental !== undefined) {
          preferences.includeSupplemental = jobFilteringConfig.filterByJobType.includeSupplemental;
        }

        const supplementalSetting = jobFilteringConfig.filterByJobType.includeSupplemental;
        console.log(`   Supplemental job filter: ${supplementalSetting === false ? 'excluding supplemental jobs' : supplementalSetting === true ? 'including supplemental jobs' : 'not configured (default: include)'}`);
      }

      manager.setPreferences(preferences);
    }
  } catch (error) {
    console.log('   \u26a0\ufe0f Job filtering not configured, showing all jobs\n');
  }

  return { preferences, manager };
}

/**
 * Main entry point for the application
 * 
 * This demonstrates Phase 1+2a:
 * - Phase 1: Foundation & Authentication with cookie caching
 * - Phase 2a: Fetch and cache scheduled (current) jobs
 */

async function main() {
  console.log('🚀 Job Automation System - Phase 1+2a: Authentication & Scheduled Jobs\n');

  // Initialize logger
  let logger: FileLogger | null = null;
  let telegram: TelegramNotifier | null = null;
  
  try {
    // Step 0: Initialize logging
    const configManager = ConfigManager.getInstance();
    configManager.loadConfig();
    const config = configManager.getConfig();
    
    const loggingConfig = config?.logging || {
      enabled: true,
      logToFile: true,
      logDirectory: './logs',
      logLevel: 'info',
      includeTimestamp: true,
      maxLogFiles: 30
    };

    logger = new FileLogger(loggingConfig);
    logger.initialize();

    // Initialize Telegram notifications
    const telegramConfig = config?.telegram || { enabled: false, botToken: '', chatId: '' };
    telegram = new TelegramNotifier(telegramConfig);
    if (telegram.isEnabled()) {
      console.log('📱 Telegram notifications enabled');
    } else {
      console.log('📱 Telegram notifications disabled (set TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID to enable)');
    }

    // Step 1: Initialize and load configuration
    console.log('📋 Step 1: Loading Configuration');
    console.log(`   Base URL: ${config?.baseUrl}`);
    console.log(`   Polling Interval: ${config?.pollingIntervalSeconds}s\n`);

    // Step 2: Initialize Puppeteer authentication module with caching
    console.log('🔑 Step 2: Initializing Puppeteer Authentication Module (with Cookie Caching)');
    const authModule = new PuppeteerAuthModule();
    console.log('   ✓ Auth module created with caching enabled\n');

    // Step 3: Attempt login
    console.log('🔐 Step 3: Testing Puppeteer Login');
    const loginResult = await authModule.login();
    
    if (!loginResult.success) {
      console.log('   ✗ Login failed. Check credentials and try again.\n');
      if (telegram?.isEnabled()) {
        await telegram.notifyAuthError('Login failed. Check credentials and try again.');
      }
      process.exit(1);
    }

    console.log(`   ✓ Authentication Status: ${authModule.getAuthStatus()}\n`);
    console.log('✨ Phase 1 Complete!\n');

    // Step 4: Initialize Jobs Module and fetch scheduled jobs (Phase 2a)
    console.log('='.repeat(50));
    console.log('📋 Phase 2a: Fetching Scheduled (Current) Jobs\n');

    const axiosInstance = axios.create();
    const jobsModule = new JobsModule(axiosInstance, 5, config?.baseUrl); // 5 second cache for testing

    // Get Bearer token and userId from auth result
    const bearerToken = loginResult.bearerToken;
    const userId = loginResult.userId;
    
    if (!bearerToken || !userId) {
      console.log('✗ No Bearer token or userId available for job fetching');
      console.log(`  Token: ${bearerToken ? 'Present' : 'Missing'}`);
      console.log(`  UserId: ${userId ? 'Present' : 'Missing'}\n`);
      process.exit(1);
    }

    console.log(`✓ Bearer Token: ${bearerToken.substring(0, 30)}...`);
    console.log(`✓ User ID: ${userId}\n`);

    // Step 5: Verify and refresh auth if needed before Phase 2
    console.log('🔍 Step 5: Verifying Authentication Status');
    const authVerification = await authModule.verifyAndRefreshAuth();
    
    if (!authVerification.success) {
      console.log('   ✗ Authentication verification failed');
      console.log(`   Error: ${authVerification.message}\n`);
      process.exit(1);
    }

    let currentBearerToken = authVerification.bearerToken || bearerToken;
    console.log(`   ✓ Auth verified - Bearer Token valid\n`);
    
    // Fetch scheduled jobs
    let scheduledResult = await jobsModule.fetchScheduledJobs(currentBearerToken, userId);

    // Handle 401 errors by refreshing auth and retrying
    if (!scheduledResult.success && scheduledResult.statusCode === 401) {
      const retryResult = await handleAuthError(authModule, async (newToken) => 
        jobsModule.fetchScheduledJobs(newToken, userId)
      , telegram);
      if (retryResult) {
        scheduledResult = retryResult;
      }
    }

    if (scheduledResult.success) {
      console.log(`✓ Fetched ${scheduledResult.totalCount} scheduled jobs`);
      
      if (scheduledResult.jobs.length > 0) {
        if (config?.display?.showScheduledJobsTable !== false) {
          console.log('\n📅 Current Scheduled Jobs:');
          displayJobsTable(scheduledResult.jobs);
        } else {
          console.log('   (Table display disabled in config)\n');
        }
      } else {
        console.log('   (No scheduled jobs found)\n');
      }

      console.log('✨ Phase 2a Complete! Scheduled jobs cached and ready\n');
    } else {
      console.log(`✗ Failed to fetch jobs: ${scheduledResult.message}\n`);
    }

    // Phase 2b: Fetch available/new jobs
    console.log('='.repeat(50));
    console.log('📋 Phase 2b: Fetching Available (New) Jobs\n');

    let availableResult = await jobsModule.fetchAvailableJobs(currentBearerToken, userId);

    // Handle 401 errors by refreshing auth and retrying
    if (!availableResult.success && availableResult.statusCode === 401) {
      const retryResult = await handleAuthError(authModule, async (newToken) => 
        jobsModule.fetchAvailableJobs(newToken, userId)
      , telegram);
      if (retryResult) {
        availableResult = retryResult;
      }
    }

    if (availableResult.success) {
      console.log(`✓ Fetched ${availableResult.totalCount} available jobs`);
      
      // Load filter preferences from config
      const { manager: preferencesManager, preferences } = loadFilterPreferences(configManager);

      if (availableResult.jobs.length > 0) {
        // Log all jobs BEFORE filtering
        console.log(`\n📋 Before Filter: ${availableResult.jobs.length} available job(s):`);
        availableResult.jobs.forEach((job: any, idx: number) => {
          const title = job.positionTitle || job.position || job.positionType?.title || job.title || 'Untitled';
          const building = job.schedules?.[0]?.building?.title || job.schedules?.[0]?.building?.name || 'N/A';
          const date = job.startDate || job.date || 'N/A';
          console.log(`   ${idx + 1}. ${title} @ ${building} (${date})`);
        });

        // Apply filtering if preferences are configured
        const filterResult = preferencesManager.filterJobs(availableResult.jobs);
        const filteredJobs = filterResult.passed;
        const excludedJobs = filterResult.filtered;

        // Log jobs AFTER filtering
        console.log(`\n✅ After Filter: ${filteredJobs.length} job(s) passed:`);
        filteredJobs.forEach((job: any, idx: number) => {
          const title = job.positionTitle || job.position || job.positionType?.title || job.title || 'Untitled';
          const building = job.schedules?.[0]?.building?.title || job.schedules?.[0]?.building?.name || 'N/A';
          const date = job.startDate || job.date || 'N/A';
          console.log(`   ${idx + 1}. ${title} @ ${building} (${date})`);
        });

        console.log('\n🆕 Available Jobs (Today & Upcoming):');
        
        if (Object.keys(preferences).length > 0) {
          console.log('\n📍 Active Filters:');
          console.log(preferencesManager.getSummary().split('\n').map((line: string) => '   ' + line).join('\n'));
          console.log('');
        }

        if (filteredJobs.length > 0) {
          console.log(`\n✅ Filtered Results: ${filteredJobs.length} job(s) match your preferences`);
          if (config?.display?.showAvailableJobsTable !== false) {
            console.log('');
            displayJobsTable(filteredJobs);
          } else {
            console.log('   (Table display disabled in config)\n');
          }
        } else {
          console.log(`\n✅ Filtered Results: No jobs match your preferences`);
          if (config?.display?.showFilteredJobsDetails !== false && excludedJobs.length > 0) {
            console.log(`   ${excludedJobs.length} job(s) were excluded:\n`);
            excludedJobs.slice(0, 5).forEach((item, idx) => {
              const exTitle = item.job.positionTitle || item.job.position || item.job.positionType?.title || item.job.title || 'Untitled';
              const exBuilding = item.job.schedules?.[0]?.building?.title || item.job.schedules?.[0]?.building?.name || 'N/A';
              console.log(`   ${idx + 1}. ${exTitle} @ ${exBuilding}`);
              console.log(`      Reason: ${item.reason}\n`);
            });
            if (excludedJobs.length > 5) {
              console.log(`   ... and ${excludedJobs.length - 5} more excluded jobs\n`);
            }
          } else if (!config?.display?.showFilteredJobsDetails) {
            console.log('   (Filtered jobs details disabled in config)\n');
          }
        }
      } else {
        console.log('   (No available jobs found)\n');
      }

      console.log('✨ Phase 2b Complete! Available jobs filtered and ready\n');
    } else {
      console.log(`✗ Failed to fetch available jobs: ${availableResult.message}\n`);
    }

    // VERIFICATION: Test Phase 2b with long-term jobs
    // Check if includeLongTerm is enabled before making the API call
    const jobFilteringForLongTerm = config?.jobFiltering?.filterByJobType;
    const shouldLoadLongTerm = jobFilteringForLongTerm?.enabled ? (jobFilteringForLongTerm.includeLongTerm !== false) : true;

    let longTermResult: any = { success: false, jobs: [], totalCount: 0, message: 'Long-term jobs skipped (includeLongTerm is false)' };

    if (shouldLoadLongTerm) {
      console.log('='.repeat(50));
      console.log('🔍 VERIFICATION: Phase 2b with Long-term Jobs (with Filtering)\n');

      longTermResult = await jobsModule.fetchAvailableLongTermJobs(currentBearerToken, userId);

      // Handle 401 errors by refreshing auth and retrying
      if (!longTermResult.success && longTermResult.statusCode === 401) {
        const retryResult = await handleAuthError(authModule, async (newToken) => 
          jobsModule.fetchAvailableLongTermJobs(newToken, userId)
        , telegram);
        if (retryResult) {
          longTermResult = retryResult;
        }
      }

      if (longTermResult.success) {
        console.log(`✓ Fetched ${longTermResult.totalCount} long-term available jobs`);
        
        if (longTermResult.jobs.length > 0) {
          // Load filter preferences from config
          const { manager: verificationPrefs, preferences: verificationPreferences } = loadFilterPreferences(configManager);

          const verificationFilter = verificationPrefs.filterJobs(longTermResult.jobs);
          const filteredLongTerm = verificationFilter.passed;
          const excludedLongTerm = verificationFilter.filtered;

          console.log('\n📅 Long-term Available Jobs:\n');
          
          if (Object.keys(verificationPreferences).length > 0) {
            console.log('📍 Active Filters:');
            console.log(verificationPrefs.getSummary().split('\n').map((line: string) => '   ' + line).join('\n'));
            console.log('');
          }

          if (filteredLongTerm.length > 0) {
            console.log(`✅ Filtered Results: ${filteredLongTerm.length}/${longTermResult.jobs.length} long-term job(s) match your preferences`);
            if (config?.display?.showLongTermJobsTable !== false) {
              console.log('');
              displayJobsTable(filteredLongTerm);
            } else {
              console.log('   (Table display disabled in config)\n');
            }
          } else {
            console.log(`✅ Filtered Results: No long-term jobs match your preferences`);
            if (config?.display?.showFilteredJobsDetails !== false && excludedLongTerm.length > 0) {
              console.log(`   ${excludedLongTerm.length} jobs were excluded:\n`);
              excludedLongTerm.slice(0, 5).forEach((item, idx) => {
                const building = item.job.schedules?.[0]?.building?.title || item.job.schedules?.[0]?.building?.name || 'N/A';
                const ltTitle = item.job.positionTitle || item.job.position || item.job.positionType?.title || item.job.title || 'Untitled';
                console.log(`   ${idx + 1}. ${ltTitle} @ ${building}`);
                console.log(`      Reason: ${item.reason}\n`);
              });
              if (excludedLongTerm.length > 5) {
                console.log(`   ... and ${excludedLongTerm.length - 5} more excluded jobs\n`);
              }
            } else if (!config?.display?.showFilteredJobsDetails) {
              console.log('   (Filtered jobs details disabled in config)\n');
            }
          }

          console.log('✅ Phase 2b Verification: PASSED');
          console.log('   Response parsing works correctly with filtered results\n');
        } else {
          console.log('   (No long-term jobs found)');
          console.log('✅ Phase 2b Verification: PASSED');
          console.log('   Response parsing works correctly with empty response\n');

        }
      } else {
        console.log(`✗ Failed to fetch long-term jobs: ${longTermResult.message}\n`);
      }
    } else {
      console.log('='.repeat(50));
      console.log('⏭️  Skipping long-term jobs (includeLongTerm is false in config)\n');
    }

    // ============================================
    // PHASE 3: Smart Job Comparison & Matching
    // ============================================
    console.log('='.repeat(80));
    console.log('🎯 PHASE 3: Smart Job Comparison & Matching');
    console.log('='.repeat(80));
    console.log('Comparing scheduled jobs vs available jobs to find new opportunities...\n');

    const comparisonModule = new JobComparisonModule();

    // Use scheduled jobs for comparison
    const scheduledForComparison = scheduledResult.jobs;

    // Load filter preferences from config
    const { manager: phase3Prefs, preferences: phase3Preferences } = loadFilterPreferences(configManager);

    // Combine short-term + long-term available jobs, then filter by preferences
    const allAvailableJobs = [
      ...(availableResult.success ? availableResult.jobs : []),
      ...(longTermResult.success ? longTermResult.jobs : [])
    ];

    // Log all combined jobs BEFORE filtering
    console.log(`📋 Before Filter: ${allAvailableJobs.length} total available job(s):`);
    allAvailableJobs.forEach((job: any, idx: number) => {
      const title = job.positionTitle || job.position || job.positionType?.title || job.title || 'Untitled';
      const building = job.schedules?.[0]?.building?.title || job.schedules?.[0]?.building?.name || 'N/A';
      const date = job.startDate || job.date || 'N/A';
      console.log(`   ${idx + 1}. ${title} @ ${building} (${date})`);
    });

    const filteredAvailableResult = phase3Prefs.filterJobs(allAvailableJobs);
    const filteredAvailableJobs = filteredAvailableResult.passed;

    const buildingAlertJobs = allAvailableJobs.filter(job => {
      const jobId = String(job.id || job.jobId || '');
      const buildingId = job.schedules?.[0]?.building?.id;
      return jobId && buildingId !== undefined && !alertedBuildingJobIds.has(jobId);
    });

    if (telegram?.isEnabled() && buildingAlertJobs.length > 0) {
      await telegram.notifyBuildingJobs(buildingAlertJobs);
      buildingAlertJobs.forEach(job => alertedBuildingJobIds.add(String(job.id || job.jobId)));
    }

    // Log jobs AFTER filtering
    console.log(`\n✅ After Filter: ${filteredAvailableJobs.length} job(s) passed:`);
    filteredAvailableJobs.forEach((job: any, idx: number) => {
      const title = job.positionTitle || job.position || job.positionType?.title || job.title || 'Untitled';
      const building = job.schedules?.[0]?.building?.title || job.schedules?.[0]?.building?.name || 'N/A';
      const date = job.startDate || job.date || 'N/A';
      console.log(`   ${idx + 1}. ${title} @ ${building} (${date})`);
    });

    console.log(`\n📊 Phase 3 Input: ${allAvailableJobs.length} total available jobs → ${filteredAvailableJobs.length} after filtering\n`);

    // Now compare filtered available jobs with scheduled jobs
    const comparisonResult = comparisonModule.compare(
      scheduledForComparison,
      filteredAvailableJobs
    );

    // Display summary
    console.log(comparisonModule.getSummaryStats(comparisonResult));
    console.log('');

    // Display new opportunities
    if (comparisonResult.newOpportunities.length > 0) {
      console.log('\n✅ NEW OPPORTUNITIES (Match your preferences & no schedule conflicts):');
      comparisonResult.newOpportunities.forEach((job: any) => {
        console.log(JSON.stringify({
          event: 'matched_job_raw_payload',
          jobId: job.id || job.jobId || null,
          supplemental: job.supplemental,
          buildingId: job.schedules?.[0]?.building?.id || null,
          rawPayload: job
        }));
      });
      console.log('');

      const displayOpportunities = comparisonResult.newOpportunities.slice(
        0,
        10
      );
      const tableRows = displayOpportunities.map((job, idx) => {
        const scheduleType = job.schedules?.[0]?.scheduleType || 'N/A';
        const building = job.schedules?.[0]?.building?.title || job.schedules?.[0]?.building?.name || 'N/A';
        const startDate = job.startDate || job.date || 'N/A';
        const endDate = job.endDate || startDate || 'N/A';
        const time = job.schedules?.[0]?.startTime || job.time || '';
        return {
          '#': idx + 1,
          'Title': job.positionTitle || job.position || job.positionType?.title || 'N/A',
          'Building': building,
          'Start': startDate,
          'End': endDate,
          'Time': time
        };
      });

      // Print table header
      console.log(
        '   # │ Title        │ Building     │ Start Date   │ End Date     │ Time'
      );
      console.log(
        '   ──┼──────────────┼──────────────┼──────────────┼──────────────┼─────────'
      );

      // Print table rows
      tableRows.forEach((row) => {
        const num = String(row['#']).padEnd(2);
        const title = String(row['Title']).substring(0, 12).padEnd(12);
        const building = String(row['Building']).substring(0, 12).padEnd(12);
        const start = String(row['Start']).padEnd(12);
        const end = String(row['End']).padEnd(12);
        const time = row['Time'];
        console.log(
          `   ${num}│ ${title}│ ${building}│ ${start}│ ${end}│ ${time}`
        );
      });

      if (comparisonResult.newOpportunities.length > 10) {
        console.log(
          `\n   ... and ${comparisonResult.newOpportunities.length - 10} more opportunities\n`
        );
      }
    } else {
      console.log('\n❌ No new opportunities found (all available jobs either filtered out or conflict with schedule)\n');
    }

    // Display conflicts
    if (comparisonResult.conflicts.length > 0) {
      console.log('\n⚠️  POTENTIAL CONFLICTS (Available jobs overlapping with schedule):');
      console.log('');

      comparisonResult.conflicts.slice(0, 5).forEach((conflict, idx) => {
        const availablePos =
          conflict.available.position ||
          conflict.available.positionType?.title ||
          'N/A';
        const scheduledPos =
          conflict.scheduled.position ||
          conflict.scheduled.positionType?.title ||
          'N/A';
        console.log(
          `   ${idx + 1}. Available: ${availablePos} vs Scheduled: ${scheduledPos}`
        );
        console.log(`      ${conflict.reason}\n`);
      });

      if (comparisonResult.conflicts.length > 5) {
        console.log(
          `   ... and ${comparisonResult.conflicts.length - 5} more conflicts\n`
        );
      }
    }

    // Display recommendations
    if (comparisonResult.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      comparisonResult.recommendations.forEach((rec) => {
        console.log(`   ${rec}`);
      });
      console.log('');
    }

    // Display filter information
    if (Object.keys(phase3Preferences).length > 0) {
      console.log('\n📍 Active Filters Applied:');
      console.log(phase3Prefs.getSummary().split('\n').map((line: string) => '   ' + line).join('\n'));
      console.log('');
    }

    console.log('✨ Phase 3 Complete! Smart matching analysis finished\n');

    // Notify about new matching jobs via Telegram
    if (telegram?.isEnabled() && comparisonResult.newOpportunities.length > 0) {
      await telegram.notifyNewJobs(comparisonResult.newOpportunities);
    }

    // ===============================================================================
    // Phase 4: Auto-Apply to Matched Opportunities
    // ===============================================================================
    console.log('\n' + '='.repeat(80));
    console.log('🤖 PHASE 4: Auto-Apply to Matched Opportunities');
    console.log('='.repeat(80) + '\n');

    const autoApplyConfig = config?.autoApply;
    console.log('⚙️  Auto-Apply Configuration:');
    console.log(`   • Enabled: ${autoApplyConfig?.enabled ? '✅ Yes' : '❌ No'}`);
    console.log(`   • Auto-Apply: ${autoApplyConfig?.autoApplyOnMatches ? '✅ Auto' : '❌ Manual Review'}`);
    console.log(`   • Dry-Run Mode: ${autoApplyConfig?.dryRunMode ? '✅ Enabled (Preview)' : '❌ Disabled (Live)'}`);
    console.log('');

    if (!autoApplyConfig?.enabled) {
      console.log('⏭️  Auto-Apply is disabled. Skipping Phase 4.\n');
    } else {
      if (comparisonResult.newOpportunities.length === 0) {
        console.log('ℹ️  No new opportunities to apply to. Phase 4 complete.\n');
      } else {
        // Initialize Application Module
        const applicationModule = new JobApplicationModule(config?.baseUrl || 'http://localhost:8080', axiosInstance);

        // Apply to opportunities
        console.log(`🎯 Found ${comparisonResult.newOpportunities.length} opportunity(ies) matching your preferences...\n`);

        if (autoApplyConfig?.autoApplyOnMatches) {
          // Auto-apply mode
          const applicationResult = await applicationModule.applyToJobs(
            comparisonResult.newOpportunities,
            currentBearerToken,
            userId,
            autoApplyConfig.dryRunMode
          );

          console.log('\n' + applicationModule.getSummary(applicationResult));
          console.log(`   Note: ${autoApplyConfig.dryRunMode ? 'DRY-RUN' : 'LIVE'} mode\n`);

          // Send Telegram notification for applications
          if (telegram?.isEnabled()) {
            const appNotifications = applicationResult.results.map(r => ({
              jobTitle: r.jobTitle,
              building: 'N/A',
              date: r.timestamp?.toLocaleDateString() || 'N/A',
              status: r.status
            }));
            await telegram.notifyJobApplied(appNotifications, autoApplyConfig.dryRunMode);
          }
        } else {
          // Manual review mode - show what would be applied
          console.log('📋 Reviewing opportunities for manual approval:\n');
          comparisonResult.newOpportunities.slice(0, 5).forEach((job, idx) => {
            const title = job.positionTitle || job.position || job.positionType?.title || 'Unknown';
            const building = job.schedules?.[0]?.building?.title || job.schedules?.[0]?.building?.name || 'N/A';
            const date = job.startDate || job.date || 'N/A';
            console.log(`   ${idx + 1}. ${title} at ${building} (${date})`);
          });

          if (comparisonResult.newOpportunities.length > 5) {
            console.log(`   ... and ${comparisonResult.newOpportunities.length - 5} more`);
          }

          console.log('\n💡 To enable auto-apply, set "autoApplyOnMatches": true in config.json\n');
        }
      }
    }

    console.log('✨ Phase 4 Complete! Auto-apply analysis finished\n');

    console.log('='.repeat(80));
    console.log('🚀 All Phases Complete!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Fatal Error:', error);
    if (telegram?.isEnabled()) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await telegram.notifyError('Fatal Error', errMsg);
    }
    process.exit(1);
  } finally {
    // Close logger and save logs to file
    if (logger) {
      logger.close();
    }
  }
}

/**
 * Initialize and start the job scheduler
 */
function initializeScheduler() {
  const configManager = ConfigManager.getInstance();
  configManager.loadConfig();
  const config = configManager.getConfig();

  if (!config) {
    console.error('❌ Failed to load configuration');
    process.exit(1);
  }

  // Send one-time startup notification via Telegram
  const telegramConfig = config?.telegram || { enabled: false, botToken: '', chatId: '' };
  const startupTelegram = new TelegramNotifier(telegramConfig);
  if (startupTelegram.isEnabled()) {
    startupTelegram.notifyStartup().catch((err: Error) => {
      console.error('⚠️ Failed to send startup notification:', err.message);
    });
  }

  const schedulingConfig = config?.scheduling || { enabled: false };

  if (!schedulingConfig.enabled) {
    console.log('\n📋 Scheduling is disabled in config. Running once...\n');
    main();
  } else {
    const pollingInterval = schedulingConfig.pollingIntervalSeconds || config.pollingIntervalSeconds || 300;
    
    const scheduler = new JobScheduler(
      {
        pollingIntervalSeconds: pollingInterval,
        enabled: true
      },
      main
    );

    scheduler.start();
  }
}

// Run the scheduler (which executes main periodically or once)
initializeScheduler();
