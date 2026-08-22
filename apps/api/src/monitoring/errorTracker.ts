// ── Error Tracking and Alerting System ─────────────────────────────────
// Centralized error handling with categorization, rate limiting, and alerting

import { logger, LogLevel } from './logging.js';

export enum ErrorCategory {
  NETWORK = 'network',
  DATABASE = 'database',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  EXTERNAL_API = 'external_api',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorRecord {
  id: string;
  timestamp: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  userId?: string;
  requestId?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export interface AlertRule {
  id: string;
  name: string;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  threshold: number; // errors per minute
  windowMs: number;
  enabled: boolean;
}

class ErrorTracker {
  private errors: Map<string, ErrorRecord> = new Map();
  private alerts: AlertRule[] = [];
  private recentErrors: Array<{ errorId: string; timestamp: number }> = [];
  private alertHistory: Array<{ alertId: string; triggered: boolean; timestamp: number }> = [];

  constructor() {
    this.setupDefaultAlerts();
    this.startAlertCheckInterval();
  }

  private generateErrorId(message: string, category: ErrorCategory): string {
    return `${category}:${Buffer.from(message).toString('base64').substring(0, 20)}`;
  }

  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('database') || message.includes('prisma') || message.includes('sql')) {
      return ErrorCategory.DATABASE;
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('auth') || message.includes('unauthorized')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return ErrorCategory.AUTHORIZATION;
    }
    if (message.includes('api') || message.includes('fetch') || message.includes('http')) {
      return ErrorCategory.EXTERNAL_API;
    }
    if (message.includes('trade') || message.includes('vault') || message.includes('position')) {
      return ErrorCategory.BUSINESS_LOGIC;
    }
    
    return ErrorCategory.UNKNOWN;
  }

  private determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    // Critical errors that should wake someone up
    if (message.includes('critical') || message.includes('fatal') || message.includes('out of memory')) {
      return ErrorSeverity.CRITICAL;
    }
    
    // High severity for core functionality
    if (category === ErrorCategory.DATABASE || 
        category === ErrorCategory.AUTHENTICATION ||
        message.includes('transaction') ||
        message.includes('trade failed')) {
      return ErrorSeverity.HIGH;
    }
    
    // Medium for business logic issues
    if (category === ErrorCategory.BUSINESS_LOGIC || 
        category === ErrorCategory.AUTHORIZATION) {
      return ErrorSeverity.MEDIUM;
    }
    
    // Low for validation and network issues
    if (category === ErrorCategory.VALIDATION || 
        category === ErrorCategory.NETWORK) {
      return ErrorSeverity.LOW;
    }
    
    return ErrorSeverity.MEDIUM;
  }

  private setupDefaultAlerts(): void {
    this.alerts = [
      {
        id: 'critical-alert',
        name: 'Critical Errors',
        severity: ErrorSeverity.CRITICAL,
        threshold: 1, // Alert immediately on any critical error
        windowMs: 60000,
        enabled: true
      },
      {
        id: 'high-severity-alert',
        name: 'High Severity Errors',
        severity: ErrorSeverity.HIGH,
        threshold: 5, // 5 per minute
        windowMs: 60000,
        enabled: true
      },
      {
        id: 'database-alert',
        name: 'Database Errors',
        category: ErrorCategory.DATABASE,
        threshold: 3, // 3 per minute
        windowMs: 60000,
        enabled: true
      },
      {
        id: 'external-api-alert',
        name: 'External API Errors',
        category: ErrorCategory.EXTERNAL_API,
        threshold: 10, // 10 per minute
        windowMs: 60000,
        enabled: true
      },
      {
        id: 'error-rate-alert',
        name: 'General Error Rate',
        threshold: 20, // 20 per minute
        windowMs: 60000,
        enabled: true
      }
    ];
  }

  private startAlertCheckInterval(): void {
    // Check alert rules every 30 seconds
    setInterval(() => {
      this.checkAlerts();
    }, 30000);
  }

  private checkAlerts(): void {
    const now = Date.now();
    
    for (const alert of this.alerts) {
      if (!alert.enabled) continue;
      
      const matchingErrors = this.getErrorsInWindow(
        alert.category,
        alert.severity,
        alert.windowMs
      );
      
      if (matchingErrors.length >= alert.threshold) {
        this.triggerAlert(alert, matchingErrors.length);
      }
    }
    
    // Clean up old error references
    this.recentErrors = this.recentErrors.filter(e => now - e.timestamp < 300_000); // 5 minutes
  }

  private getErrorsInWindow(
    category?: ErrorCategory,
    severity?: ErrorSeverity,
    windowMs: number = 60000
  ): ErrorRecord[] {
    const now = Date.now();
    const cutoff = now - windowMs;
    
    return Array.from(this.errors.values()).filter(error => {
      if (new Date(error.lastSeen).getTime() < cutoff) return false;
      if (category && error.category !== category) return false;
      if (severity && error.severity !== severity) return false;
      return true;
    });
  }

  private triggerAlert(alert: AlertRule, count: number): void {
    const alertId = alert.id;
    const now = Date.now();
    
    // Rate limit alerts to avoid spam
    const recentAlert = this.alertHistory.find(
      a => a.alertId === alertId && now - a.timestamp < 300_000 // 5 minutes
    );
    
    if (recentAlert) return;
    
    logger.critical(`ALERT TRIGGERED: ${alert.name}`, undefined, {
      alertId: alert.id,
      threshold: alert.threshold,
      actual: count,
      window: `${alert.windowMs / 1000}s`,
      category: alert.category,
      severity: alert.severity
    });
    
    this.alertHistory.push({ alertId, triggered: true, timestamp: now });
    
    // Here you would integrate with external alerting services
    // e.g., PagerDuty, Slack, email, etc.
    this.sendExternalAlert(alert, count);
  }

  private sendExternalAlert(alert: AlertRule, count: number): void {
    // Placeholder for external alert integration
    // In production, this would send to PagerDuty, Slack, DataDog, etc.
    if (process.env.SLACK_WEBHOOK_URL) {
      logger.info(`Would send Slack alert for ${alert.name}: ${count} errors exceeded threshold of ${alert.threshold}`);
    }
    
    if (process.env.PAGERDUTY_INTEGRATION_KEY) {
      logger.info(`Would send PagerDuty alert for ${alert.name}: ${count} errors exceeded threshold of ${alert.threshold}`);
    }
  }

  // Public API
  trackError(error: Error, context?: Record<string, any>, userId?: string, requestId?: string): void {
    const category = this.categorizeError(error);
    const severity = this.determineSeverity(error, category);
    const errorId = this.generateErrorId(error.message, category);
    const now = new Date().toISOString();
    
    const existing = this.errors.get(errorId);
    
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      existing.context = { ...existing.context, ...context };
    } else {
      this.errors.set(errorId, {
        id: errorId,
        timestamp: now,
        category,
        severity,
        message: error.message,
        stack: error.stack,
        context,
        userId,
        requestId,
        count: 1,
        firstSeen: now,
        lastSeen: now
      });
    }
    
    this.recentErrors.push({ errorId, timestamp: Date.now() });
    
    // Log the error
    const logLevel = severity === ErrorSeverity.CRITICAL ? LogLevel.CRITICAL : 
                     severity === ErrorSeverity.HIGH ? LogLevel.ERROR : LogLevel.WARN;
    
    logger.addLog(logLevel, error.message, context, error);
  }

  getErrors(category?: ErrorCategory, severity?: ErrorSeverity): ErrorRecord[] {
    return Array.from(this.errors.values()).filter(error => {
      if (category && error.category !== category) return false;
      if (severity && error.severity !== severity) return false;
      return true;
    });
  }

  getErrorById(id: string): ErrorRecord | undefined {
    return this.errors.get(id);
  }

  getErrorRate(category?: ErrorCategory, windowMs: number = 60000): number {
    const errors = this.getErrorsInWindow(category, undefined, windowMs);
    return errors.length / (windowMs / 1000 / 60); // errors per minute
  }

  addAlertRule(rule: Omit<AlertRule, 'id'>): string {
    const id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.alerts.push({ ...rule, id });
    return id;
  }

  removeAlertRule(id: string): void {
    this.alerts = this.alerts.filter(a => a.id !== id);
  }

  getAlertRules(): AlertRule[] {
    return [...this.alerts];
  }

  clearOldErrors(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThanMs;
    
    for (const [id, error] of this.errors) {
      if (new Date(error.lastSeen).getTime() < cutoff) {
        this.errors.delete(id);
      }
    }
  }

  getSummary(): {
    totalErrors: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    topErrors: ErrorRecord[];
    errorRate: number;
  } {
    const errors = Array.from(this.errors.values());
    
    const byCategory = Object.values(ErrorCategory).reduce((acc, cat) => {
      acc[cat] = 0;
      return acc;
    }, {} as Record<ErrorCategory, number>);
    
    const bySeverity = Object.values(ErrorSeverity).reduce((acc, sev) => {
      acc[sev] = 0;
      return acc;
    }, {} as Record<ErrorSeverity, number>);
    
    for (const error of errors) {
      byCategory[error.category]++;
      bySeverity[error.severity]++;
    }
    
    return {
      totalErrors: errors.length,
      byCategory,
      bySeverity,
      topErrors: errors.sort((a, b) => b.count - a.count).slice(0, 10),
      errorRate: this.getErrorRate()
    };
  }
}

// Singleton instance
export const errorTracker = new ErrorTracker();

// Convenience function to wrap async functions with error tracking
export function withErrorTracking<T>(
  fn: () => Promise<T>,
  context?: Record<string, any>,
  userId?: string,
  requestId?: string
): Promise<T> {
  return fn().catch(error => {
    errorTracker.trackError(error, context, userId, requestId);
    throw error;
  });
}

// Export types
export type { ErrorRecord, AlertRule };