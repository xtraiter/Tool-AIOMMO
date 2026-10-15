"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 1800);
  }, []);
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div className={`mv-toast${show ? " show" : ""}`} role="status" aria-live="polite">{msg}</div>
    </ToastCtx.Provider>
  );
}
