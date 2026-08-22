// ── Comprehensive Logging System ───────────────────────────────────────
// Structured logging with levels, context, and performance tracking

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
  duration?: number;
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  constructor() {
    this.level = this.getLogLevelFromEnv();
    this.setupPerformanceLogging();
  }

  private getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'CRITICAL': return LogLevel.CRITICAL;
      default: return process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatLog(entry: LogEntry): string {
    const levelStr = LogLevel[entry.level];
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const durationStr = entry.duration ? ` [${entry.duration}ms]` : '';
    const errorStr = entry.error ? ` | Error: ${entry.error.message}` : '';
    return `[${entry.timestamp}] [${levelStr}]${durationStr} ${entry.message}${contextStr}${errorStr}`;
  }

  private addLog(level: LogLevel, message: string, context?: LogContext, error?: Error, duration?: number): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error,
      duration
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    const formatted = this.formatLog(entry);
    
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(formatted);
        break;
    }

    // Critical errors should trigger alerts
    if (level === LogLevel.CRITICAL) {
      this.triggerCriticalAlert(entry);
    }
  }

  private triggerCriticalAlert(entry: LogEntry): void {
    // Send to external monitoring service (Sentry, DataDog, etc.)
    if (process.env.SENTRY_DSN) {
      // Integrate with Sentry here
      console.error('[ALERT] Critical error detected, would trigger external alert:', entry);
    }
  }

  private setupPerformanceLogging(): void {
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        this.logPerformanceMetrics();
      }, 60_000); // Every minute
    }
  }

  private logPerformanceMetrics(): void {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    this.info('Performance Metrics', {
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      },
      uptime: `${Math.floor(uptime / 60)}m`,
      nodeVersion: process.version
    });
  }

  // Public API
  debug(message: string, context?: LogContext): void {
    this.addLog(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.addLog(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.addLog(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.addLog(LogLevel.ERROR, message, context, error);
  }

  critical(message: string, error?: Error, context?: LogContext): void {
    this.addLog(LogLevel.CRITICAL, message, context, error);
  }

  // Performance measurement
  time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    this.debug(`Starting: ${operation}`);
    
    return fn().then(result => {
      const duration = Date.now() - start;
      this.info(`Completed: ${operation}`, { duration });
      return result;
    }).catch(error => {
      const duration = Date.now() - start;
      this.error(`Failed: ${operation}`, error, { duration });
      throw error;
    });
  }

  syncTime<T>(operation: string, fn: () => T): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this.debug(`Completed: ${operation}`, { duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`Failed: ${operation}`, error as Error, { duration });
      throw error;
    }
  }

  // Log retrieval
  getLogs(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return this.logs.filter(log => log.level >= level);
    }
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  // Error rate monitoring
  getErrorRate(minutes: number = 5): number {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const recentLogs = this.logs.filter(log => 
      new Date(log.timestamp).getTime() > cutoff && 
      (log.level === LogLevel.ERROR || log.level === LogLevel.CRITICAL)
    );
    return recentLogs.length / minutes;
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience function for request logging
export function logRequest(method: string, path: string, statusCode: number, duration: number): void {
  const level = statusCode >= 500 ? LogLevel.ERROR : statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
  const message = `${method} ${path} ${statusCode}`;
  
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: { method, path, statusCode },
    duration
  };
  
  logger.addLog(level, message, { method, path, statusCode }, undefined, duration);
}

// Convenience function for error logging with stack traces
export function logError(error: Error, context?: LogContext): void {
  const level = error.message.includes('timeout') || error.message.includes('ETIMEDOUT') 
    ? LogLevel.WARN 
    : LogLevel.ERROR;
  
  logger.addLog(level, error.message, context, error);
}

// Export types
export type { LogEntry, LogContext };