"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { VAR_LABELS, type Prompt } from "@/features/mau-video/data/prompts";
import { copyText } from "@/features/mau-video/copy";
import { fillPrompt, splitPrompt } from "@/features/mau-video/prompts";
import { categoryById, platformById } from "@/features/mau-video/taxonomy";
import { useToast } from "@/features/mau-video/components/Toast";

export function PromptDetail({ p }: { p: Prompt }) {
  const cat = categoryById(p.category)!;
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const keys = Object.keys(p.vars ?? {});

  const copy = async () => {
    try {
      await copyText(fillPrompt(p, values));
      setDone(true);
      toast("Đã sao chép prompt");
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast("Không sao chép được, hãy bôi đen và chép thủ công");
    }
  };

  return (
    <article className="mv-detail">
      <div className="mv-dlg-head">
        <div className="mv-ico" style={{ "--cat-color": cat.color } as CSSProperties}><cat.Icon size={20} aria-hidden /></div>
        <div className="mv-grow">
          <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{p.title}</h1>
          <p>{p.desc}</p>
        </div>
      </div>

      <div className="mv-dlg-body">
        {p.video && (
          <video className="mv-detail-video" src={p.video} poster={p.poster} controls loop muted playsInline preload="metadata" aria-label={`Video xem trước: ${p.title}`} />
        )}
        <div className="mv-dlg-meta">
          <span className="mv-plat" style={{ "--pc": cat.color } as CSSProperties}>{cat.name}</span>
          {p.platforms.map((id) => {
            const pl = platformById(id)!;
            return <span key={id} className="mv-plat" style={{ "--pc": pl.color } as CSSProperties}>{pl.name}</span>;
          })}
          <span className="mv-tag">Độ khó: {p.level}</span>
          {p.tags.map((t) => <span key={t} className="mv-tag">#{t}</span>)}
        </div>

        {keys.length > 0 && (
          <div>
            <div className="mv-sec-label">
              <span>Điền thông tin của bạn</span>
              <button type="button" className="mv-copy-mini" onClick={() => setValues({})}>Đặt lại</button>
            </div>
            <div className="mv-vars">
              {keys.map((k) => {
                const dflt = p.vars![k];
                const long = dflt.length > 45;
                const common = {
                  value: values[k] ?? dflt,
                  placeholder: dflt,
                  onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }))
                };
                return (
                  <label key={k}>
                    {VAR_LABELS[k] ?? k.replace(/_/g, " ")}
                    {long ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mv-sec-label"><span>Prompt</span></div>
          <pre className="mv-prompt-box">
            {splitPrompt(p, values).map((s, i) => (s.variable ? <mark key={i}>{s.text}</mark> : s.text))}
          </pre>
        </div>

        {p.tips && p.tips.length > 0 && (
          <div>
            <div className="mv-sec-label"><span>Mẹo sử dụng</span></div>
            <ul className="mv-tips">{p.tips.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}

        <div className="mv-dlg-actions">
          <button type="button" className={`mv-btn-primary${done ? " is-done" : ""}`} onClick={copy}>
            {done ? <Check size={16} /> : <Copy size={16} />}
            <span>{done ? "Đã sao chép" : "Sao chép prompt"}</span>
          </button>
          <span className="mv-open-links">
            {p.links?.map((l) => (
              <a key={l.url} className="mv-btn-secondary" href={l.url} target="_blank" rel="noopener">
                {l.label} <ExternalLink size={14} aria-hidden />
              </a>
            ))}
            {p.platforms.map((id) => {
              const pl = platformById(id)!;
              return (
                <a key={id} className="mv-btn-secondary" href={pl.url} target="_blank" rel="noopener">
                  Mở {pl.name} <ExternalLink size={14} aria-hidden />
                </a>
              );
            })}
          </span>
        </div>
      </div>
    </article>
  );
}
