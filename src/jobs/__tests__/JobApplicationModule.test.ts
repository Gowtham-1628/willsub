import JobApplicationModule from '../JobApplicationModule';

describe('JobApplicationModule supplemental protection', () => {
  test('does not apply a supplemental job', async () => {
    const axiosInstance = { post: jest.fn() } as any;
    const module = new JobApplicationModule('https://example.test', axiosInstance);

    const result = await module.applyToJob(
      {
        id: 4291977,
        position: 'Kindergarten',
        supplemental: true,
        schedules: [{ building: { title: 'Spears Elementary' } }]
      },
      'token',
      'user-id',
      false
    );

    expect(result.status).toBe('skipped');
    expect(result.message).toContain('supplemental');
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });

  test('does not apply a string-encoded supplemental job', async () => {
    const axiosInstance = { post: jest.fn() } as any;
    const module = new JobApplicationModule('https://example.test', axiosInstance);

    const result = await module.applyToJob(
      { id: 4291977, supplemental: 'true' },
      'token',
      'user-id',
      false
    );

    expect(result.status).toBe('skipped');
    expect(axiosInstance.post).not.toHaveBeenCalled();
  });
});