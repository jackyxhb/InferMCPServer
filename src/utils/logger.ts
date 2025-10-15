type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function formatContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) {
    return "";
  }

  try {
    return ` ${JSON.stringify(context)}`;
  } catch {
    return "";
  }
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  const timestamp = new Date().toISOString();
  const payload = `[${timestamp}] [${level.toUpperCase()}] ${message}${formatContext(context)}`;

  if (level === "error") {
    console.error(payload);
  } else if (level === "warn") {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    write("debug", message, context);
  },
  info(message: string, context?: LogContext): void {
    write("info", message, context);
  },
  warn(message: string, context?: LogContext): void {
    write("warn", message, context);
  },
  error(message: string, context?: LogContext): void {
    write("error", message, context);
  }
};
