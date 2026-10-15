import type { MetadataRoute } from "next";
import { MV_SITE_URL } from "@/features/mau-video/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/thong-ke", "/mau-video/da-luu"] },
    sitemap: `${MV_SITE_URL}/sitemap.xml`
  };
}
