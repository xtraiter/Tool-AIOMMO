"use client";

import { useEffect } from "react";

// Tiny cross-component signal so the ambient particle background (mounted once,
// globally, in AppShell) can pause itself while any tool page is mid-export —
// FFmpeg/ONNX work is CPU-heavy and shouldn't compete with a decorative canvas.
let busyCount = 0;
const listeners = new Set<(busy: boolean) => void>();

export function setBackgroundBusy(active: boolean) {
  busyCount = Math.max(0, busyCount + (active ? 1 : -1));
  const busy = busyCount > 0;
  listeners.forEach((fn) => fn(busy));
}

export function isBackgroundBusy() {
  return busyCount > 0;
}

export function subscribeBackgroundBusy(fn: (busy: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Call with a tool's own `busy`/export-in-progress flag to pause the ambient background while it's true. */
export function useBackgroundBusy(active: boolean) {
  useEffect(() => {
    if (!active) return;
    setBackgroundBusy(true);
    return () => setBackgroundBusy(false);
  }, [active]);
}
