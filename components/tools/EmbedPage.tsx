"use client";

import type { ComponentType } from "react";
import { LayoutTemplate } from "lucide-react";
import "./tool-page.css";
import "./embed-page.css";

type Props = {
  icon: ComponentType<{ size?: number }>;
  title: string;
  subtitle: string;
  // Leave empty for now — fill in with a real URL once you have one, and this
  // page will render it as an embedded iframe automatically.
  src?: string;
};

export function EmbedPage({ icon: Icon, title, subtitle, src }: Props) {
  return (
    <div className="tool-page">
      <h1><Icon size={22} /> {title}</h1>
      <p className="tool-subtitle">{subtitle}</p>

      {src ? (
        <div className="embed-frame-wrap">
          <iframe src={src} className="embed-frame" title={title} loading="lazy" />
        </div>
      ) : (
        <div className="embed-empty">
          <LayoutTemplate size={36} />
          <div className="embed-empty-title">Nội dung sẽ sớm được nhúng vào đây</div>
          <div className="embed-empty-hint">Trang này sẽ hiển thị trực tiếp nội dung hướng dẫn khi được cấu hình.</div>
        </div>
      )}
    </div>
  );
}
