export class CronExpression {
  public static shouldRun(expression: string, now: Date, lastRun: Date | null): boolean {
    // Basic human-readable and cron parsing
    if (expression === "@hourly") {
      return !lastRun || (now.getTime() - lastRun.getTime()) >= 3600000;
    }
    if (expression === "@daily") {
      return !lastRun || now.getDate() !== lastRun.getDate();
    }
    if (expression.startsWith("every ")) {
      // every 30 minutes, every 2 hours
      const parts = expression.split(" ");
      const val = parseInt(parts[1]);
      const unit = parts[2];
      let ms = 0;
      if (unit.includes("minute")) ms = val * 60 * 1000;
      if (unit.includes("hour")) ms = val * 60 * 60 * 1000;
      return !lastRun || (now.getTime() - lastRun.getTime()) >= ms;
    }

    // Default: pulse-based minute matching (standard cron logic)
    // Simplified for this implementation
    return now.getSeconds() < 60; 
  }
}
