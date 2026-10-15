import Link from "next/link";
import type { CSSProperties } from "react";
import { Crown } from "lucide-react";
import type { Prompt } from "@/features/mau-video/data/prompts";
import { fillPrompt } from "@/features/mau-video/prompts";
import { categoryById, platformById } from "@/features/mau-video/taxonomy";
import { mvPath } from "@/features/mau-video/site";
import { BookmarkButton } from "@/features/mau-video/components/BookmarkButton";
import { CopyMini } from "@/features/mau-video/components/CopyMini";
import { PreviewVideo } from "@/features/mau-video/components/PreviewVideo";

const MAX_PLATFORMS = 1;

/** Thẻ dạng poster: ảnh lớn (hoặc poster tự sinh), nút lưu trên ảnh, hàng nhãn (Miễn phí/Premium + nền tảng có link), tiêu đề, mô tả. */
export function PromptCard({ p }: { p: Prompt }) {
  const cat = categoryById(p.category)!;
  const text = fillPrompt(p);
  const extra = p.platforms.length - MAX_PLATFORMS;
  return (
    <article className="mv-card" style={{ "--cat-color": cat.color } as CSSProperties}>
      <div className="mv-card-cover">
        {p.video ? (
          <PreviewVideo src={p.video} poster={p.poster} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.poster} alt="" loading="lazy" decoding="async" />
        )}
        {(p.hot || p.isNew) && (
          <div className="mv-card-badges">
            {p.hot ? <span className="mv-badge mv-badge-hot">HOT</span> : <span className="mv-badge mv-badge-new">MỚI</span>}
          </div>
        )}
        <BookmarkButton id={p.id} title={p.title} />
      </div>
      <div className="mv-card-body">
        <div className="mv-card-tags">
          {p.premium ? (
            <span className="mv-pill mv-pill-premium"><Crown size={11} aria-hidden /> Premium</span>
          ) : (
            <span className="mv-pill mv-pill-free">Miễn phí</span>
          )}
          {p.platforms.slice(0, MAX_PLATFORMS).map((id) => {
            const pl = platformById(id)!;
            return (
              <a key={id} className="mv-pill mv-pill-plat" href={pl.url} target="_blank" rel="noopener" title={`Mở ${pl.name}`} style={{ "--pc": pl.color } as CSSProperties}>
                {pl.name}
              </a>
            );
          })}
          {extra > 0 && <span className="mv-level">+{extra}</span>}
          {p.version && <span className="mv-ver">v{p.version}</span>}
        </div>
        <h3><Link href={mvPath.prompt(p.id)}>{p.title}</Link></h3>
        <p>{p.desc}</p>
        <div className="mv-card-foot">
          <span className="mv-level">{cat.short} · {p.level}</span>
          <CopyMini text={text} label={p.title} />
        </div>
      </div>
    </article>
  );
}
