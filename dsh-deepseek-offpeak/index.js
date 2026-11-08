/**
 * Host half of the DeepSeek off-peak clock.
 *
 * Every streaming model call passes through the `llm/stream` waterfall, so this
 * plugin stamps each call with its wall-clock time and whether that instant fell
 * inside a DeepSeek peak window. The browser HUD reads the last few days over
 * `GET /plugins/deepseek-offpeak/usage` and shows the calls that cost peak
 * rates; nothing is billed, priced, or sent anywhere else.
 *
 * Peak windows are defined in UTC by the DeepSeek price list:
 * 01:00–04:00 and 06:00–10:00, Monday–Friday.
 *
 * @module @local/dsh-deepseek-offpeak
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const name = "deepseek-offpeak";

const ROUTE = "/plugins/deepseek-offpeak/usage";
const WEB_SERVER_KEYS = ["webServer", "httpServer"];

/** Peak windows as UTC minutes-from-midnight. */
const PEAK_UTC_WINDOWS = [
  [60, 240],
  [360, 600],
];

const RETENTION_MS = 21 * 24 * 60 * 60 * 1000;
const MAX_CALLS = 4000;
const SAVE_DEBOUNCE_MS = 4000;
const MAX_DAYS = 30;

function isWeekendUtc(day) {
  return day === 0 || day === 6;
}

/** True when `at` sits inside a DeepSeek peak window (UTC weekdays only). */
export function isPeakAt(at) {
  const date = new Date(at);
  if (isWeekendUtc(date.getUTCDay())) return false;
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  return PEAK_UTC_WINDOWS.some(([start, end]) => minute >= start && minute < end);
}

function storageFile() {
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(home, "storages", "deepseek-offpeak", "calls.json");
}

function project(raw) {
  if (!Array.isArray(raw)) return null;
  const [at, peak, label] = raw;
  if (!Number.isFinite(at)) return null;
  return [at, peak === 1 ? 1 : 0, typeof label === "string" ? label.slice(0, 80) : ""];
}

async function loadCalls(file) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (!parsed || !Array.isArray(parsed.calls)) return [];
    return parsed.calls.map(project).filter(Boolean);
  } catch {
    // Missing or unreadable history is not an error: the widget still works,
    // it just has nothing to report until the next call is recorded.
    return [];
  }
}

function labelOf(options) {
  const provider = typeof options?.provider === "string" ? options.provider : "";
  const model = typeof options?.model === "string" ? options.model : "";
  if (provider && model) return `${provider}/${model}`;
  return provider || model || "unknown";
}

export function apply(ctx) {
  const file = storageFile();
  const calls = [];
  let loaded = false;
  let saveTimer = null;

  const flush = async () => {
    if (!loaded) return;
    const cutoff = Date.now() - RETENTION_MS;
    const kept = calls.filter((entry) => entry[0] >= cutoff).slice(-MAX_CALLS);
    calls.length = 0;
    calls.push(...kept);
    try {
      await mkdir(dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify({ version: 1, calls }), "utf8");
      await rename(tmp, file);
    } catch (error) {
      ctx.logger?.warn?.(`deepseek-offpeak: could not persist call history: ${String(error)}`);
    }
  };

  const scheduleSave = () => {
    if (saveTimer !== null) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
    saveTimer.unref?.();
  };

  const record = (options) => {
    const at = Date.now();
    calls.push([at, isPeakAt(at) ? 1 : 0, labelOf(options)]);
    scheduleSave();
  };

  void loadCalls(file).then((history) => {
    const recordedDuringLoad = calls.length;
    if (history.length > 0) calls.unshift(...history);
    loaded = true;
    // A call may already have arrived while the file was being read; keep the
    // history in front of it so the list stays sorted by time, and persist only
    // when that call is not yet on disk.
    if (recordedDuringLoad > 0) scheduleSave();
  });

  ctx.on("llm/stream", (options, next) => {
    try {
      record(options);
    } catch {
      // Observability must never break the model call it observes.
    }
    return next();
  });

  ctx.effect(
    () => () => {
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = null;
      void flush();
    },
    "deepseek-offpeak: flush call history",
  );

  let webRegistered = false;

  const registerWebSurface = () => {
    if (webRegistered) return;
    const webServer = ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1]);
    if (webServer === void 0) return;

    try {
      ctx.effect(
        () =>
          webServer.register({
            kind: "exact",
            path: ROUTE,
            handler: async (req, res) => {
              let days = 7;
              try {
                const requested = Number(new URL(req.url ?? ROUTE, "http://localhost").searchParams.get("days"));
                if (Number.isFinite(requested)) days = Math.min(MAX_DAYS, Math.max(1, Math.floor(requested)));
              } catch {
                days = 7;
              }
              const since = Date.now() - days * 24 * 60 * 60 * 1000;
              const body = JSON.stringify({
                ok: true,
                now: Date.now(),
                calls: calls.filter((entry) => entry[0] >= since),
              });
              res.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
              });
              res.end(body);
            },
          }),
        "deepseek-offpeak: usage route",
      );
      webRegistered = true;
    } catch (error) {
      ctx.logger?.warn?.(
        `deepseek-offpeak: could not register the usage route (another instance may own it): ${String(error)}`,
      );
    }
  };

  registerWebSurface();
  ctx.on("internal/service", (serviceName) => {
    if (WEB_SERVER_KEYS.includes(serviceName)) registerWebSurface();
  });
}

/** Pure helper exposed for tests and for reasoning about the shared window rule. */
export const _internals = { isPeakAt, PEAK_UTC_WINDOWS };
