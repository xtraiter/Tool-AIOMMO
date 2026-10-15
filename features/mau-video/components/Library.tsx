"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Prompt } from "@/features/mau-video/data/prompts";
import { searchPrompts, type SortKey } from "@/features/mau-video/prompts";
import { CATEGORIES, platformById, PLATFORMS, type CategoryId, type PlatformId } from "@/features/mau-video/taxonomy";
import { PromptCard } from "@/features/mau-video/components/PromptCard";

type Level = Prompt["level"];
const LEVELS: Level[] = ["Dễ", "Trung bình", "Nâng cao"];

type Props = {
  prompts: Prompt[];
  /** "category": chip là danh mục (trang chủ). "tag": chip là thẻ trong danh mục (trang danh mục). */
  chipMode: "category" | "tag";
};

export function Library({ prompts, chipMode }: Props) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [platform, setPlatform] = useState<PlatformId | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [sort, setSort] = useState<SortKey>("featured");

  // Phím tắt "/" để nhảy vào ô tìm kiếm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName ?? "";
      if (e.key !== "/" || /INPUT|TEXTAREA|SELECT/.test(tag)) return;
      e.preventDefault();
      document.getElementById("mv-list-search")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const chips = useMemo(() => {
    if (chipMode === "category") {
      return CATEGORIES.map((c) => ({ id: c.id as string, label: c.name, color: c.color, n: prompts.filter((p) => p.category === c.id).length })).filter((c) => c.n > 0);
    }
    const counts = new Map<string, number>();
    prompts.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi")).slice(0, 14).map(([t, n]) => ({ id: t, label: t.charAt(0).toUpperCase() + t.slice(1), color: undefined as string | undefined, n }));
  }, [prompts, chipMode]);

  const list = useMemo(() => {
    let out = prompts;
    if (chip) out = out.filter((p) => (chipMode === "category" ? p.category === (chip as CategoryId) : p.tags.includes(chip)));
    if (level) out = out.filter((p) => p.level === level);
    return searchPrompts(out, { q, platform, sort });
  }, [prompts, chip, chipMode, level, q, platform, sort]);

  const chipLabel = chip ? chips.find((c) => c.id === chip)?.label ?? chip : null;
  const hasFilter = !!(chip || platform || level || q);
  const clearAll = () => {
    setChip(null);
    setPlatform(null);
    setLevel(null);
    setQ("");
    const input = document.getElementById("mv-list-search") as HTMLInputElement | null;
    if (input) input.value = "";
  };

  return (
    <>
      <div className="mv-chips" role="group" aria-label={chipMode === "category" ? "Lọc theo danh mục" : "Lọc theo thẻ"}>
        <button type="button" className="mv-chip" aria-pressed={chip === null} onClick={() => setChip(null)}>Tất cả</button>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className="mv-chip"
            aria-pressed={chip === c.id}
            style={c.color ? ({ "--chip-color": c.color } as CSSProperties) : undefined}
            onClick={() => setChip(chip === c.id ? null : c.id)}
          >
            {c.color && <span className="mv-dot" />}
            {c.label}
          </button>
        ))}
      </div>

      <div className="mv-filterbar">
        <label className="mv-search">
          <Search size={18} aria-hidden />
          <input id="mv-list-search" type="search" placeholder="Tìm kiếm prompt, ví dụ: bán hàng, TikTok, thumbnail…" autoComplete="off" aria-label="Tìm kiếm prompt" onChange={(e) => setQ(e.target.value)} />
          <kbd>/</kbd>
        </label>
        <select className="mv-select" value={platform ?? ""} onChange={(e) => setPlatform((e.target.value || null) as PlatformId | null)} aria-label="Nền tảng">
          <option value="">Tất cả nền tảng</option>
          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="mv-select" value={level ?? ""} onChange={(e) => setLevel((e.target.value || null) as Level | null)} aria-label="Độ khó">
          <option value="">Mọi độ khó</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="mv-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sắp xếp">
          <option value="featured">Nổi bật</option>
          <option value="new">Mới nhất</option>
          <option value="az">A → Z</option>
        </select>
      </div>

      {hasFilter && (
        <div className="mv-active-filters">
          Lọc:
          {chipLabel && <button type="button" className="mv-fchip" onClick={() => setChip(null)}>{chipLabel} <X size={13} aria-hidden /></button>}
          {platform && <button type="button" className="mv-fchip" onClick={() => setPlatform(null)}>{platformById(platform)?.name} <X size={13} aria-hidden /></button>}
          {level && <button type="button" className="mv-fchip" onClick={() => setLevel(null)}>{level} <X size={13} aria-hidden /></button>}
          {q && <span className="mv-fchip" style={{ cursor: "default" }}>“{q}”</span>}
          <button type="button" className="mv-link-btn" onClick={clearAll}>Xóa</button>
        </div>
      )}

      <p className="mv-count" aria-live="polite">{list.length} prompt</p>

      <div className="mv-grid">
        {list.length ? (
          list.map((p) => <PromptCard key={p.id} p={p} />)
        ) : (
          <div className="mv-empty">
            <b>Chưa tìm thấy prompt phù hợp</b>
            Thử đổi từ khóa hoặc bỏ bớt bộ lọc.
          </div>
        )}
      </div>
    </>
  );
}
