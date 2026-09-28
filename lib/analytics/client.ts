import type { Device, NavSource, TrackEvent } from "@/lib/analytics/types";

// Browser side of the self-hosted analytics (server: lib/analytics/store.ts).
// Events are batched and sent to /api/track; nothing typed into inputs is ever
// recorded — clicks only carry the clicked button/link's own label.

const VID_KEY = "aio-vid";
const SESSION_KEY = "aio-session";
const SESSION_IDLE_MS = 30 * 60_000;
const FLUSH_DELAY_MS = 4_000;
const HEARTBEAT_MS = 30_000;
const CLICK_TARGET = "a,button,[role=button],[role=tab],label,summary,select,input,textarea,[data-track]";

let started = false;
let enabled = false;
let vid = "";
const queue: TrackEvent[] = [];
let flushTimer: number | undefined;
let flushedOnce = false;
let currentPage = "";
let visibleSince = 0;

function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function deviceClass(): Device {
  const w = window.innerWidth;
  return w < 768 ? "m" : w < 1100 ? "t" : "d";
}

function push(ev: TrackEvent) {
  if (!enabled) return;
  queue.push(ev);
  touchSession();
  if (queue.length >= 40) flush();
  // The first batch goes out right away so the visitor counts as online at once.
  else if (flushTimer === undefined) flushTimer = window.setTimeout(flush, flushedOnce ? FLUSH_DELAY_MS : 300);
}

function flush(useBeacon = false) {
  if (flushTimer !== undefined) {
    window.clearTimeout(flushTimer);
    flushTimer = undefined;
  }
  if (!queue.length) return;
  flushedOnce = true;
  const body = JSON.stringify({ vid, ev: queue.splice(0, 50) });
  if (useBeacon && navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
  fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
}

function touchSession() {
  try {
    localStorage.setItem(SESSION_KEY, String(Date.now()));
  } catch {}
}

/** A new "visit" starts after 30 minutes without activity in any tab of this browser. */
function isNewSession() {
  try {
    const last = Number(localStorage.getItem(SESSION_KEY));
    return !last || Date.now() - last > SESSION_IDLE_MS;
  } catch {
    return true;
  }
}

function flushTime() {
  if (!currentPage || !visibleSince) return;
  const ms = Date.now() - visibleSince;
  visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
  if (ms > 500) push({ t: "time", page: currentPage, ms });
}

function clickLabel(el: Element) {
  const node = el as HTMLElement;
  if (node.dataset.track) return node.dataset.track;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    // Never the field's value — just what kind of control it is.
    const kind = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase();
    return `[${kind}] ${el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || ""}`.trim();
  }
  const text = node.getAttribute("aria-label") || node.innerText || node.getAttribute("title") || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 40) || el.tagName.toLowerCase();
}

function onClick(e: MouseEvent) {
  if (!currentPage) return;
  const doc = document.documentElement;
  const width = doc.scrollWidth || window.innerWidth;
  const target = (e.target as Element | null)?.closest?.(CLICK_TARGET);
  push({
    t: "click",
    page: currentPage,
    x: Math.round((e.pageX / width) * 1000) / 1000,
    y: Math.round(e.pageY),
    dev: deviceClass(),
    label: target ? clickLabel(target) : undefined
  });
}

/** Starts tracking for this tab. Safe to call more than once. */
export function initAnalytics(entryPage: string) {
  if (started || typeof window === "undefined") return;
  started = true;
  // Skip pages embedded in an iframe (e.g. the heatmap preview on /thong-ke) and automation.
  enabled = window.self === window.top && !navigator.webdriver;
  if (!enabled) return;

  let newVisitor = false;
  try {
    vid = localStorage.getItem(VID_KEY) || "";
    if (!vid) {
      vid = randomId();
      newVisitor = true;
      localStorage.setItem(VID_KEY, vid);
    }
  } catch {
    vid = randomId();
  }

  if (isNewSession()) {
    let ref = "";
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      if (host && host !== location.hostname) ref = host.replace(/^www\./, "");
    } catch {}
    push({ t: "visit", entry: entryPage, dev: deviceClass(), ref, nv: newVisitor });
  } else {
    push({ t: "ping", page: entryPage });
  }

  document.addEventListener("click", onClick, { capture: true, passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushTime();
      flush(true);
    } else {
      visibleSince = Date.now();
      push({ t: "ping", page: currentPage });
    }
  });

  window.addEventListener("pagehide", () => {
    flushTime();
    queue.push({ t: "bye" });
    flush(true);
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible") push({ t: "ping", page: currentPage });
  }, HEARTBEAT_MS);
}

/** Records opening `page` ("home" or a feature slug) and closes the timer on the previous one. */
export function trackView(page: string, src: NavSource) {
  if (!enabled || page === currentPage) return;
  flushTime();
  push({ t: "view", page, from: currentPage || undefined, src });
  currentPage = page;
  visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
}

export function trackSearch(q: string, resultCount: number) {
  push({ t: "search", q, n: resultCount });
}
