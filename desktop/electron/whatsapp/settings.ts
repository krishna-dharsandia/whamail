import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SendingSettings } from "./types.js";

/** Conservative defaults: slow, jittered sending that looks like a person. */
export const DEFAULT_SETTINGS: SendingSettings = {
  dailyLimit: 100,
  hourlyLimit: 50,
  intervalSeconds: 30,
  delayJitterPercent: 50,
  failureBackoffBaseSeconds: 30,
  failureBackoffMaxSeconds: 200,
  maxConsecutiveFailures: 10,
  defaultCountryCode: "91",
};

interface IntRule {
  key: Exclude<keyof SendingSettings, "defaultCountryCode">;
  label: string;
  min: number;
  max: number;
}

const INT_RULES: IntRule[] = [
  { key: "dailyLimit", label: "Messages per day", min: 1, max: 2000 },
  { key: "hourlyLimit", label: "Messages per hour", min: 1, max: 500 },
  { key: "intervalSeconds", label: "Pause between messages", min: 30, max: 3600 },
  { key: "delayJitterPercent", label: "Random extra pause", min: 0, max: 100 },
  { key: "failureBackoffBaseSeconds", label: "Wait after a failure", min: 30, max: 3600 },
  { key: "failureBackoffMaxSeconds", label: "Longest wait", min: 60, max: 7200 },
  { key: "maxConsecutiveFailures", label: "Stop after failures in a row", min: 1, max: 100 },
];

/** Validates user-supplied settings. Throws an Error with a readable message. */
export function validateSettings(input: unknown): SendingSettings {
  if (!input || typeof input !== "object") throw new Error("Invalid settings");
  const raw = input as Record<string, unknown>;
  const next = { ...DEFAULT_SETTINGS };

  for (const rule of INT_RULES) {
    const value = raw[rule.key];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error(`${rule.label} must be a whole number`);
    }
    if (value < rule.min || value > rule.max) {
      throw new Error(`${rule.label} must be between ${rule.min} and ${rule.max}`);
    }
    next[rule.key] = value;
  }

  const countryCode = String(raw.defaultCountryCode ?? "").replace(/^\+/, "").trim();
  if (!/^[1-9]\d{0,3}$/.test(countryCode)) {
    throw new Error("Default country code must be 1 to 4 digits, e.g. 91");
  }
  next.defaultCountryCode = countryCode;

  if (next.hourlyLimit > next.dailyLimit) {
    throw new Error("Messages per hour cannot exceed messages per day");
  }
  if (next.failureBackoffMaxSeconds < next.failureBackoffBaseSeconds) {
    throw new Error("Longest wait must be at least the wait after a failure");
  }
  return next;
}

/** JSON-file backed settings. A missing or corrupt file falls back to defaults. */
export class SettingsStore {
  private current: SendingSettings;

  constructor(private readonly filePath: string) {
    this.current = this.read();
  }

  get(): SendingSettings {
    return { ...this.current };
  }

  save(input: unknown): SendingSettings {
    this.current = validateSettings(input);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.current, null, 2), "utf-8");
    return this.get();
  }

  private read(): SendingSettings {
    if (!existsSync(this.filePath)) return { ...DEFAULT_SETTINGS };
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf-8")) as Record<string, unknown>;
      return validateSettings({ ...DEFAULT_SETTINGS, ...parsed });
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
}
