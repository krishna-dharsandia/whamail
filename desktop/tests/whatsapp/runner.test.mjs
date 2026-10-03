// Run with `npm run test:whatsapp` (compiles electron/ first).
import assert from "node:assert/strict";
import { test } from "node:test";

import { SendRunner } from "../../dist-electron/whatsapp/runner.js";
import { DEFAULT_SETTINGS } from "../../dist-electron/whatsapp/settings.js";

const sent = (extra = {}) => ({
  success: true,
  status: "SENT",
  timestamp: "",
  contactedWhatsApp: true,
  ...extra,
});
const failed = (error = "boom") => ({ success: false, status: "FAILED", error, timestamp: "", contactedWhatsApp: true });
const skipped = (error, contactedWhatsApp = true) => ({
  success: false,
  status: "SKIPPED",
  error,
  timestamp: "",
  contactedWhatsApp,
});

function harness({ items, sendResults = {}, settings = {}, limits = {}, queue = {}, ready = () => true }) {
  const pendingIds = new Set(items.map((item) => item.id));
  const log = { claims: [], results: [], delays: [], sends: [], recovered: 0, states: [] };
  let sentCount = 0;

  const runner = new SendRunner({
    queue: {
      pending: async (broadcastId) => {
        const list = items.filter(
          (item) => pendingIds.has(item.id) && (!broadcastId || item.broadcastId === broadcastId),
        );
        return { items: list, totalPending: list.length };
      },
      claim: async (id) => {
        log.claims.push(id);
        return pendingIds.delete(id);
      },
      result: async (id, result) => {
        log.results.push({ id, status: result.status, error: result.error });
      },
      recover: async () => {
        log.recovered++;
      },
      ...queue,
    },
    limits: {
      sentToday: () => sentCount,
      sentLastHour: () => sentCount,
      record: () => {
        sentCount++;
      },
      ...limits,
    },
    isReady: ready,
    send: async (phone) => {
      log.sends.push(phone);
      const result = sendResults[phone];
      return typeof result === "function" ? result() : (result ?? sent());
    },
    getSettings: () => ({ ...DEFAULT_SETTINGS, ...settings }),
    onChange: (state) => log.states.push(state),
    delay: async (ms, signal) => {
      log.delays.push(ms);
      if (signal?.aborted) {
        const error = new Error("Send run stopped");
        error.name = "AbortError";
        throw error;
      }
    },
    random: () => 0,
  });

  const finished = () =>
    new Promise((resolve) => {
      const poll = () => {
        const state = runner.getState();
        if (state.phase === "completed" || state.phase === "error") resolve(state);
        else setImmediate(poll);
      };
      poll();
    });

  return { runner, log, finished, pendingIds };
}

const item = (n, broadcastId = "b1") => ({ id: `q${n}`, phoneNumber: `+9198765432${10 + n}`, body: "Hi", broadcastId });

test("drains the queue, pacing between messages but not after the last", async () => {
  const h = harness({ items: [item(1), item(2), item(3)] });
  h.runner.start();
  const state = await h.finished();

  assert.equal(state.phase, "completed");
  assert.equal(state.stoppedReason, undefined);
  assert.deepEqual([state.sent, state.failed, state.skipped, state.processed, state.total], [3, 0, 0, 3, 3]);
  assert.deepEqual(h.log.results.map((r) => r.status), ["SENT", "SENT", "SENT"]);
  assert.deepEqual(h.log.delays, [30_000, 30_000]);
  assert.equal(h.log.recovered, 1);
});

test("unregistered numbers are skipped and never trip the circuit breaker", async () => {
  const items = [item(1), item(2), item(3), item(4)];
  const sendResults = Object.fromEntries(
    items.slice(0, 3).map((i) => [i.phoneNumber, skipped("Number is not registered on WhatsApp")]),
  );
  const h = harness({ items, sendResults, settings: { maxConsecutiveFailures: 2 } });
  h.runner.start();
  const state = await h.finished();

  assert.equal(state.stoppedReason, undefined);
  assert.deepEqual([state.sent, state.skipped, state.failed], [1, 3, 0]);
});

test("locally rejected messages need no cooldown", async () => {
  const items = [item(1), item(2)];
  const h = harness({ items, sendResults: { [items[0].phoneNumber]: skipped("Invalid phone number", false) } });
  h.runner.start();
  await h.finished();
  assert.deepEqual(h.log.delays, []);
});

test("failures back off exponentially and stop the run at the breaker", async () => {
  const items = [item(1), item(2), item(3), item(4), item(5)];
  const sendResults = Object.fromEntries(items.map((i) => [i.phoneNumber, failed()]));
  const h = harness({ items, sendResults, settings: { maxConsecutiveFailures: 3 } });
  h.runner.start();
  const state = await h.finished();

  assert.equal(state.stoppedReason, "Stopped after 3 failures in a row");
  assert.equal(state.failed, 3);
  assert.deepEqual(h.log.delays, [30_000, 60_000]);
  assert.equal(h.pendingIds.size, 2, "untouched items stay pending");
});

test("a success resets the failure streak", async () => {
  const items = [item(1), item(2), item(3), item(4)];
  const sendResults = {
    [items[0].phoneNumber]: failed(),
    [items[1].phoneNumber]: sent(),
    [items[2].phoneNumber]: failed(),
    [items[3].phoneNumber]: sent(),
  };
  const h = harness({ items, sendResults, settings: { maxConsecutiveFailures: 2 } });
  h.runner.start();
  const state = await h.finished();
  assert.equal(state.stoppedReason, undefined);
  assert.deepEqual([state.sent, state.failed], [2, 2]);
});

test("stops at the daily limit without touching remaining items", async () => {
  const h = harness({ items: [item(1), item(2), item(3)], settings: { dailyLimit: 2, hourlyLimit: 2 } });
  h.runner.start();
  const state = await h.finished();
  assert.equal(state.stoppedReason, "Daily limit reached");
  assert.equal(state.sent, 2);
  assert.deepEqual(h.log.claims, ["q1", "q2"]);
});

test("stops at the hourly limit", async () => {
  const h = harness({
    items: [item(1), item(2)],
    limits: { sentToday: () => 0, sentLastHour: () => 50 },
  });
  h.runner.start();
  const state = await h.finished();
  assert.equal(state.stoppedReason, "Hourly limit reached");
  assert.equal(h.log.sends.length, 0);
});

test("stops when WhatsApp disconnects mid-run", async () => {
  let ready = true;
  const items = [item(1), item(2)];
  const h = harness({
    items,
    ready: () => ready,
    sendResults: {
      [items[0].phoneNumber]: () => {
        ready = false;
        return sent();
      },
    },
  });
  h.runner.start();
  const state = await h.finished();
  assert.equal(state.stoppedReason, "WhatsApp disconnected");
  assert.equal(state.sent, 1);
});

test("refuses to start while disconnected or already running", async () => {
  const offline = harness({ items: [item(1)], ready: () => false });
  assert.throws(() => offline.runner.start(), /Connect WhatsApp/);

  const h = harness({ items: [item(1)] });
  h.runner.start();
  assert.throws(() => h.runner.start(), /already active/);
  await h.finished();
});

test("stop() aborts during the cooldown", async () => {
  const items = [item(1), item(2), item(3)];
  let runner;
  const h = harness({
    items,
    sendResults: {
      [items[0].phoneNumber]: () => {
        runner.stop();
        return sent();
      },
    },
  });
  runner = h.runner;
  h.runner.start();
  const state = await h.finished();
  assert.equal(state.stoppedReason, "Stopped by user");
  assert.equal(state.sent, 1);
  assert.equal(h.pendingIds.size, 2);
});

test("only sends the requested broadcast", async () => {
  const h = harness({ items: [item(1, "b1"), item(2, "b2"), item(3, "b1")] });
  h.runner.start("b1");
  const state = await h.finished();
  assert.equal(state.sent, 2);
  assert.deepEqual(h.log.claims, ["q1", "q3"]);
});

test("items that can no longer be claimed are passed over", async () => {
  const h = harness({
    items: [item(1), item(2)],
    queue: { claim: async (id) => id !== "q1" },
  });
  h.runner.start();
  const state = await h.finished();
  // q2 stays "pending" in this fake, so the runner must not loop on it forever.
  assert.equal(state.sent, 1);
  assert.equal(state.processed, 1);
});

test("picks up items queued while the run is in progress", async () => {
  const items = [item(1)];
  const h = harness({ items });
  const late = item(2);
  let added = false;
  h.runner = new SendRunner({
    queue: {
      pending: async () => {
        const list = items.filter((i) => h.pendingIds.has(i.id));
        return { items: list, totalPending: list.length };
      },
      claim: async (id) => h.pendingIds.delete(id),
      result: async () => {},
      recover: async () => {},
    },
    limits: { sentToday: () => 0, sentLastHour: () => 0, record: () => {} },
    isReady: () => true,
    send: async () => {
      if (!added) {
        added = true;
        items.push(late);
        h.pendingIds.add(late.id);
      }
      return sent();
    },
    getSettings: () => DEFAULT_SETTINGS,
    delay: async () => {},
    random: () => 0,
  });
  h.runner.start();
  let state = h.runner.getState();
  while (state.phase !== "completed" && state.phase !== "error") {
    await new Promise((resolve) => setImmediate(resolve));
    state = h.runner.getState();
  }
  assert.equal(state.sent, 2);
});

test("a result that cannot be recorded stops the run and is flushed next time", async () => {
  let failReports = true;
  const reported = [];
  const h = harness({
    items: [item(1), item(2)],
    queue: {
      result: async (id, result) => {
        if (failReports) throw new Error("API down");
        reported.push({ id, status: result.status });
      },
    },
  });
  h.runner.start();
  const first = await h.finished();
  assert.equal(first.phase, "error");
  assert.match(first.error, /Could not record the send result: API down/);
  assert.equal(h.log.sends.length, 1, "does not keep sending unrecorded messages");

  failReports = false;
  h.runner.start();
  const second = await h.finished();
  assert.equal(second.phase, "completed");
  assert.deepEqual(reported, [
    { id: "q1", status: "SENT" },
    { id: "q2", status: "SENT" },
  ]);
});

test("an unreachable API ends the run in the error phase", async () => {
  const h = harness({
    items: [item(1)],
    queue: {
      pending: async () => {
        throw new Error("Could not reach the Whamail API (ECONNREFUSED)");
      },
    },
  });
  h.runner.start();
  const state = await h.finished();
  assert.equal(state.phase, "error");
  assert.match(state.error, /Could not reach/);
});
