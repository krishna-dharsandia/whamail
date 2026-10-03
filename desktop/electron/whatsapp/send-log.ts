import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const HOUR_MS = 3_600_000;
const KEEP_MS = 48 * HOUR_MS;

/**
 * Timestamps of messages WhatsApp accepted from this device. Rate limits are
 * about the linked WhatsApp account, so they are counted locally and survive
 * app restarts.
 */
export class SendLog {
  private timestamps: number[];

  constructor(
    private readonly filePath: string | null,
    private readonly now: () => number = Date.now,
  ) {
    this.timestamps = this.read();
  }

  record(): void {
    const current = this.now();
    this.timestamps = this.timestamps.filter((t) => current - t < KEEP_MS);
    this.timestamps.push(current);
    this.write();
  }

  /** Messages sent since local midnight. */
  sentToday(): number {
    const start = new Date(this.now());
    start.setHours(0, 0, 0, 0);
    const from = start.getTime();
    return this.timestamps.filter((t) => t >= from).length;
  }

  /** Messages sent in the last rolling 60 minutes. */
  sentLastHour(): number {
    const from = this.now() - HOUR_MS;
    return this.timestamps.filter((t) => t >= from).length;
  }

  private read(): number[] {
    if (!this.filePath || !existsSync(this.filePath)) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf-8"));
      return Array.isArray(parsed) ? parsed.filter((t): t is number => typeof t === "number") : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.timestamps), "utf-8");
    } catch (error) {
      console.error("[WhatsApp] Could not persist send log:", error);
    }
  }
}
