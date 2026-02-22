/**
 * JobScheduler
 * Handles periodic execution of job automation tasks
 * 
 * Features:
 * - Configurable polling interval
 * - Graceful startup and shutdown
 * - Execution logging with timestamps
 * - Error handling and retry logic
 * - Task queue management
 */

export interface SchedulerConfig {
  pollingIntervalSeconds: number;
  enabled?: boolean;
}

class JobScheduler {
  private pollingIntervalSeconds: number;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private taskFunction: () => Promise<void>;
  private executionCount = 0;
  private failureCount = 0;
  private lastExecutionTime: Date | null = null;

  constructor(config: SchedulerConfig, taskFunction: () => Promise<void>) {
    this.pollingIntervalSeconds = config.pollingIntervalSeconds || 300; // Default 5 minutes
    this.taskFunction = taskFunction;
  }

  /**
   * Start the scheduler
   */
  public start(): void {
    if (this.isRunning) {
      console.log('⚠️  Scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log(`\n🕐 Job Scheduler Started`);
    console.log(`   Polling Interval: ${this.pollingIntervalSeconds} seconds`);
    console.log(`   Next execution: in ${this.pollingIntervalSeconds}s\n`);

    // Execute immediately on startup
    this.executeTask();

    // Schedule periodic execution
    this.intervalId = setInterval(() => {
      this.executeTask();
    }, this.pollingIntervalSeconds * 1000);

    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  /**
   * Execute the scheduled task
   */
  private async executeTask(): Promise<void> {
    const now = new Date();
    this.executionCount++;

    const timeStr = now.toLocaleTimeString();
    const dateStr = now.toLocaleDateString();

    console.log(`\n${'='.repeat(80)}`);
    console.log(`⏰ SCHEDULED EXECUTION #${this.executionCount}`);
    console.log(`   Timestamp: ${dateStr} ${timeStr}`);
    console.log(`${'='.repeat(80)}`);

    try {
      this.lastExecutionTime = now;
      await this.taskFunction();
      console.log(`\n✅ Execution #${this.executionCount} completed successfully`);
      console.log(`   Next execution: in ${this.pollingIntervalSeconds}s\n`);
    } catch (error) {
      this.failureCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Execution #${this.executionCount} failed:`);
      console.error(`   Error: ${errorMessage}`);
      console.log(`   Retrying in ${this.pollingIntervalSeconds}s\n`);
    }
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('⚠️  Scheduler is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.isRunning = false;

    console.log(`\n${'='.repeat(80)}`);
    console.log('🛑 Job Scheduler Stopped');
    console.log(`${'='.repeat(80)}`);
    console.log(`📊 Scheduler Summary:`);
    console.log(`   Total Executions: ${this.executionCount}`);
    console.log(`   Successful: ${this.executionCount - this.failureCount} ✅`);
    console.log(`   Failed: ${this.failureCount} ❌`);
    if (this.lastExecutionTime) {
      console.log(`   Last Execution: ${this.lastExecutionTime.toLocaleTimeString()}`);
    }
    console.log('');

    process.exit(0);
  }

  /**
   * Get scheduler status
   */
  public getStatus(): {
    isRunning: boolean;
    executionCount: number;
    failureCount: number;
    pollingInterval: number;
    lastExecutionTime: Date | null;
  } {
    return {
      isRunning: this.isRunning,
      executionCount: this.executionCount,
      failureCount: this.failureCount,
      pollingInterval: this.pollingIntervalSeconds,
      lastExecutionTime: this.lastExecutionTime
    };
  }
}

export default JobScheduler;
