type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: unknown;
}

class Logger {
  private component: string;
  private static logLevel: LogLevel = 'info';
  private static levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(component: string) {
    this.component = component;
  }

  static setLevel(level: LogLevel): void {
    Logger.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return Logger.levelPriority[level] >= Logger.levelPriority[Logger.logLevel];
  }

  private formatLog(level: LogLevel, message: string, data?: unknown): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      data,
    };
  }

  private output(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.component}]`;
    const msg = `${prefix} ${entry.message}`;
    
    switch (entry.level) {
      case 'error':
        console.error(msg, entry.data || '');
        break;
      case 'warn':
        console.warn(msg, entry.data || '');
        break;
      case 'debug':
        console.debug(msg, entry.data || '');
        break;
      default:
        console.log(msg, entry.data || '');
    }
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatLog('debug', message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      this.output(this.formatLog('info', message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      this.output(this.formatLog('warn', message, data));
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      this.output(this.formatLog('error', message, data));
    }
  }
}

export function createLogger(component: string): Logger {
  return new Logger(component);
}

export { Logger };
