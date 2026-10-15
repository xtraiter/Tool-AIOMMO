"use client";

import { Bookmark } from "lucide-react";
import { useSaved } from "@/features/mau-video/saved";
import { useToast } from "@/features/mau-video/components/Toast";

export function BookmarkButton({ id, title }: { id: string; title: string }) {
  const { has, toggle } = useSaved();
  const toast = useToast();
  const saved = has(id);
  return (
    <button
      type="button"
      className="mv-bm"
      aria-pressed={saved}
      aria-label={saved ? `Bỏ lưu ${title}` : `Lưu ${title}`}
      title={saved ? "Bỏ lưu" : "Lưu để dùng sau"}
      onClick={() => {
        toggle(id);
        toast(saved ? "Đã bỏ lưu" : "Đã lưu, xem ở mục Đã lưu");
      }}
    >
      <Bookmark size={16} fill={saved ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}
