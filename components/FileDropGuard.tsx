"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useUiPreferences } from "@/lib/uiPreferences";

const ZONE = ".tool-dropzone";

function hasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Page-wide file drag & drop for every tool:
 * - a file dropped anywhere on the page goes to the open tool's drop zone,
 *   instead of the browser (Chrome/Edge on Windows) opening the file and
 *   leaving the site;
 * - the drop zone lights up and an overlay shows while a file is dragged;
 * - "virtual" files the browser can't read (dragged out of a ZIP in Windows
 *   Explorer, from Zalo/Telegram...) get an explanation instead of silence.
 */
export function FileDropGuard() {
  const { locale } = useUiPreferences();
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<number | undefined>(undefined);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  useEffect(() => {
    let depth = 0;
    const zones = () => Array.from(document.querySelectorAll<HTMLElement>(ZONE)).filter((z) => z.offsetParent !== null);
    const clear = () => {
      depth = 0;
      setDragging(false);
      document.querySelectorAll(ZONE).forEach((z) => z.classList.remove("is-dragover"));
    };
    const showNotice = (text: string) => {
      setNotice(text);
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(""), 6000);
    };

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      const list = zones();
      setDragging(list.length > 0);
      list.forEach((z) => z.classList.add("is-dragover"));
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) clear();
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Always cancel, so the browser never navigates away to the dropped file.
      e.preventDefault();
      if (e.dataTransfer && !e.defaultPrevented) e.dataTransfer.dropEffect = zones().length ? "copy" : "none";
    };
    // Bubble phase on window: runs after the tools' own React handlers.
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      clear();
      const files = e.dataTransfer?.files;
      if (!files?.length) {
        e.preventDefault();
        showNotice(
          localeRef.current === "en"
            ? "The browser couldn't read the dropped file. If it comes from inside a ZIP or a chat app, save it to your computer first, then drop it again — or click the box to choose it."
            : "Trình duyệt không đọc được tệp vừa thả. Nếu tệp nằm trong file ZIP hoặc kéo từ Zalo/Telegram, hãy lưu ra máy trước rồi kéo lại — hoặc bấm vào khung để chọn tệp."
        );
        return;
      }
      if (e.defaultPrevented) return; // a tool's drop zone already took it
      e.preventDefault();
      const zone = zones()[0];
      if (!zone) return;
      zone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: e.dataTransfer }));
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.clearTimeout(noticeTimer.current);
    };
  }, []);

  return (
    <>
      {dragging && (
        <div className="fdg-overlay" aria-hidden>
          <div>
            <UploadCloud size={34} />
            <span>{locale === "en" ? "Drop the file anywhere to open it in this tool" : "Thả tệp vào bất kỳ đâu để mở trong công cụ này"}</span>
          </div>
        </div>
      )}
      {notice && (
        <div className="fdg-notice" role="alert" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}
    </>
  );
}
