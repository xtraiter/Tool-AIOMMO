"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, KeyRound, Lightbulb, LogOut, RefreshCw } from "lucide-react";
import { DEFAULT_LOCAL_FEATURES, featureBySlug, isExternalFeature, pathForSlug } from "@/lib/features";
import { categoryLabel } from "@/lib/uiPreferences";
import "./analytics-dashboard.css";

// Admin view over lib/analytics/store.ts. Protected by ANALYTICS_ADMIN_KEY;
// the key is kept in this browser only.

type Pair = [string, number];

type Summary = {
  generatedAt: number;
  rangeDays: number;
  total: { visits: number; views: number };
  online: number;
  onlinePages: Pair[];
  today: { visits: number; uniques: number; views: number };
  range: { visits: number; views: number; newVisitors: number };
  series: { day: string; visits: number; uniques: number; views: number }[];
  pages: { page: string; views: number; avgMs: number }[];
  flows: { from: string; to: string; n: number }[];
  sources: Pair[];
  devices: Pair[];
  referrers: Pair[];
  entries: Pair[];
  searches: { q: string; n: number; zero: number }[];
  zeroSearches: { q: string; n: number; zero: number }[];
  clicks: Record<string, Pair[]>;
  heatPages: { page: string; devices: Record<string, number> }[];
};

type Heat = { xBuckets: number; yPx: number; cells: [number, number, number][] };

const KEY_STORAGE = "aio-stats-key";
const RANGES = [
  { days: 1, label: "Hôm nay" },
  { days: 7, label: "7 ngày" },
  { days: 30, label: "30 ngày" },
  { days: 90, label: "90 ngày" }
];

const SOURCE_LABELS: Record<string, string> = {
  card: "Thẻ công cụ ở trang chủ",
  search: "Ô tìm kiếm trang chủ",
  menu: "Menu trên cùng (máy tính)",
  sheet: "Menu dưới cùng (điện thoại)",
  crumb: "Breadcrumb / nút Quay lại",
  direct: "Vào thẳng link (Google, chia sẻ, bookmark)",
  back: "Nút Back / vuốt quay lại",
  link: "Link bên trong công cụ khác"
};

const DEVICE_LABELS: Record<string, string> = { m: "Điện thoại", t: "Máy tính bảng", d: "Máy tính" };
// Width the heatmap preview is rendered at for each device class (see deviceClass()).
const DEVICE_WIDTH: Record<string, number> = { m: 390, t: 820, d: 1366 };

const fmt = new Intl.NumberFormat("vi-VN");
const n = (v: number) => fmt.format(v);
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");

function pageName(page: string) {
  if (page === "home") return "Trang chủ";
  return featureBySlug(page)?.name ?? page;
}

function duration(ms: number) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} phút ${s % 60 ? `${s % 60}s` : ""}`.trim() : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

function readKey() {
  try { return localStorage.getItem(KEY_STORAGE) ?? ""; } catch { return ""; }
}

function writeKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {}
}

async function fetchAdmin<T>(key: string, query: string): Promise<T> {
  const res = await fetch(`/api/stats/admin?${query}`, { headers: { "x-admin-key": key }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Lỗi ${res.status}`), { status: res.status });
  return body as T;
}

/* ---------- small building blocks ---------- */

function Panel({ title, hint, children, wide }: { title: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`ad-panel ${wide ? "is-wide" : ""}`}>
      <header>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Empty({ children = "Chưa có dữ liệu trong khoảng thời gian này." }: { children?: React.ReactNode }) {
  return <p className="ad-empty">{children}</p>;
}

/** Ranked list with an inline magnitude bar (single hue — it only encodes size). */
function BarList({ rows, total }: { rows: { key: string; label: React.ReactNode; value: number; extra?: React.ReactNode }[]; total?: number }) {
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ol className="ad-barlist">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="ad-barlist-row">
            <span className="ad-barlist-label">{r.label}</span>
            <span className="ad-barlist-value">
              {n(r.value)}
              {total ? <small> · {pct(r.value, total)}</small> : null}
              {r.extra}
            </span>
          </div>
          <span className="ad-barlist-track"><span style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></span>
        </li>
      ))}
    </ol>
  );
}

function VisitsChart({ series }: { series: Summary["series"] }) {
  const max = Math.max(1, ...series.map((d) => d.visits));
  const [hover, setHover] = useState<number | null>(null);
  const labelEvery = Math.ceil(series.length / 8);
  return (
    <div className="ad-chart">
      <div className="ad-chart-axis"><span>{n(max)}</span><span>0</span></div>
      <div className="ad-chart-plot" onMouseLeave={() => setHover(null)}>
        {series.map((d, i) => (
          <div
            key={d.day}
            className={`ad-chart-col ${hover === i ? "is-hover" : ""}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={0}
            aria-label={`${shortDay(d.day)}: ${d.visits} lượt truy cập, ${d.uniques} người dùng, ${d.views} lượt xem trang`}
          >
            <span className="ad-chart-bar" style={{ height: `${(d.visits / max) * 100}%` }} />
            {hover === i && (
              <div className={`ad-chart-tip ${i > series.length / 2 ? "is-left" : ""}`}>
                <b>{shortDay(d.day)}</b>
                <span>Lượt truy cập: <b>{n(d.visits)}</b></span>
                <span>Người dùng: <b>{n(d.uniques)}</b></span>
                <span>Lượt xem trang: <b>{n(d.views)}</b></span>
              </div>
            )}
            <span className="ad-chart-x">{i % labelEvery === 0 || i === series.length - 1 ? shortDay(d.day) : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ adminKey, pages }: { adminKey: string; pages: Summary["heatPages"] }) {
  const options = useMemo(
    () => [...pages].sort((a, b) => sum(b.devices) - sum(a.devices)),
    [pages]
  );
  const [picked, setPage] = useState(options[0]?.page ?? "home");
  const page = options.some((o) => o.page === picked) ? picked : options[0]?.page ?? "home";
  const [dev, setDev] = useState("d");
  const [heat, setHeat] = useState<Heat | null>(null);
  const [error, setError] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetchAdmin<Heat>(adminKey, `heat=${encodeURIComponent(page)}&dev=${dev}`)
      .then((h) => { if (!cancelled) { setHeat(h); setError(""); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [adminKey, page, dev]);

  const width = DEVICE_WIDTH[dev];
  const maxY = heat?.cells.reduce((m, [, y]) => Math.max(m, y), 0) ?? 0;
  const height = Math.min(12_000, Math.max(1400, (maxY + 1) * (heat?.yPx ?? 20) + 400));
  const clicks = heat?.cells.reduce((a, [, , c]) => a + c, 0) ?? 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  // Classic heatmap: accumulate soft blobs as alpha, then tint that alpha with a
  // single sequential hue so "hotter" simply reads as more intense.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heat) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const max = Math.max(1, ...heat.cells.map(([, , c]) => c));
    const radius = dev === "m" ? 22 : 30;
    for (const [x, y, c] of heat.cells) {
      const cx = ((x + 0.5) / heat.xBuckets) * width;
      const cy = (y + 0.5) * heat.yPx;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      const a = 0.18 + 0.82 * Math.sqrt(c / max);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
    const img = ctx.getImageData(0, 0, width, height);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      const alpha = px[i + 3] / 255;
      if (!alpha) continue;
      // light → dark red-orange as intensity rises
      px[i] = 255 - 40 * alpha;
      px[i + 1] = 150 - 120 * alpha;
      px[i + 2] = 60 - 40 * alpha;
      px[i + 3] = Math.min(235, 60 + alpha * 200);
    }
    ctx.putImageData(img, 0, 0);
  }, [heat, width, height, dev]);

  if (!options.length) return <Empty>Chưa có lượt click nào được ghi nhận.</Empty>;

  const devicesForPage = options.find((o) => o.page === page)?.devices ?? {};

  return (
    <div className="ad-heat">
      <div className="ad-filters">
        <select value={page} onChange={(e) => setPage(e.target.value)} aria-label="Trang">
          {options.map((o) => (
            <option key={o.page} value={o.page}>{pageName(o.page)} ({n(sum(o.devices))} click)</option>
          ))}
        </select>
        <div className="ad-seg" role="tablist" aria-label="Thiết bị">
          {Object.entries(DEVICE_LABELS).map(([d, label]) => (
            <button key={d} type="button" role="tab" aria-selected={dev === d} className={dev === d ? "is-active" : ""} onClick={() => setDev(d)}>
              {label} <small>{n(devicesForPage[d] ?? 0)}</small>
            </button>
          ))}
        </div>
        <span className="ad-muted">{n(clicks)} click · xem ở chiều rộng {width}px</span>
      </div>
      {error && <p className="ad-error">{error}</p>}
      <div className="ad-heat-frame" ref={wrapRef}>
        <div style={{ width: width * scale, height: height * scale }} className="ad-heat-clip">
          <div style={{ width, height, transform: `scale(${scale})` }} className="ad-heat-stage">
            <iframe key={`${page}:${dev}`} src={page === "home" ? "/" : pathForSlug(page)} title={`Xem trước ${pageName(page)}`} width={width} height={height} tabIndex={-1} />
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
      <p className="ad-muted ad-heat-note">
        Vùng càng đỏ đậm càng được bấm nhiều. Vị trí được ghi theo % chiều rộng trang và toạ độ dọc (px), nên với
        các công cụ có giao diện thay đổi sau khi tải file lên, điểm nóng có thể lệch nhẹ so với ảnh xem trước.
      </p>
    </div>
  );
}

function sum(rec: Record<string, number>) {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

/** Plain-language takeaways computed from the numbers, as a starting point for UX work. */
function Insights({ s }: { s: Summary }) {
  const tips: string[] = [];
  const tools = s.pages.filter((p) => p.page !== "home");
  const toolViews = tools.reduce((a, p) => a + p.views, 0);
  if (tools[0]) {
    const top3 = tools.slice(0, 3).map((p) => pageName(p.page)).join(", ");
    tips.push(`Công cụ được mở nhiều nhất: ${top3}. Nên đưa các công cụ này lên đầu trang chủ / menu để người dùng thấy ngay.`);
  }
  const unused = DEFAULT_LOCAL_FEATURES.filter((f) => !isExternalFeature(f) && !tools.some((p) => p.page === f.slug));
  if (toolViews > 50 && unused.length) {
    tips.push(`${unused.length} công cụ chưa được mở lần nào trong kỳ (${unused.slice(0, 4).map((f) => f.name).join(", ")}${unused.length > 4 ? "…" : ""}) — xem lại tên gọi, mô tả hoặc vị trí hiển thị.`);
  }
  const srcTotal = s.sources.reduce((a, [, v]) => a + v, 0);
  const search = s.sources.find(([k]) => k === "search")?.[1] ?? 0;
  if (srcTotal && search / srcTotal > 0.2) {
    tips.push(`${pct(search, srcTotal)} lượt mở công cụ đến từ ô tìm kiếm — người dùng đang phải tìm, cân nhắc làm nổi bật ô tìm kiếm hoặc sắp xếp lại danh mục.`);
  }
  const direct = s.sources.find(([k]) => k === "direct")?.[1] ?? 0;
  if (srcTotal && direct / srcTotal > 0.4) {
    tips.push(`${pct(direct, srcTotal)} lượt vào thẳng link công cụ (Google / chia sẻ) — đường dẫn ngắn đang phát huy tác dụng, nên gợi ý thêm công cụ liên quan ngay trong trang công cụ.`);
  }
  if (s.zeroSearches.length) {
    tips.push(`Có ${s.zeroSearches.length} từ khóa tìm không ra kết quả (vd: "${s.zeroSearches.slice(0, 3).map((q) => q.q).join('", "')}") — ý tưởng cho công cụ mới hoặc thêm từ khóa vào mô tả.`);
  }
  const mobile = s.devices.find(([k]) => k === "m")?.[1] ?? 0;
  const devTotal = s.devices.reduce((a, [, v]) => a + v, 0);
  if (devTotal && mobile / devTotal > 0.5) {
    tips.push(`${pct(mobile, devTotal)} lượt truy cập từ điện thoại — ưu tiên kiểm thử và tối ưu giao diện di động.`);
  }
  const quick = tools.filter((p) => p.views >= 10 && p.avgMs > 0 && p.avgMs < 15_000);
  if (quick.length) {
    tips.push(`Người dùng rời ${quick.slice(0, 3).map((p) => pageName(p.page)).join(", ")} sau chưa đến 15 giây — có thể họ không hiểu cách dùng hoặc công cụ không đúng kỳ vọng.`);
  }
  if (!tips.length) return <Empty>Cần thêm dữ liệu để đưa ra gợi ý.</Empty>;
  return (
    <ul className="ad-insights">
      {tips.map((t) => <li key={t}><Lightbulb size={15} /> <span>{t}</span></li>)}
    </ul>
  );
}

/* ---------- page ---------- */

export function AnalyticsDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [clickPage, setClickPage] = useState("home");

  useEffect(() => { setAdminKey(readKey()); }, []);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    try {
      const summary = await fetchAdmin<Summary>(adminKey, `days=${days}`);
      setData(summary);
      setError("");
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        writeKey("");
        setAdminKey("");
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [adminKey, days]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!adminKey) {
    return (
      <main className="ad-page ad-login">
        <form
          className="ad-panel"
          onSubmit={(e) => {
            e.preventDefault();
            const key = keyInput.trim();
            if (!key) return;
            writeKey(key);
            setAdminKey(key);
          }}
        >
          <h1><KeyRound size={20} /> Thống kê hành vi người dùng</h1>
          <p className="ad-muted">Nhập khóa quản trị (biến <code>ANALYTICS_ADMIN_KEY</code> trên server).</p>
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Khóa quản trị" autoFocus />
          {error && <p className="ad-error">{error}</p>}
          <button type="submit" className="ad-btn-primary">Xem thống kê</button>
        </form>
      </main>
    );
  }

  const s = data;
  const toolPages = s?.pages.filter((p) => p.page !== "home") ?? [];
  const toolViews = toolPages.reduce((a, p) => a + p.views, 0);
  const clickPages = s ? Object.keys(s.clicks).sort((a, b) => sum(Object.fromEntries(s.clicks[b])) - sum(Object.fromEntries(s.clicks[a]))) : [];
  const shownClickPage = clickPages.includes(clickPage) ? clickPage : clickPages[0];

  return (
    <main className="ad-page">
      <header className="ad-top">
        <div>
          <h1>Thống kê hành vi người dùng</h1>
          <p className="ad-muted">
            tool.allinonemmo.com · {s ? `cập nhật ${new Date(s.generatedAt).toLocaleTimeString("vi-VN")}` : "đang tải…"}
          </p>
        </div>
        <div className="ad-top-actions">
          <div className="ad-seg" role="tablist" aria-label="Khoảng thời gian">
            {RANGES.map((r) => (
              <button key={r.days} type="button" role="tab" aria-selected={days === r.days} className={days === r.days ? "is-active" : ""} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className="ad-icon-btn" onClick={() => void load()} aria-label="Tải lại" title="Tải lại">
            <RefreshCw size={16} className={loading ? "ad-spin" : ""} />
          </button>
          <button type="button" className="ad-icon-btn" onClick={() => { writeKey(""); setAdminKey(""); setData(null); }} aria-label="Đăng xuất" title="Đăng xuất">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {error && <p className="ad-error">{error}</p>}

      {s && (
        <>
          <div className="ad-kpis">
            <div className="ad-kpi is-live">
              <span>Đang truy cập</span>
              <b><i className="ad-live-dot" aria-hidden />{n(s.online)}</b>
              <small>{s.onlinePages.slice(0, 2).map(([p, c]) => `${pageName(p)}: ${c}`).join(" · ") || "—"}</small>
            </div>
            <div className="ad-kpi">
              <span>Tổng lượt truy cập</span>
              <b>{n(s.total.visits)}</b>
              <small>từ trước đến nay</small>
            </div>
            <div className="ad-kpi">
              <span>Lượt truy cập ({RANGES.find((r) => r.days === days)?.label.toLowerCase()})</span>
              <b>{n(s.range.visits)}</b>
              <small>{n(s.range.newVisitors)} người dùng mới</small>
            </div>
            <div className="ad-kpi">
              <span>Hôm nay</span>
              <b>{n(s.today.visits)}</b>
              <small>{n(s.today.uniques)} người dùng · {n(s.today.views)} lượt xem</small>
            </div>
            <div className="ad-kpi">
              <span>Trang / lượt truy cập</span>
              <b>{s.range.visits ? (s.range.views / s.range.visits).toFixed(1) : "—"}</b>
              <small>{n(toolViews)} lượt mở công cụ</small>
            </div>
          </div>

          <div className="ad-grid">
            <Panel title="Gợi ý tối ưu" hint="Tự động rút ra từ số liệu bên dưới." wide>
              <Insights s={s} />
            </Panel>

            {days > 1 && (
              <Panel title="Lượt truy cập theo ngày" hint="Rê chuột lên cột để xem chi tiết." wide>
                <VisitsChart series={s.series} />
              </Panel>
            )}

            <Panel title="Công cụ được dùng nhiều nhất" hint="Số lượt mở và thời gian dùng trung bình mỗi lượt.">
              <BarList
                total={toolViews}
                rows={toolPages.slice(0, 15).map((p) => ({
                  key: p.page,
                  label: <>{pageName(p.page)} <small className="ad-muted">{categoryLabel(featureBySlug(p.page)?.category ?? "", "vi")}</small></>,
                  value: p.views,
                  extra: <small> · {duration(p.avgMs)}</small>
                }))}
              />
            </Panel>

            <Panel title="Luồng người dùng phổ biến" hint="Người dùng đi từ trang nào sang trang nào.">
              {s.flows.length ? (
                <ol className="ad-flows">
                  {s.flows.slice(0, 15).map((f) => (
                    <li key={`${f.from}>${f.to}`}>
                      <span>{pageName(f.from)}</span>
                      <ArrowRight size={13} />
                      <span>{pageName(f.to)}</span>
                      <b>{n(f.n)}</b>
                    </li>
                  ))}
                </ol>
              ) : <Empty />}
            </Panel>

            <Panel title="Người dùng mở công cụ bằng cách nào" hint="Lối vào nào đang được dùng — lối nào ít dùng có thể bỏ bớt.">
              <BarList
                total={s.sources.reduce((a, [, v]) => a + v, 0)}
                rows={s.sources.map(([k, v]) => ({ key: k, label: SOURCE_LABELS[k] ?? k, value: v }))}
              />
            </Panel>

            <Panel title="Nút / liên kết được bấm nhiều nhất">
              {clickPages.length ? (
                <>
                  <div className="ad-filters">
                    <select value={shownClickPage} onChange={(e) => setClickPage(e.target.value)} aria-label="Trang">
                      {clickPages.map((p) => <option key={p} value={p}>{pageName(p)}</option>)}
                    </select>
                  </div>
                  <BarList rows={(s.clicks[shownClickPage] ?? []).slice(0, 12).map(([k, v]) => ({ key: k, label: k, value: v }))} />
                </>
              ) : <Empty />}
            </Panel>

            <Panel title="Từ khóa tìm kiếm phổ biến">
              <BarList rows={s.searches.slice(0, 12).map((q) => ({ key: q.q, label: q.q, value: q.n }))} />
            </Panel>

            <Panel title="Tìm không ra kết quả" hint="Người dùng cần nhưng web chưa có — ý tưởng cho công cụ mới.">
              <BarList rows={s.zeroSearches.slice(0, 12).map((q) => ({ key: q.q, label: q.q, value: q.zero }))} />
            </Panel>

            <Panel title="Trang vào đầu tiên">
              <BarList total={s.entries.reduce((a, [, v]) => a + v, 0)} rows={s.entries.map(([k, v]) => ({ key: k, label: pageName(k), value: v }))} />
            </Panel>

            <Panel title="Nguồn truy cập">
              <BarList total={s.referrers.reduce((a, [, v]) => a + v, 0)} rows={s.referrers.map(([k, v]) => ({ key: k, label: k, value: v }))} />
            </Panel>

            <Panel title="Thiết bị">
              <BarList total={s.devices.reduce((a, [, v]) => a + v, 0)} rows={s.devices.map(([k, v]) => ({ key: k, label: DEVICE_LABELS[k] ?? k, value: v }))} />
            </Panel>

            <Panel title="Heatmap click" hint="Nơi người dùng bấm vào trên từng trang (cộng dồn từ trước đến nay)." wide>
              <Heatmap adminKey={adminKey} pages={s.heatPages} />
            </Panel>
          </div>
        </>
      )}
    </main>
  );
}
