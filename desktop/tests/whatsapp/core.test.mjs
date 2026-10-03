// Run with `npm run test:whatsapp` (compiles electron/ first).
import assert from "node:assert/strict";
import { test } from "node:test";

import { chromeCandidates, findChromeExecutable } from "../../dist-electron/whatsapp/chrome.js";
import { readableConnectionError } from "../../dist-electron/whatsapp/client.js";
import { toWhatsAppText } from "../../dist-electron/whatsapp/message-format.js";
import { backoffSeconds, delay, jitterSeconds } from "../../dist-electron/whatsapp/pacing.js";
import { normalizePhone } from "../../dist-electron/whatsapp/phone.js";
import { ApiError, QueueApi } from "../../dist-electron/whatsapp/queue-api.js";
import { SendLog } from "../../dist-electron/whatsapp/send-log.js";
import { sendText } from "../../dist-electron/whatsapp/sender.js";
import { DEFAULT_SETTINGS, validateSettings } from "../../dist-electron/whatsapp/settings.js";

// ── phone ──────────────────────────────────────────────────────────────────
test("normalizePhone keeps valid E.164 numbers", () => {
  assert.equal(normalizePhone("+919157014353", "91").phone, "+919157014353");
  assert.equal(normalizePhone("+91 91570-14353", "91").phone, "+919157014353");
  assert.equal(normalizePhone("+1 (415) 555-2671", "91").phone, "+14155552671");
});

test("normalizePhone prepends the default country code to bare local numbers", () => {
  // Starts with "91" but is a 10-digit national number — must not be read as already coded.
  assert.equal(normalizePhone("9157014353", "91").phone, "+919157014353");
  assert.equal(normalizePhone("98765 43210", "91").phone, "+919876543210");
  assert.equal(normalizePhone("4155552671", "1").phone, "+14155552671");
});

test("normalizePhone recognises numbers that already carry the country code", () => {
  assert.equal(normalizePhone("919157014353", "91").phone, "+919157014353");
  assert.equal(normalizePhone("00919157014353", "91").phone, "+919157014353");
  assert.equal(normalizePhone("09157014353", "91").phone, "+919157014353");
});

test("normalizePhone expands spreadsheet scientific notation", () => {
  assert.equal(normalizePhone("9.19157014353E+11", "91").phone, "+919157014353");
});

test("normalizePhone rejects unusable input", () => {
  assert.equal(normalizePhone("", "91").phone, null);
  assert.equal(normalizePhone("   ", "91").phone, null);
  assert.equal(normalizePhone("abc", "91").phone, null);
  assert.equal(normalizePhone("+123", "91").phone, null);
  assert.equal(normalizePhone("+1234567890123456", "91").phone, null);
  assert.equal(normalizePhone("9157014353", "").phone, null);
});

// ── pacing ─────────────────────────────────────────────────────────────────
test("jitter only ever lengthens the delay", () => {
  assert.equal(jitterSeconds(30, 50, () => 0), 30);
  assert.equal(jitterSeconds(30, 50, () => 1), 45);
  assert.equal(jitterSeconds(30, 50, () => 0.5), 38);
  assert.equal(jitterSeconds(30, 0, () => 1), 30);
  assert.equal(jitterSeconds(30, 500, () => 1), 60);
});

test("backoff doubles per consecutive failure and is capped", () => {
  assert.equal(backoffSeconds(1, 30, 200), 30);
  assert.equal(backoffSeconds(2, 30, 200), 60);
  assert.equal(backoffSeconds(3, 30, 200), 120);
  assert.equal(backoffSeconds(4, 30, 200), 200);
  assert.equal(backoffSeconds(0, 30, 200), 30);
});

test("delay rejects immediately when aborted", async () => {
  const controller = new AbortController();
  const pending = delay(60_000, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(delay(60_000, controller.signal), { name: "AbortError" });
});

// ── message formatting ─────────────────────────────────────────────────────
test("plain text passes through", () => {
  assert.equal(toWhatsAppText("  Hi Asha,\nyour order is ready.  "), "Hi Asha,\nyour order is ready.");
  assert.equal(toWhatsAppText("Price < 500 & rising"), "Price < 500 & rising");
});

test("HTML email bodies become WhatsApp text", () => {
  const html = `<!DOCTYPE html><html><head><style>p{color:red}</style><title>x</title></head>
    <body><table><tr><td>
      <div><p>Hi <strong>Asha</strong>,</p></div>
      <p>Your <em>order</em> is&nbsp;ready.<br>Thanks &amp; regards</p>
      <ul><li>One</li><li>Two</li></ul>
      <p><a href="https://whamail.com/track">Track it</a></p>
    </td></tr></table></body></html>`;
  assert.equal(
    toWhatsAppText(html),
    "Hi *Asha*,\n\nYour _order_ is ready.\nThanks & regards\n\n• One\n• Two\n\nTrack it (https://whamail.com/track)",
  );
});

test("links whose text is the URL are not duplicated", () => {
  assert.equal(toWhatsAppText('<p><a href="https://a.com">https://a.com</a></p>'), "https://a.com");
  assert.equal(toWhatsAppText('<p><a href="mailto:x@a.com">Email us</a></p>'), "Email us");
});

test("an HTML body with no visible text becomes empty", () => {
  assert.equal(toWhatsAppText("<div><br></div><style>a{}</style>"), "");
});

// ── settings ───────────────────────────────────────────────────────────────
test("default settings are valid", () => {
  assert.deepEqual(validateSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
});

test("settings validation enforces bounds and cross-field rules", () => {
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, intervalSeconds: 5 }), /between 30 and 3600/);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, dailyLimit: 1.5 }), /whole number/);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, dailyLimit: 10, hourlyLimit: 20 }), /Messages per hour cannot exceed/);
  assert.throws(
    () => validateSettings({ ...DEFAULT_SETTINGS, failureBackoffBaseSeconds: 300, failureBackoffMaxSeconds: 60 }),
    /Longest wait must be/,
  );
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, defaultCountryCode: "abc" }), /country code/);
  assert.equal(validateSettings({ ...DEFAULT_SETTINGS, defaultCountryCode: "+44" }).defaultCountryCode, "44");
});

// ── send log ───────────────────────────────────────────────────────────────
test("send log counts today and the rolling hour", () => {
  let now = new Date(2026, 0, 10, 12, 0, 0).getTime();
  const log = new SendLog(null, () => now);
  log.record();
  now += 30 * 60_000;
  log.record();
  assert.equal(log.sentLastHour(), 2);
  assert.equal(log.sentToday(), 2);
  now += 45 * 60_000; // first record is now 75 minutes old
  assert.equal(log.sentLastHour(), 1);
  assert.equal(log.sentToday(), 2);
  now = new Date(2026, 0, 11, 0, 5, 0).getTime(); // next day
  assert.equal(log.sentToday(), 0);
});

// ── sender ─────────────────────────────────────────────────────────────────
function fakeTransport(overrides = {}) {
  const calls = { lookups: [], sends: [] };
  const transport = {
    isReady: () => true,
    getNumberId: async (digits) => {
      calls.lookups.push(digits);
      return { _serialized: `${digits}@c.us` };
    },
    sendMessage: async (chatId, text) => {
      calls.sends.push({ chatId, text });
      return { id: { _serialized: "msg-1" } };
    },
    ...overrides,
  };
  return { transport, calls };
}

test("sendText resolves the number, then sends to the resolved id", async () => {
  const { transport, calls } = fakeTransport();
  const result = await sendText(transport, "98765 43210", "<p>Hello</p>", { defaultCountryCode: "91" });
  assert.equal(result.status, "SENT");
  assert.equal(result.providerMessageId, "msg-1");
  assert.deepEqual(calls.lookups, ["919876543210"]);
  assert.deepEqual(calls.sends, [{ chatId: "919876543210@c.us", text: "Hello" }]);
});

test("numbers without WhatsApp are skipped, not failed", async () => {
  const { transport, calls } = fakeTransport({ getNumberId: async () => null });
  const result = await sendText(transport, "+919876543210", "Hello", { defaultCountryCode: "91" });
  assert.equal(result.status, "SKIPPED");
  assert.equal(result.error, "Number is not registered on WhatsApp");
  assert.equal(result.contactedWhatsApp, true);
  assert.equal(calls.sends.length, 0);
});

test("invalid numbers and empty messages are skipped without contacting WhatsApp", async () => {
  const { transport, calls } = fakeTransport();
  const bad = await sendText(transport, "12", "Hello", { defaultCountryCode: "91" });
  assert.equal(bad.status, "SKIPPED");
  assert.equal(bad.contactedWhatsApp, false);
  const empty = await sendText(transport, "+919876543210", "<p> </p>", { defaultCountryCode: "91" });
  assert.equal(empty.status, "SKIPPED");
  const long = await sendText(transport, "+919876543210", "x".repeat(5000), { defaultCountryCode: "91" });
  assert.equal(long.status, "SKIPPED");
  assert.equal(calls.lookups.length, 0);
});

test("transport errors are reported as FAILED with a readable reason", async () => {
  const { transport } = fakeTransport({
    sendMessage: async () => {
      throw new Error("Protocol error: Execution context was destroyed");
    },
  });
  const result = await sendText(transport, "+919876543210", "Hello", { defaultCountryCode: "91" });
  assert.equal(result.status, "FAILED");
  assert.match(result.error, /session changed or closed/);

  const offline = fakeTransport({ isReady: () => false });
  const notReady = await sendText(offline.transport, "+919876543210", "Hello", { defaultCountryCode: "91" });
  assert.equal(notReady.status, "FAILED");
  assert.equal(offline.calls.lookups.length, 0);
});

// ── chrome lookup ──────────────────────────────────────────────────────────
test("chrome candidates cover Chrome and Edge on Windows and macOS", () => {
  const win = chromeCandidates("win32", {
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local",
  });
  assert.ok(win.some((p) => p.includes("chrome.exe")));
  assert.ok(win.some((p) => p.includes("msedge.exe")));
  const mac = chromeCandidates("darwin", {}, "/Users/a");
  assert.ok(mac.includes("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
});

test("an explicit browser override wins, and a missing one is reported", async () => {
  const found = await findChromeExecutable({ CHROME_PATH: "/opt/chrome" }, (p) => p === "/opt/chrome");
  assert.equal(found.path, "/opt/chrome");
  const missing = await findChromeExecutable({ WHAMAIL_CHROME_PATH: "/nope" }, () => false);
  assert.equal(missing.path, null);
  assert.match(missing.error, /No browser found/);
});

test("connection errors are translated", () => {
  assert.match(readableConnectionError("CHROME_NOT_FOUND: x"), /Google Chrome or Microsoft Edge/);
  assert.match(readableConnectionError("net::ERR_INTERNET_DISCONNECTED at https://web.whatsapp.com"), /internet/);
  assert.match(readableConnectionError("The browser is already running for /x"), /still using this session/);
});

// ── queue API client ───────────────────────────────────────────────────────
function jsonResponse(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("queue API sends the bearer token and maps statuses", async () => {
  const requests = [];
  const api = new QueueApi({
    getBaseUrl: () => "http://127.0.0.1:1/api",
    requestToken: () => {},
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (url.includes("/claim")) return jsonResponse(409, { error: "Not pending" });
      if (url.includes("/queue?")) return jsonResponse(200, { items: [], totalPending: 0 });
      return jsonResponse(200, {});
    },
  });
  api.setToken("tok");

  assert.deepEqual(await api.pending("b1", 50), { items: [], totalPending: 0 });
  assert.equal(requests[0].url, "http://127.0.0.1:1/api/whatsapp/queue?limit=50&broadcastId=b1");
  assert.equal(requests[0].init.headers.Authorization, "Bearer tok");

  assert.equal(await api.claim("q1"), false);

  await api.result("q1", { success: false, status: "SKIPPED", error: "nope", timestamp: "", contactedWhatsApp: true });
  assert.deepEqual(JSON.parse(requests[2].init.body), { status: "Skipped", error: "nope" });
});

test("queue API refreshes the token once after a 401", async () => {
  let asked = 0;
  const seen = [];
  const api = new QueueApi({
    getBaseUrl: () => "http://127.0.0.1:1/api",
    requestToken: () => {
      asked++;
      queueMicrotask(() => api.setToken("fresh"));
    },
    fetchImpl: async (_url, init) => {
      seen.push(init.headers.Authorization);
      return init.headers.Authorization === "Bearer fresh" ? jsonResponse(200, {}) : jsonResponse(401);
    },
  });
  api.setToken("stale");
  await api.recover();
  assert.equal(asked, 1);
  assert.deepEqual(seen, ["Bearer stale", "Bearer fresh"]);
});

test("queue API surfaces network failures as ApiError", async () => {
  const api = new QueueApi({
    getBaseUrl: () => "http://127.0.0.1:1/api",
    requestToken: () => {},
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  api.setToken("tok");
  await assert.rejects(api.recover(), (error) => error instanceof ApiError && /Could not reach/.test(error.message));
});
