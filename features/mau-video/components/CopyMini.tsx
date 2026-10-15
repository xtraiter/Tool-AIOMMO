"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/features/mau-video/copy";
import { useToast } from "@/features/mau-video/components/Toast";

/** Nút nhỏ trên card: sao chép nhanh prompt (đã điền giá trị mẫu). */
export function CopyMini({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="mv-copy-mini"
      aria-label={`Sao chép prompt ${label}`}
      onClick={async () => {
        try {
          await copyText(text);
          setDone(true);
          toast("Đã sao chép prompt");
          setTimeout(() => setDone(false), 1600);
        } catch {
          toast("Không sao chép được, hãy mở chi tiết để chép thủ công");
        }
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      <span>{done ? "Đã chép" : "Chép"}</span>
    </button>
  );
}
