/** Device class used for splitting stats and heatmaps: mobile / tablet / desktop. */
export type Device = "m" | "t" | "d";

/** How a tool page was reached — lets the dashboard show which entry points people actually use. */
export type NavSource = "card" | "search" | "menu" | "sheet" | "crumb" | "direct" | "back" | "link";

// `page` is always "home" or a feature slug (e.g. "video.cut").
export type TrackEvent =
  | { t: "visit"; entry: string; dev: Device; ref?: string; nv?: boolean }
  | { t: "view"; page: string; from?: string; src?: NavSource }
  | { t: "time"; page: string; ms: number }
  | { t: "click"; page: string; x: number; y: number; dev: Device; label?: string }
  | { t: "search"; q: string; n: number }
  | { t: "ping"; page: string }
  | { t: "bye" };

export type TrackPayload = { vid: string; ev: TrackEvent[] };
