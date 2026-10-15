import type { MetadataRoute } from "next";
import { toolPathSegments } from "@/lib/features";
import { allPrompts } from "@/features/mau-video/prompts";
import { CATEGORIES } from "@/features/mau-video/taxonomy";
import { MV_SITE_URL, mvPath } from "@/features/mau-video/site";

/** Một domain cho mọi thứ: các công cụ (/cat-video…) và thư viện mẫu video & prompt (/mau-video/…). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: MV_SITE_URL, lastModified: now, priority: 1 },
    ...toolPathSegments().map((seg) => ({ url: `${MV_SITE_URL}/${seg}`, lastModified: now, priority: 0.8 })),
    { url: `${MV_SITE_URL}${mvPath.home}`, lastModified: now, priority: 0.9 },
    ...CATEGORIES.map((c) => ({ url: `${MV_SITE_URL}${mvPath.category(c.id)}`, lastModified: now, priority: 0.7 })),
    ...allPrompts().map((p) => ({ url: `${MV_SITE_URL}${mvPath.prompt(p.id)}`, lastModified: now, priority: 0.6 }))
  ];
}
