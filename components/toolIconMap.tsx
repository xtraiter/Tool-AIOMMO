import {
  Download,
  Image as ImageIcon,
  Radar,
  ShoppingBag,
  Scissors,
  Combine,
  MonitorPlay,
  AudioLines,
  Captions,
  Layers3,
  MicVocal,
  Music,
  Waves,
  Zap,
  Mic,
  FolderArchive,
  Eraser,
  FileText,
  SquarePen,
  Clapperboard,
  Film,
  Smartphone,
  Share2,
  Bot,
  Volume2,
  ExternalLink,
  Sparkles,
  type LucideIcon
} from "lucide-react";

export const toolIconMap: Record<string, LucideIcon> = {
  download: Download,
  image: ImageIcon,
  radar: Radar,
  "shopping-bag": ShoppingBag,
  scissors: Scissors,
  combine: Combine,
  "monitor-play": MonitorPlay,
  "audio-lines": AudioLines,
  captions: Captions,
  "layers-3": Layers3,
  "mic-vocal": MicVocal,
  music: Music,
  waves: Waves,
  zap: Zap,
  mic: Mic,
  "folder-archive": FolderArchive,
  eraser: Eraser,
  "file-text": FileText,
  "square-pen": SquarePen,
  clapperboard: Clapperboard,
  film: Film,
  smartphone: Smartphone,
  "share-2": Share2,
  bot: Bot,
  "volume-2": Volume2,
  "external-link": ExternalLink
};

export function getToolIcon(iconName: string | null | undefined): LucideIcon {
  return toolIconMap[(iconName ?? "") as keyof typeof toolIconMap] ?? Sparkles;
}

// A curated, high-contrast palette so every tool gets its own recognizable
// icon color instead of everything falling back to the same accent color.
const ICON_COLOR_PALETTE = [
  "#ec4899", "#22c55e", "#3b82f6", "#f59e0b", "#a78bfa",
  "#06b6d4", "#ef4444", "#84cc16", "#f97316", "#14b8a6",
  "#eab308", "#8b5cf6"
];

// Deterministic (stable across reloads) — same slug always gets the same color.
export function colorForSlug(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return ICON_COLOR_PALETTE[hash % ICON_COLOR_PALETTE.length];
}
