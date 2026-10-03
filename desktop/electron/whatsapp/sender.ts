import { MAX_MESSAGE_LENGTH, toWhatsAppText } from "./message-format.js";
import { normalizePhone } from "./phone.js";
import type { SendResult } from "./types.js";

/** The slice of the WhatsApp client the sender needs — small enough to fake in tests. */
export interface SendTransport {
  isReady(): boolean;
  /** Resolves the WhatsApp ID for a number, or null if it has no WhatsApp account. */
  getNumberId(digits: string): Promise<{ _serialized: string } | null>;
  sendMessage(chatId: string, text: string): Promise<{ id?: { _serialized?: string } } | undefined>;
}

export interface SendOptions {
  defaultCountryCode: string;
}

/**
 * Send one text message.
 *
 * SKIPPED means the contact can never receive this message (bad number, not on
 * WhatsApp, empty text). FAILED means the attempt itself went wrong and is
 * worth retrying. Only FAILED counts toward the run's circuit breaker, so a
 * list full of non-WhatsApp numbers does not stop the run.
 */
export async function sendText(
  transport: SendTransport,
  rawPhone: string,
  body: string,
  options: SendOptions,
): Promise<SendResult> {
  const timestamp = new Date().toISOString();
  const local = (status: "SKIPPED" | "FAILED", error: string): SendResult => ({
    success: false,
    status,
    error,
    timestamp,
    contactedWhatsApp: false,
  });

  const { phone, error: phoneError } = normalizePhone(rawPhone, options.defaultCountryCode);
  if (!phone) return local("SKIPPED", phoneError ?? "Invalid phone number");

  const message = toWhatsAppText(body);
  if (message.length === 0) return local("SKIPPED", "Message is empty");
  if (message.length > MAX_MESSAGE_LENGTH) {
    return local("SKIPPED", `Message is longer than ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters`);
  }

  if (!transport.isReady()) return local("FAILED", "WhatsApp connection is not ready");

  try {
    // Resolve the number first. Sending straight to "<digits>@c.us" fails with
    // "No LID for user" for contacts this account has never chatted with.
    const numberId = await transport.getNumberId(phone.slice(1));
    if (!numberId) {
      return {
        success: false,
        status: "SKIPPED",
        error: "Number is not registered on WhatsApp",
        timestamp: new Date().toISOString(),
        contactedWhatsApp: true,
      };
    }

    const result = await transport.sendMessage(numberId._serialized, message);
    return {
      success: true,
      status: "SENT",
      timestamp: new Date().toISOString(),
      providerMessageId: result?.id?._serialized,
      contactedWhatsApp: true,
    };
  } catch (error) {
    return {
      success: false,
      status: "FAILED",
      error: readableSendError(error),
      timestamp: new Date().toISOString(),
      contactedWhatsApp: true,
    };
  }
}

export function readableSendError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/no lid for user/i.test(raw)) {
    return "WhatsApp could not resolve this contact. Reconnect and retry after checking the number.";
  }
  if (/execution context|detached frame|target closed|session closed/i.test(raw)) {
    return "The WhatsApp Web session changed or closed. Reconnect before retrying.";
  }
  if (/not connected|not ready|disconnected/i.test(raw)) {
    return "WhatsApp disconnected before the message was accepted.";
  }
  return raw.length > 300 ? `${raw.slice(0, 297)}…` : raw;
}
