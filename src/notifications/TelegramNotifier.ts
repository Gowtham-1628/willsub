/**
 * TelegramNotifier
 * Sends real-time push notifications via Telegram Bot API
 * 
 * Setup instructions:
 * 1. Message @BotFather on Telegram → /newbot → get your BOT_TOKEN
 * 2. Message your new bot, then visit:
 *    https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
 *    to find your CHAT_ID
 * 3. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env
 * 
 * Features:
 * - Job application notifications (success/failure)
 * - New matching jobs alerts
 * - Authentication error alerts
 * - Daily summary reports
 * - Rate limiting to avoid Telegram API limits
 * - Silent mode for non-urgent notifications
 */

import axios from 'axios';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  silentHoursStart?: number;  // e.g., 22 (10 PM)
  silentHoursEnd?: number;    // e.g., 6 (6 AM)
  notifyOnApply?: boolean;
  notifyOnNewJobs?: boolean;
  notifyOnErrors?: boolean;
  notifyDailySummary?: boolean;
}

interface TelegramMessage {
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  disable_notification?: boolean;
}

class TelegramNotifier {
  private botToken: string;
  private chatId: string;
  private enabled: boolean;
  private silentHoursStart: number;
  private silentHoursEnd: number;
  private notifyOnApply: boolean;
  private notifyOnNewJobs: boolean;
  private notifyOnErrors: boolean;
  private notifyDailySummary: boolean;
  private lastMessageTime: number = 0;
  private minIntervalMs: number = 1000; // 1 second between messages (Telegram rate limit)
  private baseUrl: string;

  constructor(config: TelegramConfig) {
    this.enabled = config.enabled && !!config.botToken && !!config.chatId;
    this.botToken = config.botToken;
    this.chatId = config.chatId;
    this.silentHoursStart = config.silentHoursStart ?? 23;
    this.silentHoursEnd = config.silentHoursEnd ?? 6;
    this.notifyOnApply = config.notifyOnApply ?? true;
    this.notifyOnNewJobs = config.notifyOnNewJobs ?? true;
    this.notifyOnErrors = config.notifyOnErrors ?? true;
    this.notifyDailySummary = config.notifyDailySummary ?? true;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Check if current time is within silent hours
   */
  private isSilentHours(): boolean {
    const hour = parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' }));
    if (this.silentHoursStart > this.silentHoursEnd) {
      // e.g., 23 to 6 (wraps midnight)
      return hour >= this.silentHoursStart || hour < this.silentHoursEnd;
    }
    return hour >= this.silentHoursStart && hour < this.silentHoursEnd;
  }

  /**
   * Rate-limited message sender
   */
  private async sendMessage(message: TelegramMessage): Promise<boolean> {
    if (!this.enabled) return false;

    // Rate limiting
    const now = Date.now();
    const elapsed = now - this.lastMessageTime;
    if (elapsed < this.minIntervalMs) {
      await new Promise(resolve => setTimeout(resolve, this.minIntervalMs - elapsed));
    }

    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: this.chatId,
        text: message.text,
        parse_mode: message.parse_mode || 'HTML',
        disable_notification: message.disable_notification || this.isSilentHours()
      }, {
        timeout: 10000
      });

      this.lastMessageTime = Date.now();
      return response.status === 200;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ⚠️ Telegram notification failed: ${errMsg}`);
      return false;
    }
  }

  /**
   * Escape HTML special characters for Telegram HTML mode
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Notify when jobs are successfully applied to
   */
  public async notifyJobApplied(jobs: Array<{
    jobTitle: string;
    building: string;
    date: string;
    status: 'success' | 'failed' | 'skipped';
  }>, dryRun: boolean = false): Promise<void> {
    if (!this.notifyOnApply) return;

    const successful = jobs.filter(j => j.status === 'success');
    const failed = jobs.filter(j => j.status === 'failed');

    if (successful.length === 0 && failed.length === 0) return;

    let text = dryRun
      ? '🧪 <b>Dry Run - Job Applications Preview</b>\n\n'
      : '✅ <b>Jobs Applied Successfully!</b>\n\n';

    if (successful.length > 0) {
      text += `<b>${dryRun ? 'Would apply to' : 'Applied to'} ${successful.length} job(s):</b>\n`;
      successful.forEach((job, i) => {
        text += `${i + 1}. ${this.escapeHtml(job.jobTitle)}\n`;
        text += `   📍 ${this.escapeHtml(job.building)} | 📅 ${job.date}\n`;
      });
    }

    if (failed.length > 0) {
      text += `\n❌ <b>${failed.length} application(s) failed:</b>\n`;
      failed.forEach((job, i) => {
        text += `${i + 1}. ${this.escapeHtml(job.jobTitle)} at ${this.escapeHtml(job.building)}\n`;
      });
    }

    await this.sendMessage({ text });
  }

  /**
   * Notify when new matching jobs are found
   */
  public async notifyNewJobs(jobs: any[]): Promise<void> {
    if (!this.notifyOnNewJobs || jobs.length === 0) return;

    let text = `🎯 <b>${jobs.length} New Matching Job(s) Found!</b>\n\n`;

    const displayJobs = jobs.slice(0, 8);
    displayJobs.forEach((job, i) => {
      const title = job.positionTitle || job.position || job.positionType?.title || 'Untitled';
      const building = job.schedules?.[0]?.building?.title || job.schedules?.[0]?.building?.name || 'N/A';
      const date = job.startDate || job.date || 'N/A';
      const scheduleType = job.schedules?.[0]?.scheduleType || '';

      text += `<b>${i + 1}. ${this.escapeHtml(title)}</b>\n`;
      text += `   📍 ${this.escapeHtml(building)}`;
      if (scheduleType) text += ` | 🕐 ${scheduleType}`;
      text += `\n   📅 ${date}\n\n`;
    });

    if (jobs.length > 8) {
      text += `<i>...and ${jobs.length - 8} more</i>\n`;
    }

    await this.sendMessage({ text });
  }

  /**
   * Notify on authentication errors
   */
  public async notifyAuthError(errorMessage: string): Promise<void> {
    if (!this.notifyOnErrors) return;

    const text = `🔴 <b>Authentication Error</b>\n\n`
      + `The automation failed to log in:\n`
      + `<code>${this.escapeHtml(errorMessage)}</code>\n\n`
      + `⚠️ Job monitoring is paused until this is resolved.`;

    await this.sendMessage({ text });
  }

  /**
   * Notify when auth token is refreshed (new JWT obtained)
   */
  public async notifyAuthRefresh(): Promise<void> {
    const text = `🔑 <b>Auth Token Refreshed</b>\n\n`
      + `A new JWT was obtained via re-authentication.\n`
      + `⏰ ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}`;

    await this.sendMessage({ text });
  }

  /**
   * Notify on general errors
   */
  public async notifyError(context: string, errorMessage: string): Promise<void> {
    if (!this.notifyOnErrors) return;

    const text = `⚠️ <b>Error: ${this.escapeHtml(context)}</b>\n\n`
      + `<code>${this.escapeHtml(errorMessage)}</code>`;

    await this.sendMessage({ text });
  }

  /**
   * Send daily summary
   */
  public async notifyDailySummaryReport(summary: {
    scheduledJobs: number;
    availableJobs: number;
    matchingJobs: number;
    appliedJobs: number;
    failedApplications: number;
    executionCount: number;
  }): Promise<void> {
    if (!this.notifyDailySummary) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

    const text = `📊 <b>Daily Summary - ${dateStr}</b>\n\n`
      + `📅 Scheduled Jobs: <b>${summary.scheduledJobs}</b>\n`
      + `🆕 Available Jobs: <b>${summary.availableJobs}</b>\n`
      + `🎯 Matching Jobs: <b>${summary.matchingJobs}</b>\n`
      + `✅ Applied: <b>${summary.appliedJobs}</b>\n`
      + `❌ Failed: <b>${summary.failedApplications}</b>\n`
      + `🔄 Poll Cycles: <b>${summary.executionCount}</b>\n\n`
      + `🤖 WillSub Automation running normally.`;

    await this.sendMessage({ text, disable_notification: true });
  }

  /**
   * Send a startup notification
   */
  public async notifyStartup(): Promise<void> {
    const text = `🟢 <b>WillSub Automation Started</b>\n\n`
      + `📍 Job monitoring is now active.\n`
      + `🕐 ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}`;

    await this.sendMessage({ text, disable_notification: true });
  }

  /**
   * Send a shutdown notification
   */
  public async notifyShutdown(): Promise<void> {
    const text = `🔴 <b>WillSub Automation Stopped</b>\n\n`
      + `🕐 ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}`;

    await this.sendMessage({ text, disable_notification: true });
  }

  /**
   * Check if notifications are enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
}

export default TelegramNotifier;
