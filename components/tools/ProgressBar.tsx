"use client";

type Props = {
  /** 0-100. Omit (or pass null) when the real percentage is unknown: an animated bar is shown instead. */
  percent?: number | null;
  label?: string;
};

export function ProgressBar({ percent, label }: Props) {
  const known = typeof percent === "number" && Number.isFinite(percent);
  const pct = known ? Math.max(0, Math.min(100, Math.round(percent as number))) : 0;
  return (
    <div className="tool-progress-wrap" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? pct : undefined} aria-label={label}>
      <div className="tool-progress-head">
        <span>{label}</span>
        {known && <strong>{pct}%</strong>}
      </div>
      <div className="tool-progress-track">
        <div className={known ? "tool-progress-fill" : "tool-progress-fill is-indeterminate"} style={known ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  );
}
