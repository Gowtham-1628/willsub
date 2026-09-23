import JobPreferencesManager from '../JobPreferencesManager';

describe('JobPreferencesManager supplemental filtering', () => {
  test('excludes jobs with supplemental set to true', () => {
    const manager = new JobPreferencesManager({ includeSupplemental: false });

    const result = manager.filterJobs([
      { id: 'supplemental-job', supplemental: true },
      { id: 'regular-job', supplemental: false }
    ]);

    expect(result.passed.map(job => job.id)).toEqual(['regular-job']);
    expect(result.filtered[0]).toMatchObject({
      job: { id: 'supplemental-job' },
      reason: 'Supplemental jobs are excluded from your preferences'
    });
  });

  test('excludes jobs when the API serializes supplemental as a string', () => {
    const manager = new JobPreferencesManager({ includeSupplemental: false });

    const result = manager.filterJobs([
      { id: 'supplemental-job', supplemental: 'true' },
      { id: 'regular-job', supplemental: 'false' }
    ]);

    expect(result.passed.map(job => job.id)).toEqual(['regular-job']);
  });
});
