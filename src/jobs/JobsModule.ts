import axios, { AxiosInstance } from 'axios';

/**
 * JobsModule - Fetch and manage job data
 * 
 * Features:
 * - Fetch jobs from API endpoints
 * - Cache jobs in memory
 * - Parse and structure job data
 * - Support for current/scheduled jobs and available jobs
 * 
 * Types of jobs:
 * - Scheduled/Current: Jobs user already has scheduled
 * - Available: New job opportunities available today
 */

export interface Job {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  pay?: number;
  duration?: string;
  status?: string;
  [key: string]: any; // Allow other fields from API
}

export interface JobsFetchResult {
  success: boolean;
  jobs: Job[];
  totalCount: number;
  timestamp: number;
  message?: string;
  statusCode?: number;
}

export type JobType = 'scheduled' | 'available';

class JobsModule {
  private axiosInstance: AxiosInstance;
  private baseUrl: string;
  private cachedJobs: Map<JobType, Job[]> = new Map();
  private cacheTimestamp: Map<JobType, number> = new Map();
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes default

  constructor(axiosInstance: AxiosInstance, cacheTTLSeconds?: number, baseUrl: string = 'https://willsubplus.com') {
    this.axiosInstance = axiosInstance;
    this.baseUrl = baseUrl;
    if (cacheTTLSeconds) {
      this.cacheTTL = cacheTTLSeconds * 1000;
    }
  }

  /**
   * Check if cache is valid (not expired)
   */
  private isCacheValid(jobType: JobType): boolean {
    const timestamp = this.cacheTimestamp.get(jobType);
    if (!timestamp) return false;

    const age = Date.now() - timestamp;
    return age < this.cacheTTL;
  }

  /**
   * Load jobs from cache if valid
   */
  private getFromCache(jobType: JobType): Job[] | null {
    if (this.isCacheValid(jobType)) {
      const jobs = this.cachedJobs.get(jobType);
      if (jobs) {
        console.log(`✓ Loaded ${jobs.length} ${jobType} jobs from cache`);
        return jobs;
      }
    }
    return null;
  }

  /**
   * Save jobs to cache
   */
  private saveToCache(jobType: JobType, jobs: Job[]): void {
    this.cachedJobs.set(jobType, jobs);
    this.cacheTimestamp.set(jobType, Date.now());
    console.log(`💾 Cached ${jobs.length} ${jobType} jobs`);
  }

  /**
   * Fetch scheduled/current jobs
   * - These are jobs the user already has scheduled
   * - Used as baseline to avoid duplicate applications
   */
  public async fetchScheduledJobs(bearerToken: string, userId: string, page: number = 0, size: number = 1000): Promise<JobsFetchResult> {
    try {
      // Check cache first
      const cached = this.getFromCache('scheduled');
      if (cached) {
        return {
          success: true,
          jobs: cached,
          totalCount: cached.length,
          timestamp: Date.now(),
          message: 'Loaded from cache'
        };
      }

      console.log('📅 Fetching scheduled jobs from API...');
      
      // Debug logging
      console.log('🔍 Request Details:');
      console.log(`   URL: ${this.baseUrl}/api/substitute-jobs/scheduled`);
      console.log(`   Method: GET`);
      console.log(`   Query: page=${page}&size=${size}&userId=${userId}`);
      console.log(`   Bearer Token: ${bearerToken ? `Yes (${bearerToken.length} chars)` : 'No'}`);

      const response = await this.axiosInstance.get(
        `${this.baseUrl}/api/substitute-jobs/scheduled`,
        {
          params: {
            page,
            size,
            userId
          },
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          validateStatus: () => true // Don't throw on any status code
        }
      );

      console.log(`📨 Response Status: ${response.status}`);
      console.log(`📨 Response Data (first 300 chars):`, JSON.stringify(response.data).substring(0, 300));

      // Check for error status
      if (response.status !== 200) {
        console.warn(`⚠️  Unexpected status code: ${response.status}`);
        return {
          success: false,
          jobs: [],
          totalCount: 0,
          timestamp: Date.now(),
          message: `API returned ${response.status}`,
          statusCode: response.status
        };
      }

      // Parse response - adapt based on actual API structure
      const jobs = this.parseScheduledJobs(response.data);
      
      console.log(`✓ Retrieved ${jobs.length} scheduled jobs`);

      // Cache the jobs
      this.saveToCache('scheduled', jobs);

      return {
        success: true,
        jobs,
        totalCount: jobs.length,
        timestamp: Date.now(),
        message: `Fetched ${jobs.length} scheduled jobs`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('✗ Failed to fetch scheduled jobs:', errorMessage);
      if (error instanceof Error && error.stack) {
        console.error('   Stack trace:', error.stack.substring(0, 300));
      }
      return {
        success: false,
        jobs: [],
        totalCount: 0,
        timestamp: Date.now(),
        message: errorMessage
      };
    }
  }

  /**
   * Fetch available jobs
   * - These are new job opportunities available today
   * - User will compare these against scheduled jobs
   */
  public async fetchAvailableJobs(bearerToken: string, userId: string, page: number = 0, size: number = 1000): Promise<JobsFetchResult> {
    try {
      // Check cache first
      const cached = this.getFromCache('available');
      if (cached) {
        return {
          success: true,
          jobs: cached,
          totalCount: cached.length,
          timestamp: Date.now(),
          message: 'Loaded from cache'
        };
      }

      console.log('🔍 Fetching available jobs from API...');
      
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];

      // Debug logging
      console.log('🔍 Request Details:');
      console.log(`   URL: ${this.baseUrl}/api/substitute-jobs/available`);
      console.log(`   Method: GET`);
      console.log(`   Query: page=${page}&size=${size}&userId=${userId}&longTerm=false&startDate=${today}`);
      console.log(`   Bearer Token: ${bearerToken ? `Yes (${bearerToken.length} chars)` : 'No'}`);

      const response = await this.axiosInstance.get(
        `${this.baseUrl}/api/substitute-jobs/available`,
        {
          params: {
            page,
            size,
            userId,
            longTerm: false,
            startDate: today
          },
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          validateStatus: () => true // Don't throw on any status code
        }
      );

      console.log(`📨 Response Status: ${response.status}`);
      console.log(`📨 Available Jobs Response (first 500 chars):`, JSON.stringify(response.data).substring(0, 500));

      // Log first job's full keys for debugging apply endpoint
      if (response.data?.content?.[0]) {
        const firstJob = response.data.content[0];
        console.log(`📨 First available job keys:`, Object.keys(firstJob).join(', '));
        console.log(`📨 First job id: ${firstJob.id}, substitutionJobId: ${firstJob.substitutionJobId}, substituteJobId: ${firstJob.substituteJobId}`);
      }

      // Check for error status
      if (response.status !== 200) {
        console.warn(`⚠️  Unexpected status code: ${response.status}`);
        return {
          success: false,
          jobs: [],
          totalCount: 0,
          timestamp: Date.now(),
          message: `API returned ${response.status}`,
          statusCode: response.status
        };
      }

      // Parse response - adapt based on actual API structure
      const jobs = this.parseAvailableJobs(response.data);
      
      console.log(`✓ Retrieved ${jobs.length} available jobs`);

      // Cache the jobs
      this.saveToCache('available', jobs);

      return {
        success: true,
        jobs,
        totalCount: jobs.length,
        timestamp: Date.now(),
        message: `Fetched ${jobs.length} available jobs`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('✗ Failed to fetch available jobs:', errorMessage);
      if (error instanceof Error && error.stack) {
        console.error('   Stack trace:', error.stack.substring(0, 300));
      }
      return {
        success: false,
        jobs: [],
        totalCount: 0,
        timestamp: Date.now(),
        message: errorMessage
      };
    }
  }

  /**
   * Parse scheduled jobs from API response
   * Handles paginated API responses with content array
   */
  private parseScheduledJobs(data: any): Job[] {
    if (!data) return [];

    // Handle paginated response with content array
    let jobList = [];
    if (data.content && Array.isArray(data.content)) {
      jobList = data.content;
    } else if (Array.isArray(data)) {
      jobList = data;
    } else if (data.jobs && Array.isArray(data.jobs)) {
      jobList = data.jobs;
    } else {
      return [];
    }

    return jobList.map((job: any) => {
      // Extract job info
      const id = job.id || job.jobId || '';
      const title = job.positionTitle || job.position || job.positionType?.title || job.title || 'Untitled';
      const startDate = job.startDate || '';
      const endDate = job.endDate || '';

      // Extract first schedule info (if multiple schedules exist)
      let time = '';
      let location = '';
      if (job.schedules && job.schedules.length > 0) {
        const schedule = job.schedules[0];
        time = schedule.startTime ? `${schedule.startTime}` : '';
        location = schedule.building?.title || '';
      }

      return {
        id,
        title,
        date: startDate,
        time,
        location,
        status: job.status || 'scheduled',
        // Preserve all additional fields
        ...job
      };
    });
  }

  /**
   * Parse available jobs from API response
   * Handles paginated API responses with content array
   */
  private parseAvailableJobs(data: any): Job[] {
    if (!data) return [];

    // Handle paginated response with content array
    let jobList = [];
    if (data.content && Array.isArray(data.content)) {
      jobList = data.content;
    } else if (Array.isArray(data)) {
      jobList = data;
    } else if (data.jobs && Array.isArray(data.jobs)) {
      jobList = data.jobs;
    } else {
      return [];
    }

    return jobList.map((job: any) => {
      // Extract job info
      const id = job.id || job.jobId || '';
      const title = job.positionTitle || job.position || job.positionType?.title || job.title || 'Untitled';
      const startDate = job.startDate || new Date().toISOString().split('T')[0];
      const endDate = job.endDate || startDate;

      // Extract first schedule info (if multiple schedules exist)
      let time = '';
      let location = '';
      if (job.schedules && job.schedules.length > 0) {
        const schedule = job.schedules[0];
        time = schedule.startTime ? `${schedule.startTime}` : '';
        location = schedule.building?.title || '';
      }

      return {
        id,
        title,
        date: startDate,
        time,
        location,
        status: job.status || 'available',
        // Preserve all additional fields
        ...job
      };
    });
  }

  /**
   * Get cached jobs by type
   */
  public getCachedJobs(jobType: JobType): Job[] {
    return this.cachedJobs.get(jobType) || [];
  }

  /**
   * Clear cache for specific job type
   */
  public clearCache(jobType?: JobType): void {
    if (jobType) {
      this.cachedJobs.delete(jobType);
      this.cacheTimestamp.delete(jobType);
      console.log(`🗑️ Cleared ${jobType} jobs cache`);
    } else {
      this.cachedJobs.clear();
      this.cacheTimestamp.clear();
      console.log('🗑️ Cleared all jobs cache');
    }
  }

  /**
   * Check if cache is available for specific job type
   */
  public hasCachedJobs(jobType: JobType): boolean {
    return this.isCacheValid(jobType);
  }

  /**
   * Get cache age in seconds
   */
  public getCacheAge(jobType: JobType): number {
    const timestamp = this.cacheTimestamp.get(jobType);
    if (!timestamp) return -1;
    return Math.round((Date.now() - timestamp) / 1000);
  }

  /**
   * Fetch available long-term jobs
   * - For testing/verification purposes
   * - Shows that Phase 2b parsing works with actual job data
   */
  public async fetchAvailableLongTermJobs(bearerToken: string, userId: string, page: number = 0, size: number = 1000): Promise<JobsFetchResult> {
    try {
      const today = new Date().toISOString().split('T')[0];

      console.log('📋 Fetching available long-term jobs (for verification)...');
      console.log(`   URL: ${this.baseUrl}/api/substitute-jobs/available?longTerm=true&startDate=${today}`);

      const response = await this.axiosInstance.get(
        `${this.baseUrl}/api/substitute-jobs/available`,
        {
          params: {
            page,
            size,
            userId,
            longTerm: true,
            startDate: today
          },
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          validateStatus: () => true
        }
      );

      console.log(`   Response Status: ${response.status}`);

      // Log first long-term job's structure for debugging
      if (response.data?.content?.[0]) {
        const firstJob = response.data.content[0];
        console.log(`   📨 First long-term job keys:`, Object.keys(firstJob).join(', '));
        console.log(`   📨 First long-term job full JSON (1000 chars):`, JSON.stringify(firstJob).substring(0, 1000));
      }

      if (response.status !== 200) {
        console.warn(`   ⚠️  Unexpected status code: ${response.status}`);
        return {
          success: false,
          jobs: [],
          totalCount: 0,
          timestamp: Date.now(),
          message: `API returned ${response.status}`,
          statusCode: response.status
        };
      }

      const jobs = this.parseAvailableJobs(response.data);
      console.log(`   ✓ Retrieved ${jobs.length} long-term available jobs`);

      return {
        success: true,
        jobs,
        totalCount: jobs.length,
        timestamp: Date.now(),
        message: `Fetched ${jobs.length} long-term available jobs`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('✗ Failed to fetch long-term jobs:', errorMessage);
      return {
        success: false,
        jobs: [],
        totalCount: 0,
        timestamp: Date.now(),
        message: errorMessage
      };
    }
  }
}

export default JobsModule;
