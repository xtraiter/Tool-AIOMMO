"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { DEFAULT_LOCAL_FEATURES, featureBySlug, isExternalFeature, pathForSlug } from "@/lib/features";
import { initAnalytics, trackView } from "@/lib/analytics/client";
import type { NavSource } from "@/lib/analytics/types";
import { ToastProvider } from "@/features/mau-video/components/Toast";
import { promptBySlug } from "@/features/mau-video/prompts";
import { MV_BASE, mvPath } from "@/features/mau-video/site";

/** Trang nào của thư viện ứng với mục nào trong menu (lib/features.ts, category "template"). */
function slugForPath(pathname: string) {
  const rest = pathname.replace(/\/+$/, "").slice(MV_BASE.length);
  const cat = rest.match(/^\/danh-muc\/([a-z]+)$/)?.[1];
  if (cat && featureBySlug(`template.${cat}`)) return `template.${cat}`;
  const prompt = rest.match(/^\/prompt\/([^/]+)$/)?.[1];
  if (prompt) {
    const p = promptBySlug(prompt);
    if (p && featureBySlug(`template.${p.category}`)) return `template.${p.category}`;
  }
  return "template.library";
}

/** Bọc các trang /mau-video trong giao diện chung của tool.allinonemmo.com (menu, theme, hạt nền, breadcrumb). */
export function MauVideoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? MV_BASE;
  const router = useRouter();
  const activeSlug = slugForPath(pathname);

  const navigate = useCallback((slug: string, _source: NavSource) => {
    const feature = featureBySlug(slug);
    if (feature && isExternalFeature(feature)) {
      window.open(feature.route_path ?? "/", "_blank", "noopener");
      return;
    }
    const path = feature?.standalone && feature.route_path ? feature.route_path : pathForSlug(slug);
    if (path === pathname) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    router.push(path);
  }, [pathname, router]);

  // "Quay lại": trang con về thư viện, thư viện về trang chủ tool.
  const goBack = useCallback(() => {
    router.push(pathname === mvPath.home ? "/" : mvPath.home);
  }, [pathname, router]);

  useEffect(() => {
    initAnalytics(activeSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    trackView(activeSlug, "direct");
  }, [activeSlug]);

  return (
    <AppShell features={DEFAULT_LOCAL_FEATURES} activeSlug={activeSlug} onSelect={navigate} onBack={goBack}>
      <ToastProvider>
        <div className="mv-page">{children}</div>
      </ToastProvider>
    </AppShell>
  );
}
