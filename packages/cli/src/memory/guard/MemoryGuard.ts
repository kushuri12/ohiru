import { EventEmitter } from "node:events";
import v8 from "node:v8";

export interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMB: number;
  heapPercent: number;
}

export interface MemoryThresholds {
  warnMB: number;        // Warn user UI
  gcMB: number;          // Force GC if available
  emergencyMB: number;   // Emergency history prune
  criticalMB: number;    // Hard stop and save
}

/**
 * Monitors the Node.js process heap memory consumption.
 * Triggers events and forced Garbage Collection when thresholds are met.
 */
export class MemoryGuard extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private lastGC = 0;
  private readonly GC_COOLDOWN_MS = 15_000; // Do not spam GC
  private criticalEmitted = false;   // Prevent repeated critical emissions
  private lastWarnTime = 0;         // Throttle warn events

  constructor(
    private thresholds: MemoryThresholds = {
      warnMB: 768,      // Default values approx for 1.5GB total
      gcMB: 1024,
      emergencyMB: 1280,
      criticalMB: 1536
    },
    private checkIntervalMs: number = 3000
  ) {
    super();
  }

  /**
   * Starts monitoring (uses unref to not block process exit).
   */
  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.check(), this.checkIntervalMs);
    this.interval.unref();
  }

  /**
   * Stops the monitoring interval.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Performs real-time memory analysis against configured thresholds.
   */
  private check(): void {
    const stats = this.getStats();

    if (stats.heapUsedMB >= this.thresholds.criticalMB) {
      if (!this.criticalEmitted) {   // Hanya emit sekali
        this.criticalEmitted = true;
        this.emit("critical", stats);
      }
      return;
    }

    // Reset flag jika memory sudah turun di bawah critical
    this.criticalEmitted = false;

    if (stats.heapUsedMB >= this.thresholds.emergencyMB) {
      this.emit("emergency", stats);
      this.forceGC("emergency");
      return;
    }

    if (stats.heapUsedMB >= this.thresholds.gcMB) {
      this.emit("pressure", stats);
      this.forceGC("pressure");
      return;
    }

    if (stats.heapUsedMB >= this.thresholds.warnMB) {
      // Throttle warn — max sekali per menit
      const now = Date.now();
      if (!this.lastWarnTime || now - this.lastWarnTime > 60_000) {
        this.lastWarnTime = now;
        this.emit("warn", stats);
      }
    }
  }

  /**
   * Attempts to force Node.js Garbage Collection if --expose-gc is enabled.
   */
  private forceGC(reason: string): void {
    const now = Date.now();
    if (now - this.lastGC < this.GC_COOLDOWN_MS) return;

    if (global.gc) {
      try {
        this.lastGC = now;
        global.gc();
        this.emit("gc_performed", { reason, stats: this.getStats() });
      } catch (e) {
        // GC failed or was blocked
      }
    }
  }

  /**
   * Returns current process memory usage and heap stats in MB.
   */
  getStats(): MemoryStats {
    const mem = process.memoryUsage();
    const heap = v8.getHeapStatistics();
    const toMB = (bytes: number) => Math.round(bytes / 1024 / 1024);

    return {
      heapUsedMB: toMB(mem.heapUsed),
      heapTotalMB: toMB(mem.heapTotal),
      externalMB: toMB(mem.external),
      rssMB: toMB(mem.rss),
      heapPercent: Math.round((mem.heapUsed / heap.heap_size_limit) * 100),
    };
  }
}
