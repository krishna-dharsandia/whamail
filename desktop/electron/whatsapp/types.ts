export type ConnectionState =
  | "disconnected"
  | "initializing"
  | "qr"
  | "authenticated"
  | "ready"
  | "error";

export interface AccountInfo {
  name: string;
  phone: string;
  platform: string;
}

export interface ConnectionStatus {
  state: ConnectionState;
  detail: string;
  qrDataUrl?: string;
  info?: AccountInfo;
  updatedAt: string;
}

export type SendStatus = "SENT" | "FAILED" | "SKIPPED";

export interface SendResult {
  success: boolean;
  status: SendStatus;
  error?: string;
  timestamp: string;
  providerMessageId?: string;
  /** False when the message was rejected locally, before WhatsApp was contacted. */
  contactedWhatsApp: boolean;
}

export interface SendingSettings {
  /** Max messages per calendar day on this device. */
  dailyLimit: number;
  /** Max messages in any rolling 60 minutes. */
  hourlyLimit: number;
  /** Minimum pause between completed send attempts. */
  intervalSeconds: number;
  /** Random extra cooldown from 0 up to this percentage; never shortens the minimum pause. */
  delayJitterPercent: number;
  /** Base cooldown applied after a FAILED send, before exponential backoff. */
  failureBackoffBaseSeconds: number;
  /** Ceiling for the exponential backoff. */
  failureBackoffMaxSeconds: number;
  /** Stop the run after this many failures in a row (circuit breaker). */
  maxConsecutiveFailures: number;
  /** Country code (digits only) prepended to bare local numbers. */
  defaultCountryCode: string;
}

export interface QueueItem {
  id: string;
  phoneNumber: string;
  body: string;
  broadcastId: string | null;
}

export interface PendingPage {
  items: QueueItem[];
  totalPending: number;
}

export type SendRunPhase = "idle" | "running" | "stopping" | "completed" | "error";

export interface SendRunState {
  phase: SendRunPhase;
  broadcastId?: string | null;
  startedAt?: string;
  finishedAt?: string;
  sent: number;
  failed: number;
  skipped: number;
  processed: number;
  total: number;
  /** Recipient currently being sent to. */
  currentRecipient?: string;
  /** Length of the current cooldown, if the run is pausing between messages. */
  waitSeconds?: number;
  /** Epoch ms when the current cooldown ends. */
  waitUntil?: number;
  lastResult?: { recipient: string; status: SendStatus; error?: string };
  stoppedReason?: string;
  error?: string;
}
