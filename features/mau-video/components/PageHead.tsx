import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PageHead({ title, sub, Icon, color, action }: { title: string; sub: string; Icon: LucideIcon; color?: string; action?: ReactNode }) {
  return (
    <>
      <div className="mv-page-head" style={color ? ({ "--cat-color": color } as CSSProperties) : undefined}>
        <div className="mv-ico"><Icon size={20} aria-hidden /></div>
        <h1>{title}</h1>
        {action && <div className="mv-head-action">{action}</div>}
      </div>
      <p className="mv-page-sub">{sub}</p>
    </>
  );
}
