/**
 * FileLogger Module
 * Captures console output and logs to file
 * 
 * Features:
 * - Intercepts console.log, console.error, console.warn
 * - Writes to timestamped log files
 * - Keeps original console output
 * - Automatic log rotation (max files)
 * - Configuration-driven
 */

import * as fs from 'fs';
import * as path from 'path';

interface LoggerConfig {
  enabled: boolean;
  logToFile: boolean;
  logDirectory: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  includeTimestamp: boolean;
  maxLogFiles: number;
}

class FileLogger {
  private config: LoggerConfig;
  private logFilePath: string = '';
  private logStream: fs.WriteStream | null = null;
  private originalLog: typeof console.log;
  private originalError: typeof console.error;
  private originalWarn: typeof console.warn;
  private logBuffer: string[] = [];
  private isInitialized = false;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalWarn = console.warn;
  }

  /**
   * Initialize logger
   */
  public initialize(): void {
    if (!this.config.enabled || !this.config.logToFile) {
      return;
    }

    try {
      // Create log directory if it doesn't exist
      if (!fs.existsSync(this.config.logDirectory)) {
        fs.mkdirSync(this.config.logDirectory, { recursive: true });
      }

      // Generate log file path with timestamp
      const timestamp = this.getTimestamp();
      const logFileName = `job-automation-${timestamp}.log`;
      this.logFilePath = path.join(this.config.logDirectory, logFileName);

      // Open write stream
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

      // Write initialization header
      this.writeToFile(`\n${'='.repeat(80)}`);
      this.writeToFile(`🚀 Job Automation System - Execution started`);
      this.writeToFile(`📅 Timestamp: ${new Date().toLocaleString()}`);
      this.writeToFile(`${'='.repeat(80)}\n`);

      // Override console methods
      this.overrideConsole();

      this.isInitialized = true;
      this.originalLog(`📝 Logs being captured to: ${this.logFilePath}`);
    } catch (error) {
      this.originalError('❌ Failed to initialize logger:', error);
    }
  }

  /**
   * Override console methods to capture output
   */
  private overrideConsole(): void {
    console.log = (...args: any[]) => {
      const message = this.formatMessage(args);
      this.originalLog(...args);
      this.writeToFile(message);
    };

    console.error = (...args: any[]) => {
      const message = this.formatMessage(args, 'ERROR');
      this.originalError(...args);
      this.writeToFile(message);
    };

    console.warn = (...args: any[]) => {
      const message = this.formatMessage(args, 'WARN');
      this.originalWarn(...args);
      this.writeToFile(message);
    };
  }

  /**
   * Format message for logging
   */
  private formatMessage(args: any[], level: string = ''): string {
    const message = args.map((arg) => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg, null, 2);
      }
      return String(arg);
    }).join(' ');

    if (this.config.includeTimestamp) {
      const time = new Date().toLocaleTimeString();
      return `[${time}]${level ? ` [${level}]` : ''} ${message}`;
    }

    return `${level ? `[${level}]` : ''} ${message}`;
  }

  /**
   * Write to file
   */
  private writeToFile(message: string): void {
    if (!this.logStream) {
      this.logBuffer.push(message);
      return;
    }

    try {
      this.logStream.write(message + '\n');
    } catch (error) {
      this.originalError('❌ Error writing to log file:', error);
    }
  }

  /**
   * Get current timestamp for filename
   */
  private getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

  /**
   * Flush and close logger
   */
  public close(): void {
    if (this.logStream) {
      this.writeToFile(`\n${'='.repeat(80)}`);
      this.writeToFile(`✨ Execution completed`);
      this.writeToFile(`📝 Logs saved to: ${this.logFilePath}`);
      this.writeToFile(`${'='.repeat(80)}\n`);

      this.logStream.end();
    }

    // Restore original console
    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;

    // Cleanup old log files
    this.cleanupOldLogs();
  }

  /**
   * Cleanup old log files based on maxLogFiles
   */
  private cleanupOldLogs(): void {
    try {
      if (!fs.existsSync(this.config.logDirectory)) {
        return;
      }

      const files = fs.readdirSync(this.config.logDirectory)
        .filter(f => f.startsWith('job-automation-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logDirectory, f),
          time: fs.statSync(path.join(this.config.logDirectory, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Remove old files exceeding maxLogFiles, but preserve important ones
      if (files.length > this.config.maxLogFiles) {
        for (let i = this.config.maxLogFiles; i < files.length; i++) {
          if (this.isImportantLog(files[i].path)) {
            continue; // Preserve logs with opportunities or auto-applied jobs
          }
          fs.unlinkSync(files[i].path);
        }
      }
    } catch (error) {
      this.originalError('❌ Error cleaning up old logs:', error);
    }
  }

  /**
   * Check if a log file contains important events that should be preserved:
   * - More than zero new opportunities found
   * - A job was successfully auto-applied/accepted
   */
  private isImportantLog(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check if any job was successfully accepted/applied
      if (content.includes('Successfully accepted')) {
        return true;
      }

      // Check for new opportunities (more than 0)
      const opportunityMatch = content.match(/New Opportunities:\s*(\d+)/);
      if (opportunityMatch && parseInt(opportunityMatch[1], 10) > 0) {
        return true;
      }

      return false;
    } catch {
      return false; // If we can't read it, allow deletion
    }
  }

  /**
   * Get log directory
   */
  public getLogDirectory(): string {
    return this.config.logDirectory;
  }

  /**
   * Get current log file path
   */
  public getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * Check if initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}

export default FileLogger;
