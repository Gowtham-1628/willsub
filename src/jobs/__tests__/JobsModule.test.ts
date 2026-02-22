import axios from 'axios';
import JobsModule, { Job, JobsFetchResult, JobType } from '../JobsModule';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('JobsModule', () => {
  let jobsModule: JobsModule;
  let mockAxiosInstance: any;
  const testCookies = 'session_id=test_session_12345';
  const testToken = 'test_bearer_token';
  const testUserId = '12345';

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock axios instance
    mockAxiosInstance = {
      get: jest.fn()
    };

    jobsModule = new JobsModule(mockAxiosInstance, 5); // 5 second TTL for testing
  });

  describe('fetchScheduledJobs', () => {
    test('should fetch and cache scheduled jobs successfully', async () => {
      const mockJobs = [
        { id: '1', title: 'Math Class', date: '2024-01-15', time: '09:00', location: 'School A' },
        { id: '2', title: 'English Class', date: '2024-01-15', time: '10:00', location: 'School B' }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);

      expect(result.success).toBe(true);
      expect(result.jobs.length).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.jobs[0].title).toBe('Math Class');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/substitute-jobs/scheduled'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${testToken}`
          })
        })
      );
    });

    test('should parse jobs object with nested jobs array', async () => {
      const mockResponse = {
        jobs: [
          { id: '1', positionTitle: 'Math Class', startDate: '2024-01-15' },
          { id: '2', positionTitle: 'English Class', startDate: '2024-01-15' }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockResponse, status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);

      expect(result.success).toBe(true);
      expect(result.jobs.length).toBe(2);
      expect(result.jobs[0].id).toBe('1');
      expect(result.jobs[0].title).toBe('Math Class');
    });

    test('should use cache for subsequent calls within TTL', async () => {
      const mockJobs = [
        { id: '1', title: 'Math Class', date: '2024-01-15' }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      // First call - should fetch from API
      const result1 = await jobsModule.fetchScheduledJobs(testToken, testUserId);
      expect(result1.success).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await jobsModule.fetchScheduledJobs(testToken, testUserId);
      expect(result2.success).toBe(true);
      expect(result2.message).toContain('cache');
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1); // Still 1, not 2
      expect(result1.jobs).toEqual(result2.jobs);
    });

    test('should fetch from API again after cache TTL expires', async () => {
      const mockJobs = [{ id: '1', title: 'Math Class' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      // First call
      const result1 = await jobsModule.fetchScheduledJobs(testToken, testUserId);
      expect(result1.success).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Wait for cache to expire (5.1 seconds)
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Second call - should fetch from API again
      const result2 = await jobsModule.fetchScheduledJobs(testToken, testUserId);
      expect(result2.success).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    test('should handle API errors gracefully', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);

      expect(result.success).toBe(false);
      expect(result.jobs.length).toBe(0);
      expect(result.message).toContain('Network error');
    });

    test('should handle empty jobs response', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [], status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);

      expect(result.success).toBe(true);
      expect(result.jobs.length).toBe(0);
      expect(result.totalCount).toBe(0);
    });

    test('should handle null/undefined response', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: null, status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);

      expect(result.success).toBe(true);
      expect(result.jobs.length).toBe(0);
    });
  });

  describe('fetchAvailableJobs', () => {
    test('should fetch and cache available jobs successfully', async () => {
      const mockJobs = [
        { id: '10', title: 'Biology Class', date: '2024-01-15', time: '14:00', pay: 50 },
        { id: '11', title: 'History Class', date: '2024-01-15', time: '15:00', pay: 45 }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      const result = await jobsModule.fetchAvailableJobs(testToken, testUserId);

      expect(result.success).toBe(true);
      expect(result.jobs.length).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/substitute-jobs/available'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${testToken}`
          })
        })
      );
    });

    test('should cache available jobs separately from scheduled jobs', async () => {
      const scheduledJobs = [{ id: '1', title: 'Math Class' }];
      const availableJobs = [{ id: '10', title: 'Biology Class' }];

      // First fetch scheduled
      mockAxiosInstance.get.mockResolvedValueOnce({ data: scheduledJobs, status: 200 });
      const scheduledResult = await jobsModule.fetchScheduledJobs(testToken, testUserId);
      expect(scheduledResult.jobs.length).toBe(1);

      // Then fetch available
      mockAxiosInstance.get.mockResolvedValueOnce({ data: availableJobs, status: 200 });
      const availableResult = await jobsModule.fetchAvailableJobs(testToken, testUserId);
      expect(availableResult.jobs.length).toBe(1);

      // Verify both are cached
      expect(jobsModule.getCachedJobs('scheduled').length).toBe(1);
      expect(jobsModule.getCachedJobs('available').length).toBe(1);
    });

    test('should use cache for available jobs within TTL', async () => {
      const mockJobs = [{ id: '10', title: 'Biology Class' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      // First call
      const result1 = await jobsModule.fetchAvailableJobs(testToken, testUserId);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await jobsModule.fetchAvailableJobs(testToken, testUserId);
      expect(result2.message).toContain('cache');
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1); // Still 1
    });

    test('should handle API errors for available jobs', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

      const result = await jobsModule.fetchAvailableJobs(testToken, testUserId);

      expect(result.success).toBe(false);
      expect(result.jobs.length).toBe(0);
    });
  });

  describe('Cache management', () => {
    test('should clear cache for specific job type', async () => {
      const mockJobs = [{ id: '1', title: 'Math Class' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      // Fetch and cache
      await jobsModule.fetchScheduledJobs(testToken, testUserId);
      expect(jobsModule.getCachedJobs('scheduled').length).toBe(1);

      // Clear cache
      jobsModule.clearCache('scheduled');
      expect(jobsModule.getCachedJobs('scheduled').length).toBe(0);
      expect(jobsModule.hasCachedJobs('scheduled')).toBe(false);
    });

    test('should clear all caches when no type specified', async () => {
      const mockJobs = [{ id: '1', title: 'Math Class' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      // Fetch both types
      await jobsModule.fetchScheduledJobs(testToken, testUserId);
      await jobsModule.fetchAvailableJobs(testToken, testUserId);
      
      expect(jobsModule.getCachedJobs('scheduled').length).toBe(1);
      expect(jobsModule.getCachedJobs('available').length).toBe(1);

      // Clear all
      jobsModule.clearCache();
      
      expect(jobsModule.getCachedJobs('scheduled').length).toBe(0);
      expect(jobsModule.getCachedJobs('available').length).toBe(0);
    });

    test('should check cache validity correctly', async () => {
      const mockJobs = [{ id: '1', title: 'Math Class' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      expect(jobsModule.hasCachedJobs('scheduled')).toBe(false);

      await jobsModule.fetchScheduledJobs(testToken, testUserId);
      expect(jobsModule.hasCachedJobs('scheduled')).toBe(true);

      // Get cache age
      const age = jobsModule.getCacheAge('scheduled');
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(2);

      // After TTL expiry
      await new Promise(resolve => setTimeout(resolve, 5100));
      expect(jobsModule.hasCachedJobs('scheduled')).toBe(false);
      // Cache exists but is invalid, so getCacheAge returns the actual age (>= 5)
      const expiredAge = jobsModule.getCacheAge('scheduled');
      expect(expiredAge).toBeGreaterThanOrEqual(5);
    });

    test('should return -1 for cache age when no cache exists', () => {
      const age = jobsModule.getCacheAge('scheduled');
      expect(age).toBe(-1);
    });
  });

  describe('Job parsing', () => {
    test('should handle different field name conventions', async () => {
      const mockJobs = [
        {
          id: '1',
          positionTitle: 'Math Class',
          startDate: '2024-01-15',
          schedules: [{ startTime: '09:00', building: { title: 'Elementary School' } }],
          payRate: 55,
          hours: '6'
        }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);
      const job = result.jobs[0];

      expect(job.id).toBe('1');
      expect(job.title).toBe('Math Class');
      expect(job.date).toBe('2024-01-15');
      expect(job.time).toBe('09:00');
      expect(job.location).toBe('Elementary School');
    });

    test('should provide default values for missing fields', async () => {
      const mockJobs = [
        {
          id: '1',
          title: 'Math Class'
        }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);
      const job = result.jobs[0];

      expect(job.id).toBe('1');
      expect(job.title).toBe('Math Class');
      expect(job.status).toBe('scheduled');
      expect(job.location).toBe('');
    });

    test('should set status to available for available jobs', async () => {
      const mockJobs = [{ id: '1', title: 'Math Class' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      const result = await jobsModule.fetchAvailableJobs(testToken, testUserId);
      const job = result.jobs[0];

      expect(job.status).toBe('available');
    });

    test('should preserve extra fields from API response', async () => {
      const mockJobs = [
        {
          id: '1',
          title: 'Math Class',
          customField: 'custom_value',
          extraData: { nested: 'value' }
        }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);
      const job = result.jobs[0];

      expect(job.customField).toBe('custom_value');
      expect(job.extraData).toEqual({ nested: 'value' });
    });
  });

  describe('Result format', () => {
    test('should return consistent JobsFetchResult format', async () => {
      const mockJobs = [{ id: '1', title: 'Math Class' }];
      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('message');

      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.jobs)).toBe(true);
      expect(typeof result.totalCount).toBe('number');
      expect(typeof result.timestamp).toBe('number');
      expect(typeof result.message).toBe('string');
    });

    test('should set correct totalCount', async () => {
      const mockJobs = [
        { id: '1', title: 'Job 1' },
        { id: '2', title: 'Job 2' },
        { id: '3', title: 'Job 3' }
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockJobs, status: 200 });

      const result = await jobsModule.fetchScheduledJobs(testToken, testUserId);

      expect(result.totalCount).toBe(3);
      expect(result.totalCount).toBe(result.jobs.length);
    });
  });

  describe('Auth token handling', () => {
    test('should pass bearer token in request headers', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [], status: 200 });

      const customToken = 'custom_bearer_token';
      await jobsModule.fetchScheduledJobs(customToken, testUserId);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${customToken}`
          })
        })
      );
    });

    test('should work with different tokens', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [], status: 200 });

      const token1 = 'token_abc';
      const token2 = 'token_xyz';

      await jobsModule.fetchScheduledJobs(token1, testUserId);
      await jobsModule.fetchAvailableJobs(token2, testUserId);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Authorization': `Bearer ${token1}` })
        })
      );
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Authorization': `Bearer ${token2}` })
        })
      );
    });
  });
});
