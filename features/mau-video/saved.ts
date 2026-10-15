"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Danh sách prompt đã lưu, lưu trong trình duyệt của từng người (không cần đăng nhập).
const KEY = "aio-tpl-saved";
const EVENT = "aio-tpl-saved-change";

// Snapshot là chuỗi thô để tham chiếu ổn định giữa các lần render (yêu cầu của useSyncExternalStore).
const snapshot = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

function parse(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useSaved() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const ids = useMemo(() => parse(raw), [raw]);
  const toggle = useCallback((id: string) => {
    const cur = parse(snapshot());
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* chế độ riêng tư hoặc bị chặn lưu trữ: bỏ qua */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { ids, toggle, has: (id: string) => ids.includes(id) };
}
