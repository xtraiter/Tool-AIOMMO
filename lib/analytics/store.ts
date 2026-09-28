import { mkdirSync, readFileSync, renameSync } from "fs";
import { writeFile, rename } from "fs/promises";
import path from "path";
import { DEFAULT_LOCAL_FEATURES } from "@/lib/features";
import type { TrackEvent } from "@/lib/analytics/types";

// Self-hosted, privacy-friendly behaviour analytics. Everything is stored as
// per-day aggregates (counters) in one JSON file — no IPs, no raw event log —
// so the file stays small and there is nothing personal to leak. Fine for the
// single `next start` process this site runs as (see rateLimit.ts / jobs.ts).

type Counter = Record<string, number>;

type PageStat = { v: number; ms: number };

type Day = {
  visits: number;
  views: number;
  newVisitors: number;
  uniques: number;
  dev: Counter;
  ref: Counter;
  entry: Counter;
  pages: Record<string, PageStat>;
  flows: Counter;
  src: Counter;
  search: Record<string, { n: number; zero: number }>;
  clicks: Record<string, Counter>;
};

type Store = {
  v: 1;
  total: { visits: number; views: number };
  days: Record<string, Day>;
  // page -> device -> "x,y" bucket -> clicks (all-time)
  heat: Record<string, Record<string, Counter>>;
  uniq: { day: string; ids: string[] };
};

const DATA_DIR = process.env.ANALYTICS_DIR || path.join(process.cwd(), "data", "analytics");
const FILE = path.join(DATA_DIR, "stats.json");
const KEEP_DAYS = 120;
const ONLINE_WINDOW_MS = 75_000;
const SAVE_EVERY_MS = 5_000;

export const HEAT_X_BUCKETS = 50; // 2% of page width each
export const HEAT_Y_PX = 20;
const HEAT_MAX_Y_PX = 12_000;
const HEAT_MAX_CELLS = 30_000;

const KNOWN_PAGES = new Set(["home", ...DEFAULT_LOCAL_FEATURES.map((f) => f.slug)]);
const DEVICES = new Set(["m", "t", "d"]);
const SOURCES = new Set(["card", "search", "menu", "sheet", "crumb", "direct", "back", "link"]);

function emptyStore(): Store {
  return { v: 1, total: { visits: 0, views: 0 }, days: {}, heat: {}, uniq: { day: "", ids: [] } };
}

function emptyDay(): Day {
  return {
    visits: 0, views: 0, newVisitors: 0, uniques: 0,
    dev: {}, ref: {}, entry: {}, pages: {}, flows: {}, src: {}, search: {}, clicks: {}
  };
}

/** Calendar day in Vietnam time (UTC+7), e.g. "2026-09-28". */
export function dayKey(ts = Date.now()) {
  return new Date(ts + 7 * 3_600_000).toISOString().slice(0, 10);
}

function load(): Store {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Store;
    if (parsed?.v === 1 && parsed.total && parsed.days) return { ...emptyStore(), ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // Keep the unreadable file for inspection instead of silently overwriting it.
      try { renameSync(FILE, `${FILE}.bad-${Date.now()}`); } catch {}
      console.error("[analytics] could not read stats file, starting fresh:", err);
    }
  }
  return emptyStore();
}

type State = {
  store: Store;
  dirty: boolean;
  saving: boolean;
  uniqToday: Set<string>;
  online: Map<string, { ts: number; page: string }>;
};

const g = globalThis as unknown as { __aioAnalytics?: State };

function state(): State {
  if (g.__aioAnalytics) return g.__aioAnalytics;
  mkdirSync(DATA_DIR, { recursive: true });
  const store = load();
  const s: State = {
    store,
    dirty: false,
    saving: false,
    uniqToday: new Set(store.uniq.day === dayKey() ? store.uniq.ids : []),
    online: new Map()
  };
  g.__aioAnalytics = s;
  setInterval(() => { void save(s); }, SAVE_EVERY_MS).unref();
  return s;
}

async function save(s: State) {
  if (!s.dirty || s.saving) return;
  s.dirty = false;
  s.saving = true;
  try {
    s.store.uniq = { day: dayKey(), ids: [...s.uniqToday] };
    const tmp = `${FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(s.store));
    await rename(tmp, FILE);
  } catch (err) {
    s.dirty = true;
    console.error("[analytics] save failed:", err);
  } finally {
    s.saving = false;
  }
}

function today(s: State): Day {
  const key = dayKey();
  let day = s.store.days[key];
  if (!day) {
    day = s.store.days[key] = emptyDay();
    s.uniqToday = new Set();
    const cutoff = dayKey(Date.now() - KEEP_DAYS * 86_400_000);
    for (const k of Object.keys(s.store.days)) if (k < cutoff) delete s.store.days[k];
  }
  return day;
}

function bump(counter: Counter, key: string, by = 1, maxKeys = 500) {
  if (!(key in counter) && Object.keys(counter).length >= maxKeys) return;
  counter[key] = (counter[key] ?? 0) + by;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const page = (v: unknown) => (typeof v === "string" && KNOWN_PAGES.has(v) ? v : "");

export function record(vid: string, events: TrackEvent[]) {
  const s = state();
  const day = today(s);
  const now = Date.now();
  const visitor = vid.slice(0, 16);

  if (visitor && !s.uniqToday.has(visitor)) {
    s.uniqToday.add(visitor);
    day.uniques++;
  }

  for (const ev of events) {
    switch (ev?.t) {
      case "visit": {
        day.visits++;
        s.store.total.visits++;
        if (ev.nv === true) day.newVisitors++;
        if (DEVICES.has(ev.dev)) bump(day.dev, ev.dev);
        const entry = page(ev.entry);
        if (entry) bump(day.entry, entry);
        const ref = str(ev.ref, 80).toLowerCase();
        bump(day.ref, ref || "(trực tiếp)", 1, 200);
        break;
      }
      case "view": {
        const p = page(ev.page);
        if (!p) break;
        day.views++;
        s.store.total.views++;
        (day.pages[p] ??= { v: 0, ms: 0 }).v++;
        const from = page(ev.from);
        if (from && from !== p) bump(day.flows, `${from}>${p}`, 1, 2000);
        if (p !== "home") bump(day.src, ev.src && SOURCES.has(ev.src) ? ev.src : "direct");
        s.online.set(visitor, { ts: now, page: p });
        break;
      }
      case "time": {
        const p = page(ev.page);
        const ms = num(ev.ms);
        if (!p || !(ms > 0)) break;
        (day.pages[p] ??= { v: 0, ms: 0 }).ms += Math.min(ms, 2 * 3_600_000);
        break;
      }
      case "click": {
        const p = page(ev.page);
        const x = num(ev.x);
        const y = num(ev.y);
        if (!p) break;
        const label = str(ev.label, 40);
        if (label) bump((day.clicks[p] ??= {}), label, 1, 300);
        if (DEVICES.has(ev.dev) && x >= 0 && x <= 1 && y >= 0 && y < HEAT_MAX_Y_PX) {
          const cell = `${Math.min(HEAT_X_BUCKETS - 1, Math.floor(x * HEAT_X_BUCKETS))},${Math.floor(y / HEAT_Y_PX)}`;
          bump(((s.store.heat[p] ??= {})[ev.dev] ??= {}), cell, 1, HEAT_MAX_CELLS);
        }
        break;
      }
      case "search": {
        const q = str(ev.q, 60).toLowerCase().replace(/\s+/g, " ");
        const n = num(ev.n);
        if (q.length < 2) break;
        if (!(q in day.search) && Object.keys(day.search).length >= 500) break;
        const entry = (day.search[q] ??= { n: 0, zero: 0 });
        entry.n++;
        if (n === 0) entry.zero++;
        break;
      }
      case "ping": {
        const p = page(ev.page);
        if (visitor) s.online.set(visitor, { ts: now, page: p || s.online.get(visitor)?.page || "home" });
        break;
      }
      case "bye": {
        s.online.delete(visitor);
        break;
      }
    }
  }
  s.dirty = true;
}

function onlineVisitors(s: State) {
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  for (const [id, o] of s.online) if (o.ts < cutoff) s.online.delete(id);
  return s.online;
}

export function publicStats() {
  const s = state();
  return { totalVisits: s.store.total.visits, online: onlineVisitors(s).size };
}

function top(counter: Counter, limit: number) {
  return Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function merge(into: Counter, from: Counter) {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

export function adminSummary(rangeDays: number) {
  const s = state();
  today(s);
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) days.push(dayKey(Date.now() - i * 86_400_000));

  const agg = emptyDay();
  const series = days.map((key) => {
    const d = s.store.days[key];
    if (d) {
      agg.visits += d.visits;
      agg.views += d.views;
      agg.newVisitors += d.newVisitors;
      agg.uniques += d.uniques;
      merge(agg.dev, d.dev);
      merge(agg.ref, d.ref);
      merge(agg.entry, d.entry);
      merge(agg.flows, d.flows);
      merge(agg.src, d.src);
      for (const [p, st] of Object.entries(d.pages)) {
        const t = (agg.pages[p] ??= { v: 0, ms: 0 });
        t.v += st.v;
        t.ms += st.ms;
      }
      for (const [q, st] of Object.entries(d.search)) {
        const t = (agg.search[q] ??= { n: 0, zero: 0 });
        t.n += st.n;
        t.zero += st.zero;
      }
      for (const [p, c] of Object.entries(d.clicks)) merge((agg.clicks[p] ??= {}), c);
    }
    return { day: key, visits: d?.visits ?? 0, uniques: d?.uniques ?? 0, views: d?.views ?? 0 };
  });

  const online = onlineVisitors(s);
  const onlinePages: Counter = {};
  for (const o of online.values()) bump(onlinePages, o.page || "home");

  const searches = Object.entries(agg.search);
  const todayStats = s.store.days[dayKey()];

  return {
    generatedAt: Date.now(),
    rangeDays,
    total: s.store.total,
    online: online.size,
    onlinePages: top(onlinePages, 20),
    today: { visits: todayStats?.visits ?? 0, uniques: todayStats?.uniques ?? 0, views: todayStats?.views ?? 0 },
    range: { visits: agg.visits, views: agg.views, newVisitors: agg.newVisitors },
    series,
    pages: Object.entries(agg.pages)
      .map(([p, st]) => ({ page: p, views: st.v, avgMs: st.v ? Math.round(st.ms / st.v) : 0 }))
      .sort((a, b) => b.views - a.views),
    flows: top(agg.flows, 40).map(([k, n]) => {
      const [from, to] = k.split(">");
      return { from, to, n };
    }),
    sources: top(agg.src, 20),
    devices: top(agg.dev, 5),
    referrers: top(agg.ref, 15),
    entries: top(agg.entry, 15),
    searches: searches.sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([q, st]) => ({ q, ...st })),
    zeroSearches: searches.filter(([, st]) => st.zero > 0).sort((a, b) => b[1].zero - a[1].zero).slice(0, 30).map(([q, st]) => ({ q, ...st })),
    clicks: Object.fromEntries(Object.entries(agg.clicks).map(([p, c]) => [p, top(c, 20)])),
    heatPages: Object.entries(s.store.heat).map(([p, byDev]) => ({
      page: p,
      devices: Object.fromEntries(Object.entries(byDev).map(([d, cells]) => [d, Object.values(cells).reduce((a, b) => a + b, 0)]))
    }))
  };
}

export function heatmap(pageKey: string, dev: string) {
  const cells = state().store.heat[pageKey]?.[dev] ?? {};
  return {
    xBuckets: HEAT_X_BUCKETS,
    yPx: HEAT_Y_PX,
    cells: Object.entries(cells).map(([k, n]) => {
      const [x, y] = k.split(",").map(Number);
      return [x, y, n] as [number, number, number];
    })
  };
}
