import axios from 'axios';
import TelegramNotifier from '../TelegramNotifier';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TelegramNotifier auth refresh notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
  });

  test('does not send auth refresh notifications when disabled', async () => {
    const notifier = new TelegramNotifier({
      enabled: true,
      botToken: 'test-token',
      chatId: 'test-chat',
      notifyOnAuthRefresh: false
    });

    await notifier.notifyAuthRefresh();

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  test('sends auth refresh notifications when enabled', async () => {
    const notifier = new TelegramNotifier({
      enabled: true,
      botToken: 'test-token',
      chatId: 'test-chat',
      notifyOnAuthRefresh: true
    });

    await notifier.notifyAuthRefresh();

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        chat_id: 'test-chat',
        text: expect.stringContaining('Auth Token Refreshed'),
        parse_mode: 'HTML'
      }),
      { timeout: 10000 }
    );
  });
});

describe('TelegramNotifier building alerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
  });

  test('alerts only for configured buildings', async () => {
    const notifier = new TelegramNotifier({
      enabled: true,
      botToken: 'test-token',
      chatId: 'test-chat',
      notifyOnBuildingJobs: true,
      buildingJobAlertBuildingIds: [1709]
    });

    await notifier.notifyBuildingJobs([
      {
        id: 'watched-job',
        positionTitle: 'Teacher',
        schedules: [{ building: { id: 1709, title: 'Spears Elementary' } }]
      },
      {
        id: 'unwatched-job',
        positionTitle: 'Teacher',
        schedules: [{ building: { id: 1674, title: 'Hunt Middle School' } }]
      }
    ]);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('Spears Elementary')
      }),
      { timeout: 10000 }
    );
    expect(mockedAxios.post.mock.calls[0][1]).not.toEqual(
      expect.objectContaining({ text: expect.stringContaining('Hunt Middle School') })
    );
  });

  test('does not alert when building alerts are disabled', async () => {
    const notifier = new TelegramNotifier({
      enabled: true,
      botToken: 'test-token',
      chatId: 'test-chat',
      notifyOnBuildingJobs: false,
      buildingJobAlertBuildingIds: [1709]
    });

    await notifier.notifyBuildingJobs([
      { id: 'watched-job', schedules: [{ building: { id: 1709 } }] }
    ]);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
