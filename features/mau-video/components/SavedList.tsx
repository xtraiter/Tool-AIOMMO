"use client";

import Link from "next/link";
import type { Prompt } from "@/features/mau-video/data/prompts";
import { useSaved } from "@/features/mau-video/saved";
import { mvPath } from "@/features/mau-video/site";
import { PromptCard } from "@/features/mau-video/components/PromptCard";

export function SavedList({ prompts }: { prompts: Prompt[] }) {
  const { ids } = useSaved();
  const list = ids.map((id) => prompts.find((p) => p.id === id)).filter((p): p is Prompt => !!p);
  if (!list.length) {
    return (
      <div className="mv-empty">
        <b>Bạn chưa lưu prompt nào</b>
        Bấm biểu tượng đánh dấu trên mỗi thẻ prompt để lưu lại dùng sau.
        <div style={{ marginTop: 16 }}><Link className="mv-btn-primary" href={mvPath.home}>Xem thư viện</Link></div>
      </div>
    );
  }
  return (
    <>
      <p className="mv-count">{list.length} prompt</p>
      <div className="mv-grid">{list.map((p) => <PromptCard key={p.id} p={p} />)}</div>
    </>
  );
}
