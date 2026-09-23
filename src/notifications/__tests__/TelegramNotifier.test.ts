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
