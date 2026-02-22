/**
 * JobApplicationModule
 * Handles automatic application to matched job opportunities
 * 
 * Features:
 * - Apply to single or multiple jobs
 * - Dry-run mode (preview without applying)
 * - Application tracking
 * - Success/failure reporting
 */

import axios, { AxiosInstance } from 'axios';

export interface ApplicationResult {
  jobId: number;
  jobTitle: string;
  status: 'success' | 'failed' | 'skipped';
  message?: string;
  timestamp?: Date;
}

export interface BatchApplicationResult {
  totalRequested: number;
  successful: number;
  failed: number;
  skipped: number;
  results: ApplicationResult[];
  dryRunMode: boolean;
  summary: string;
}

class JobApplicationModule {
  private baseUrl: string;
  private axiosInstance: AxiosInstance;

  constructor(baseUrl: string, axiosInstance: AxiosInstance) {
    this.baseUrl = baseUrl;
    this.axiosInstance = axiosInstance;
  }

  /**
   * Apply to a single job
   */
  public async applyToJob(
    job: any,
    bearerToken: string,
    userId: string,
    dryRunMode: boolean = true
  ): Promise<ApplicationResult> {
    const jobId = job.id;
    const jobTitle = job.position || job.positionType?.title || 'Unknown';
    const building = job.schedules?.[0]?.building?.title || job.schedules?.[0]?.building?.name || 'N/A';

    if (dryRunMode) {
      return {
        jobId,
        jobTitle,
        status: 'skipped',
        message: `[DRY RUN] Would accept ${jobTitle} at ${building}`
      };
    }

    try {
      console.log(`   📝 Accepting ${jobTitle} at ${building}...`);
      console.log(`   🔍 Job ID: ${jobId}, User ID: ${userId}`);

      const response = await this.axiosInstance.post(
        `${this.baseUrl}/api/substitute-jobs/${jobId}/accept`,
        { userId: Number(userId) },
        {
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          validateStatus: () => true
        }
      );

      console.log(`   📨 Accept Response: ${response.status}${response.data ? ' - ' + JSON.stringify(response.data).substring(0, 300) : ''}`);

      if (response.status === 204 || response.status === 200 || response.status === 201) {
        return {
          jobId,
          jobTitle,
          status: 'success',
          message: `Successfully accepted ${jobTitle} at ${building}`,
          timestamp: new Date()
        };
      } else if (response.status === 400) {
        const errorMsg = response.data?.errors?.[0]?.defaultMessage || response.data?.message || 'Bad request';
        return {
          jobId,
          jobTitle,
          status: 'failed',
          message: `Cannot accept job: ${errorMsg}`
        };
      } else if (response.status === 409) {
        return {
          jobId,
          jobTitle,
          status: 'failed',
          message: `Already accepted or job no longer available (${response.status})`
        };
      } else {
        return {
          jobId,
          jobTitle,
          status: 'failed',
          message: `API error: ${response.status}`
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        jobId,
        jobTitle,
        status: 'failed',
        message: `Error: ${errorMessage}`
      };
    }
  }

  /**
   * Apply to multiple jobs in batch
   */
  public async applyToJobs(
    jobs: any[],
    bearerToken: string,
    userId: string,
    dryRunMode: boolean = true
  ): Promise<BatchApplicationResult> {
    const results: ApplicationResult[] = [];
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    console.log(`\n📋 Processing ${jobs.length} job application(s)...`);
    if (dryRunMode) {
      console.log('   (DRY RUN MODE - No actual applications will be submitted)\n');
    } else {
      console.log('   (LIVE MODE - Applications will be submitted)\n');
    }

    for (const job of jobs) {
      const result = await this.applyToJob(job, bearerToken, userId, dryRunMode);
      results.push(result);

      if (result.status === 'success') {
        successful++;
        console.log(`   ✅ ${result.message}`);
      } else if (result.status === 'failed') {
        failed++;
        console.log(`   ❌ ${result.message}`);
      } else {
        skipped++;
        console.log(`   ⏭️  ${result.message}`);
      }
    }

    const summary =
      dryRunMode
        ? `[DRY RUN] Would apply to ${successful} job(s). ${failed} failed, ${skipped} skipped.`
        : `Applied to ${successful} job(s). ${failed} failed, ${skipped} skipped.`;

    return {
      totalRequested: jobs.length,
      successful,
      failed,
      skipped,
      results,
      dryRunMode,
      summary
    };
  }

  /**
   * Get application summary
   */
  public getSummary(result: BatchApplicationResult): string {
    const parts = [
      `📊 Application Summary:`,
      `   Total Requested: ${result.totalRequested}`,
      `   Successful: ${result.successful} ✅`,
      `   Failed: ${result.failed} ❌`,
      `   Skipped: ${result.skipped} ⏭️`,
      `   Mode: ${result.dryRunMode ? 'DRY RUN (Preview)' : 'LIVE (Applied)'}`
    ];

    return parts.join('\n');
  }
}

export default JobApplicationModule;
