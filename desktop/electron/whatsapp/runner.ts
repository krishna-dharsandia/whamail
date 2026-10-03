import { backoffSeconds, delay as realDelay, isAbortError, jitterSeconds } from "./pacing.js";
import type { PendingPage, SendResult, SendRunState, SendingSettings } from "./types.js";

const PAGE_SIZE = 200;
const REPORT_ATTEMPTS = 3;
const REPORT_RETRY_MS = 2_000;

export interface RunnerQueue {
  pending(broadcastId: string | null | undefined, limit: number): Promise<PendingPage>;
  claim(id: string): Promise<boolean>;
  result(id: string, result: SendResult): Promise<void>;
  recover(): Promise<void>;
}

export interface RunnerLimits {
  sentToday(): number;
  sentLastHour(): number;
  record(): void;
}

export interface RunnerDeps {
  queue: RunnerQueue;
  limits: RunnerLimits;
  isReady(): boolean;
  send(phone: string, body: string): Promise<SendResult>;
  getSettings(): SendingSettings;
  onChange?: (state: SendRunState) => void;
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

const IDLE: SendRunState = { phase: "idle", sent: 0, failed: 0, skipped: 0, processed: 0, total: 0 };

/**
 * Works through the pending WhatsApp queue one message at a time, the way a
 * person would: a pause plus random jitter between messages, exponential
 * backoff after a failure, daily and hourly caps, and a circuit breaker that
 * stops the run after repeated genuine failures.
 */
export class SendRunner {
  private controller: AbortController | null = null;
  private state: SendRunState = { ...IDLE };
  /** Results WhatsApp accepted but the API has not recorded yet. */
  private unreported = new Map<string, SendResult>();
  private readonly delay: NonNullable<RunnerDeps["delay"]>;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly deps: RunnerDeps) {
    this.delay = deps.delay ?? realDelay;
    this.random = deps.random ?? Math.random;
    this.now = deps.now ?? Date.now;
  }

  getState(): SendRunState {
    return structuredClone(this.state);
  }

  isActive(): boolean {
    return this.state.phase === "running" || this.state.phase === "stopping";
  }

  /** Starts a run. `broadcastId` limits it to one broadcast; omit to send everything pending. */
  start(broadcastId?: string | null): SendRunState {
    if (this.isActive()) throw new Error("A send run is already active");
    if (!this.deps.isReady()) throw new Error("Connect WhatsApp before sending");

    this.controller = new AbortController();
    this.state = {
      ...IDLE,
      phase: "running",
      broadcastId: broadcastId ?? null,
      startedAt: new Date(this.now()).toISOString(),
    };
    this.emit();
    void this.run(broadcastId ?? null, this.controller.signal);
    return this.getState();
  }

  stop(): SendRunState {
    if (this.state.phase === "running") {
      this.update({ phase: "stopping" });
      this.controller?.abort();
    }
    return this.getState();
  }

  private async run(broadcastId: string | null, signal: AbortSignal): Promise<void> {
    try {
      const stoppedReason = await this.process(broadcastId, signal);
      this.update({
        phase: "completed",
        stoppedReason,
        finishedAt: new Date(this.now()).toISOString(),
        currentRecipient: undefined,
        waitSeconds: undefined,
        waitUntil: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[WhatsApp] Send run crashed: ${message}`);
      this.update({
        phase: "error",
        error: message,
        finishedAt: new Date(this.now()).toISOString(),
        currentRecipient: undefined,
        waitSeconds: undefined,
        waitUntil: undefined,
      });
    } finally {
      this.controller = null;
    }
  }

  /** Returns the reason the run stopped early, or undefined when the queue was drained. */
  private async process(broadcastId: string | null, signal: AbortSignal): Promise<string | undefined> {
    // Record anything a previous run sent but could not report, *before*
    // recovery marks interrupted items as failed.
    await this.flushUnreported();
    await this.deps.queue.recover();

    const seen = new Set<string>();
    let consecutiveFailures = 0;
    let cooldownSeconds = 0;

    for (;;) {
      const page = await this.deps.queue.pending(broadcastId, PAGE_SIZE);
      const fresh = page.items.filter((item) => !seen.has(item.id));
      if (fresh.length === 0) return undefined;
      this.update({ total: this.state.processed + Math.max(page.totalPending, fresh.length) });

      for (const item of fresh) {
        seen.add(item.id);
        if (signal.aborted) return "Stopped by user";

        if (cooldownSeconds > 0) {
          this.update({
            currentRecipient: undefined,
            waitSeconds: cooldownSeconds,
            waitUntil: this.now() + cooldownSeconds * 1000,
          });
          try {
            await this.delay(cooldownSeconds * 1000, signal);
          } catch (error) {
            if (isAbortError(error)) return "Stopped by user";
            throw error;
          }
          cooldownSeconds = 0;
        }

        if (!this.deps.isReady()) return "WhatsApp disconnected";

        const settings = this.deps.getSettings();
        if (this.deps.limits.sentToday() >= settings.dailyLimit) return "Daily limit reached";
        if (this.deps.limits.sentLastHour() >= settings.hourlyLimit) return "Hourly limit reached";

        // Claiming flips the item to "Sending" so nothing else picks it up. A
        // failed claim means it was cancelled or handled elsewhere.
        if (!(await this.deps.queue.claim(item.id))) {
          this.update({ total: Math.max(this.state.processed, this.state.total - 1) });
          continue;
        }

        this.update({ currentRecipient: item.phoneNumber, waitSeconds: undefined, waitUntil: undefined });

        const result = await this.deps.send(item.phoneNumber, item.body);
        if (result.status === "SENT") this.deps.limits.record();
        await this.report(item.id, result);

        consecutiveFailures = result.status === "FAILED" ? consecutiveFailures + 1 : 0;
        this.update({
          processed: this.state.processed + 1,
          sent: this.state.sent + (result.status === "SENT" ? 1 : 0),
          failed: this.state.failed + (result.status === "FAILED" ? 1 : 0),
          skipped: this.state.skipped + (result.status === "SKIPPED" ? 1 : 0),
          lastResult: { recipient: item.phoneNumber, status: result.status, error: result.error },
        });

        if (consecutiveFailures >= settings.maxConsecutiveFailures) {
          return `Stopped after ${consecutiveFailures} failures in a row`;
        }

        // Pace the next message. Messages rejected locally never reached
        // WhatsApp, so they need no cooldown.
        if (result.contactedWhatsApp) {
          const base =
            result.status === "FAILED"
              ? backoffSeconds(
                  consecutiveFailures,
                  settings.failureBackoffBaseSeconds,
                  settings.failureBackoffMaxSeconds,
                )
              : settings.intervalSeconds;
          cooldownSeconds = jitterSeconds(base, settings.delayJitterPercent, this.random);
        }
      }
    }
  }

  private async report(id: string, result: SendResult): Promise<void> {
    this.unreported.set(id, result);
    for (let attempt = 1; attempt <= REPORT_ATTEMPTS; attempt++) {
      try {
        await this.deps.queue.result(id, result);
        this.unreported.delete(id);
        return;
      } catch (error) {
        if (attempt === REPORT_ATTEMPTS) {
          // Stop rather than keep sending messages nobody is recording. The
          // result stays in memory and is flushed when the next run starts.
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`Could not record the send result: ${reason}`);
        }
        await this.delay(REPORT_RETRY_MS);
      }
    }
  }

  private async flushUnreported(): Promise<void> {
    for (const [id, result] of [...this.unreported]) {
      await this.deps.queue.result(id, result);
      this.unreported.delete(id);
    }
  }

  private update(patch: Partial<SendRunState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    this.deps.onChange?.(this.getState());
  }
}
