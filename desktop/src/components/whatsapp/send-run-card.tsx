"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw, Send, Square } from "lucide-react";

import { whatsappApi } from "@/lib/api";
import { sounds } from "@/lib/sounds";
import {
  isRunActive,
  type SendRunState,
  type StartRunOutcome,
  type WhatsAppStatus,
} from "@/hooks/use-whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface QueueStats {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface SendRunCardProps {
  status: WhatsAppStatus;
  isElectron: boolean;
  run: SendRunState;
  startRun: () => Promise<StartRunOutcome>;
  stopRun: () => Promise<void>;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Whole seconds left until `until`, re-rendering once a second while it runs. */
function useSecondsUntil(until: number | undefined, max: number | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return max ? Math.min(left, max) : left;
}

/** What the person should do about a run that ended early. */
function stopGuidance(reason: string): string {
  if (/daily limit/i.test(reason)) {
    return "Daily limit reached. Sending can resume tomorrow, or you can raise the limit in Sending pace.";
  }
  if (/hourly limit/i.test(reason)) {
    return "Hourly limit reached. Resume in a while, or raise the limit in Sending pace.";
  }
  if (/disconnected/i.test(reason)) return "WhatsApp disconnected during the run. Reconnect, then resume.";
  if (/stopped by user/i.test(reason)) return "You stopped this run. The remaining messages are still queued.";
  if (/failures in a row/i.test(reason)) {
    return `${reason}. Check the connection and the failed numbers before resuming.`;
  }
  return reason;
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value.toLocaleString()}</dd>
    </div>
  );
}

export function SendRunCard({ status, isElectron, run, startRun, stopRun }: SendRunCardProps) {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const active = isRunActive(run);
  const secondsLeft = useSecondsUntil(active ? run.waitUntil : undefined, run.waitSeconds);

  const loadStats = useCallback(async () => {
    try {
      const res = await whatsappApi.queueStats();
      setStats(res.data);
      setStatsFailed(false);
    } catch {
      setStatsFailed(true);
    }
  }, []);

  // Refresh the queue counts whenever the run moves forward or changes phase.
  useEffect(() => {
    let cancelled = false;
    whatsappApi
      .queueStats()
      .then((res) => {
        if (cancelled) return;
        setStats(res.data);
        setStatsFailed(false);
      })
      .catch(() => {
        if (!cancelled) setStatsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [run.processed, run.phase]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    sounds.send();
    const outcome = await startRun();
    setStarting(false);
    if (!outcome.started) {
      sounds.error();
      toast.error(outcome.message);
    }
  }, [startRun]);

  const handleRetryFailed = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await whatsappApi.retryFailed();
      const reset: number = res.data?.reset ?? 0;
      await loadStats();
      if (reset === 0) {
        toast.info("No failed messages to retry.");
        return;
      }
      toast.success(`${reset.toLocaleString()} failed ${reset === 1 ? "message" : "messages"} queued again.`);
      if (isElectron && status === "ready") await handleStart();
    } catch {
      toast.error("Could not queue the failed messages again.");
    } finally {
      setRetrying(false);
    }
  }, [handleStart, isElectron, loadStats, status]);

  const canSend = isElectron && status === "ready";
  const pending = stats?.pending ?? 0;
  const failedInQueue = stats?.failed ?? 0;
  const ranBefore = run.phase === "completed" || run.phase === "error";
  const percent = run.total > 0 ? Math.min(100, Math.round((run.processed / run.total) * 100)) : 0;

  let liveLine = "";
  if (run.phase === "stopping") liveLine = "Stopping after the current message";
  else if (secondsLeft !== null) liveLine = `Next message in ${formatClock(secondsLeft)}`;
  else if (run.currentRecipient) liveLine = `Sending to ${run.currentRecipient}`;
  else if (active) liveLine = "Preparing the queue";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" aria-hidden="true" />
          Sending
        </CardTitle>
        <CardDescription>
          Queued messages go out one at a time, with a pause between each.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {active ? (
          <>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <p className="font-medium" aria-live="polite">
                  {liveLine}
                </p>
                <p className="shrink-0 text-muted-foreground tabular-nums">
                  {run.processed.toLocaleString()} of {run.total.toLocaleString()}
                </p>
              </div>
              <Progress value={percent} className="h-2" aria-label="Messages processed" />
            </div>

            <dl className="grid grid-cols-3 gap-2">
              <Count label="Sent" value={run.sent} />
              <Count label="Skipped" value={run.skipped} />
              <Count label="Failed" value={run.failed} tone={run.failed > 0 ? "text-destructive" : undefined} />
            </dl>

            {run.lastResult && run.lastResult.status !== "SENT" && (
              <p className="text-xs text-muted-foreground">
                {run.lastResult.recipient} {run.lastResult.status === "SKIPPED" ? "skipped" : "failed"}:{" "}
                {run.lastResult.error}
              </p>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => void stopRun()}
              disabled={run.phase === "stopping"}
            >
              {run.phase === "stopping" ? (
                <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Square className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {run.phase === "stopping" ? "Stopping" : "Stop sending"}
            </Button>
          </>
        ) : (
          <>
            {ranBefore && (run.processed > 0 || run.stoppedReason || run.error) && (
              <div className="space-y-2 rounded-lg border p-3 text-sm" aria-live="polite">
                {run.processed > 0 && (
                  <p>
                    Last run: {run.sent.toLocaleString()} sent, {run.skipped.toLocaleString()} skipped,{" "}
                    {run.failed.toLocaleString()} failed.
                  </p>
                )}
                {(run.error || run.stoppedReason) && (
                  <p className="flex gap-2 text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <span>{run.error ?? stopGuidance(run.stoppedReason ?? "")}</span>
                  </p>
                )}
              </div>
            )}

            {stats === null && !statsFailed ? (
              <div className="space-y-2">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            ) : statsFailed && stats === null ? (
              <p className="text-sm text-muted-foreground">
                The queue could not be loaded.{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => void loadStats()}>
                  Try again
                </button>
              </p>
            ) : pending > 0 ? (
              <div>
                <p className="text-2xl font-semibold tabular-nums">{pending.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">
                  {pending === 1 ? "message" : "messages"} waiting to send
                </p>
              </div>
            ) : (
              <div className="text-sm">
                <p className="font-medium">Nothing waiting to send</p>
                <p className="text-muted-foreground">
                  Send a WhatsApp broadcast from{" "}
                  <Link href="/broadcast" className="underline underline-offset-2">
                    Broadcasts
                  </Link>{" "}
                  and its messages appear here.
                </p>
              </div>
            )}

            {(pending > 0 || failedInQueue > 0) && (
              <div className="flex flex-col gap-2 sm:flex-row">
                {pending > 0 && (
                  <Button className="sm:flex-1" onClick={handleStart} disabled={!canSend || starting}>
                    {starting ? (
                      <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    {ranBefore && run.stoppedReason ? "Resume sending" : "Start sending"}
                  </Button>
                )}
                {failedInQueue > 0 && (
                  <Button variant="outline" className="sm:flex-1" onClick={handleRetryFailed} disabled={retrying}>
                    {retrying ? (
                      <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Retry {failedInQueue.toLocaleString()} failed
                  </Button>
                )}
              </div>
            )}

            {pending > 0 && !canSend && (
              <p className="text-xs text-muted-foreground">
                {isElectron
                  ? "Connect WhatsApp to send these messages."
                  : "Open the Whamail desktop app with WhatsApp connected to send these messages."}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
