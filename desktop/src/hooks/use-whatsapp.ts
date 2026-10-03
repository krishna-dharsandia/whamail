"use client";

import { useCallback, useEffect, useState } from "react";

export type WhatsAppStatus =
  | "disconnected"
  | "initializing"
  | "qr"
  | "authenticated"
  | "ready"
  | "error";

export interface WhatsAppInfo {
  name: string;
  phone: string;
  platform: string;
}

export type SendRunPhase = "idle" | "running" | "stopping" | "completed" | "error";

export interface SendRunState {
  phase: SendRunPhase;
  startedAt?: string;
  finishedAt?: string;
  sent: number;
  failed: number;
  skipped: number;
  processed: number;
  total: number;
  currentRecipient?: string;
  waitSeconds?: number;
  /** Epoch ms when the pause before the next message ends. */
  waitUntil?: number;
  lastResult?: { recipient: string; status: "SENT" | "FAILED" | "SKIPPED"; error?: string };
  stoppedReason?: string;
  error?: string;
}

export interface SendingSettings {
  dailyLimit: number;
  hourlyLimit: number;
  intervalSeconds: number;
  delayJitterPercent: number;
  failureBackoffBaseSeconds: number;
  failureBackoffMaxSeconds: number;
  maxConsecutiveFailures: number;
  defaultCountryCode: string;
}

export interface SendingSettingsSnapshot {
  settings: SendingSettings;
  sentToday: number;
  sentLastHour: number;
}

interface StatusPayload {
  status: WhatsAppStatus;
  detail?: string;
  qr?: string | null;
  info?: WhatsAppInfo | null;
  hasSavedSession?: boolean;
}

/** The WhatsApp API the Electron preload script exposes. */
interface WhatsAppBridge {
  getStatus: () => Promise<StatusPayload>;
  connect: () => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<{ success: boolean }>;
  resetSession: () => Promise<{ success: boolean; error?: string }>;
  sendMessage: (phone: string, message: string) => Promise<{ success: boolean; error?: string; messageId?: string }>;
  checkNumber: (phone: string) => Promise<{ registered: boolean; phone?: string; error?: string }>;
  getRunState: () => Promise<SendRunState>;
  startRun: (input?: { broadcastId?: string | null }) => Promise<{ success: boolean; error?: string; state: SendRunState }>;
  stopRun: () => Promise<{ success: boolean; state: SendRunState }>;
  getSettings: () => Promise<SendingSettingsSnapshot>;
  saveSettings: (settings: SendingSettings) => Promise<{ success: boolean; error?: string; settings?: SendingSettings }>;
  /** Hands the main process the access token it uses to record send results. */
  setAuthToken: (token: string | null) => void;
  onAuthRequired: (cb: () => void) => () => void;
  onStatus: (cb: (data: StatusPayload) => void) => () => void;
  onRunState: (cb: (state: SendRunState) => void) => () => void;
}

const IDLE_RUN: SendRunState = { phase: "idle", sent: 0, failed: 0, skipped: 0, processed: 0, total: 0 };

export function getWhatsAppBridge(): WhatsAppBridge | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { electronAPI?: { whatsapp?: WhatsAppBridge } }).electronAPI;
  return api?.whatsapp ?? null;
}

export function isRunActive(run: SendRunState): boolean {
  return run.phase === "running" || run.phase === "stopping";
}

export type StartRunOutcome =
  | { started: true; alreadyRunning: boolean }
  | { started: false; reason: "desktop-required" | "not-connected" | "error"; message: string };

/**
 * Start working through the queued WhatsApp messages. Safe to call while a
 * run is already active — that run picks up newly queued messages by itself.
 */
export async function startWhatsAppRun(): Promise<StartRunOutcome> {
  const wa = getWhatsAppBridge();
  if (!wa) {
    return {
      started: false,
      reason: "desktop-required",
      message: "Messages are queued. Open the Whamail desktop app with WhatsApp connected to send them.",
    };
  }
  const result = await wa.startRun();
  if (result.success) return { started: true, alreadyRunning: false };
  if (isRunActive(result.state)) return { started: true, alreadyRunning: true };
  if (/connect whatsapp/i.test(result.error ?? "")) {
    return {
      started: false,
      reason: "not-connected",
      message: "Messages are queued. Connect WhatsApp to start sending.",
    };
  }
  return { started: false, reason: "error", message: result.error || "Could not start sending." };
}

interface UseWhatsAppReturn {
  status: WhatsAppStatus;
  qrCode: string | null;
  info: WhatsAppInfo | null;
  detail: string | null;
  /** A previous login is stored, so connecting needs no QR scan. */
  hasSavedSession: boolean;
  run: SendRunState;
  isElectron: boolean;
  connect: () => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<{ success: boolean }>;
  resetSession: () => Promise<{ success: boolean; error?: string }>;
  sendMessage: (phone: string, message: string) => Promise<{ success: boolean; error?: string; messageId?: string }>;
  checkNumber: (phone: string) => Promise<{ registered: boolean; phone?: string; error?: string }>;
  startRun: () => Promise<StartRunOutcome>;
  stopRun: () => Promise<void>;
}

export function useWhatsApp(): UseWhatsAppReturn {
  const [status, setStatus] = useState<WhatsAppStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [info, setInfo] = useState<WhatsAppInfo | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [run, setRun] = useState<SendRunState>(IDLE_RUN);

  const isElectron = getWhatsAppBridge() !== null;

  useEffect(() => {
    const wa = getWhatsAppBridge();
    let cancelled = false;

    if (!wa) {
      // Web mode cannot drive WhatsApp; show the session the desktop app last reported.
      import("@/lib/api")
        .then(({ whatsappApi }) => whatsappApi.getSession())
        .then((res) => {
          if (cancelled || !res.data) return;
          setStatus("ready");
          setInfo({
            name: res.data.pushName ?? "",
            phone: res.data.phoneNumber ?? "",
            platform: res.data.platform ?? "",
          });
        })
        .catch(() => {
          // No session recorded — nothing to show.
        });
      return () => {
        cancelled = true;
      };
    }

    const apply = (data: StatusPayload) => {
      setStatus(data.status);
      setDetail(data.detail ?? null);
      setQrCode(data.status === "qr" ? (data.qr ?? null) : null);
      setInfo(data.status === "ready" ? (data.info ?? null) : null);
      if (data.status === "ready") setHasSavedSession(true);
      if (typeof data.hasSavedSession === "boolean") setHasSavedSession(data.hasSavedSession);
    };

    wa.getStatus().then((data) => {
      if (!cancelled) apply(data);
    });
    wa.getRunState().then((state) => {
      if (!cancelled) setRun(state);
    });

    const offStatus = wa.onStatus(apply);
    const offRun = wa.onRunState(setRun);

    return () => {
      cancelled = true;
      offStatus();
      offRun();
    };
  }, []);

  const connect = useCallback(async () => {
    const wa = getWhatsAppBridge();
    if (!wa) return { success: false, error: "Connecting WhatsApp needs the Whamail desktop app." };
    return wa.connect();
  }, []);

  const disconnect = useCallback(async () => {
    const wa = getWhatsAppBridge();
    if (!wa) return { success: false };
    return wa.disconnect();
  }, []);

  const resetSession = useCallback(async () => {
    const wa = getWhatsAppBridge();
    if (!wa) return { success: false, error: "This needs the Whamail desktop app." };
    const result = await wa.resetSession();
    if (result.success) setHasSavedSession(false);
    return result;
  }, []);

  const sendMessage = useCallback(async (phone: string, message: string) => {
    const wa = getWhatsAppBridge();
    if (!wa) return { success: false, error: "Sending needs the Whamail desktop app." };
    return wa.sendMessage(phone, message);
  }, []);

  const checkNumber = useCallback(async (phone: string) => {
    const wa = getWhatsAppBridge();
    if (!wa) return { registered: false, error: "Checking numbers needs the Whamail desktop app." };
    return wa.checkNumber(phone);
  }, []);

  const stopRun = useCallback(async () => {
    await getWhatsAppBridge()?.stopRun();
  }, []);

  return {
    status,
    qrCode,
    info,
    detail,
    hasSavedSession,
    run,
    isElectron,
    connect,
    disconnect,
    resetSession,
    sendMessage,
    checkNumber,
    startRun: startWhatsAppRun,
    stopRun,
  };
}
