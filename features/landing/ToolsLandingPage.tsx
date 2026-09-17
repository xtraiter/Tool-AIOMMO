"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Search, Crown } from "lucide-react";
import { DEFAULT_LOCAL_FEATURES, NAV_CATEGORY_ORDER, type AppFeature } from "@/lib/features";
import { getToolIcon, colorForSlug } from "@/components/toolIconMap";
import {
  badgeLabel,
  categoryLabel,
  featureDescription,
  featureName,
  sectionTitle,
  useUiPreferences,
  type UiLocale
} from "@/lib/uiPreferences";
import "./landing.css";

function isExternalTool(feature: AppFeature) {
  return /^https?:\/\//i.test(feature.route_path ?? "");
}

function ToolCard({
  feature,
  locale,
  onSelectTool
}: {
  feature: AppFeature;
  locale: UiLocale;
  onSelectTool?: (slug: string) => void;
}) {
  const Icon = getToolIcon(feature.icon_name);
  const external = isExternalTool(feature);
  const href = external ? (feature.route_path ?? "#") : `/app?tool=${feature.slug}`;

  return (
    <a
      className={`tl-card is-active ${external ? "is-premium-card" : ""}`}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={(e) => {
        if (external || !onSelectTool) return;
        e.preventDefault();
        onSelectTool(feature.slug);
      }}
    >
      {feature.badge && (
        <span className={`tl-badge-new ${external ? "is-premium" : ""}`}>
          {external && <Crown size={10} />} {badgeLabel(feature.badge, locale)}
        </span>
      )}
      <span className="tl-card-icon" style={{ ["--icon-color" as string]: colorForSlug(feature.slug) }}><Icon size={20} /></span>
      <h3>{featureName(feature.slug, feature.name, locale)}</h3>
      <p>{featureDescription(feature.slug, feature.description, locale)}</p>
      {external ? (
        <span className="tl-card-cta-btn">
          <Crown size={13} /> {locale === "en" ? "Register now — Free" : "Đăng ký ngay — Miễn phí"} <ArrowUpRight size={14} />
        </span>
      ) : (
        <span className="tl-card-cta">
          {locale === "en" ? "Open tool" : "Mở công cụ"} <ArrowRight size={14} />
        </span>
      )}
    </a>
  );
}

export function ToolsLandingPage({ onSelectTool }: { onSelectTool?: (slug: string) => void } = {}) {
  const [query, setQuery] = useState("");
  const { locale } = useUiPreferences();

  const grouped = useMemo(() => {
    const acc: Record<string, AppFeature[]> = {};
    for (const feature of DEFAULT_LOCAL_FEATURES) {
      acc[feature.category] ??= [];
      acc[feature.category].push(feature);
    }
    for (const key of Object.keys(acc)) {
      acc[key].sort((a, b) => a.sort_order - b.sort_order);
    }
    return acc;
  }, []);

  const categories = useMemo(
    () => Object.keys(grouped).sort((a, b) => NAV_CATEGORY_ORDER.indexOf(a) - NAV_CATEGORY_ORDER.indexOf(b)),
    [grouped]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGrouped = useMemo(() => {
    if (!normalizedQuery) return grouped;
    const result: Record<string, AppFeature[]> = {};
    for (const [category, items] of Object.entries(grouped)) {
      const matches = items.filter((f) => {
        const name = featureName(f.slug, f.name, locale).toLowerCase();
        const desc = (featureDescription(f.slug, f.description, locale) ?? "").toLowerCase();
        return name.includes(normalizedQuery) || desc.includes(normalizedQuery);
      });
      if (matches.length) result[category] = matches;
    }
    return result;
  }, [grouped, normalizedQuery, locale]);

  const visibleCategories = categories.filter((c) => filteredGrouped[c]?.length);
  const totalFree = DEFAULT_LOCAL_FEATURES.filter((f) => !isExternalTool(f)).length;

  const t = locale === "en"
    ? {
        heroBadge: "Free online tools",
        heroP: "Supporting individuals and businesses in managing thousands of social media pages, multi-platform and end-to-end, suited to every need and every age.",
        searchPlaceholder: "Quick search (e.g. screen recorder, voice recorder, volume boost, video download...)",
        statFree: "Free tools",
        statNoAds: "No cost, no ads",
        statNoLogin: "No sign-up required",
        toolsSuffix: "tools",
        noResults: "No matching tools found.",
        allApps: "All apps",
        footerTagline: "Free online tools, processed instantly right in your browser."
      }
    : {
        heroBadge: "Các công cụ trực tuyến miễn phí",
        heroP: "Đồng hành cùng cá nhân và doanh nghiệp quản lý hàng nghìn trang mạng xã hội, đa nền tảng và hỗ trợ từ A đến Z. Công cụ đơn giản, thông minh phù hợp với mọi nhu cầu mọi lứa tuổi.",
        searchPlaceholder: "Tìm nhanh công cụ (VD: quay màn hình, ghi âm, tăng âm lượng, tải video...)",
        statFree: "Công cụ miễn phí",
        statNoAds: "Không mất phí, không quảng cáo",
        statNoLogin: "Không cần đăng nhập",
        toolsSuffix: "công cụ",
        noResults: "Không tìm thấy công cụ phù hợp.",
        allApps: "Tất cả ứng dụng",
        footerTagline: "Công cụ trực tuyến miễn phí, xử lý ngay trên trình duyệt của bạn."
      };

  return (
    <div className="tl-page tl-page-embedded">
      <section className="tl-hero">
        <div className="tl-hero-badge">{t.heroBadge}</div>
        <img src="/company/logo.png" alt="AIOMMO" className="tl-hero-logo" />
        <h1>
          {locale === "en" ? (
            <>
              Technology Joint Stock <span>Company</span>
              <br />
              ALL IN ONE <span>MMO</span>
            </>
          ) : (
            <>
              Công ty cổ phần <span>công nghệ</span>
              <br />
              ALL IN ONE <span>MMO</span>
            </>
          )}
        </h1>
        <p>{t.heroP}</p>

        <div className="tl-search">
          <Search size={16} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
          />
        </div>

        <div className="tl-stats">
          <div className="tl-stat"><b>{totalFree}</b><span>{t.statFree}</span></div>
          <div className="tl-stat"><b>0đ</b><span>{t.statNoAds}</span></div>
          <div className="tl-stat"><b>100%</b><span>{t.statNoLogin}</span></div>
        </div>
      </section>

      {visibleCategories.length === 0 && (
        <section className="tl-section">
          <p style={{ textAlign: "center", color: "var(--muted)" }}>{t.noResults}</p>
        </section>
      )}

      {visibleCategories.map((category) => (
        <section className="tl-section" key={category}>
          <div className="tl-section-title">
            <h2>{sectionTitle(category, locale)}</h2>
            <span className="tl-count">{filteredGrouped[category].length} {t.toolsSuffix}</span>
          </div>
          <div className="tl-grid">
            {filteredGrouped[category].map((feature) => (
              <ToolCard key={feature.slug} feature={feature} locale={locale} onSelectTool={onSelectTool} />
            ))}
          </div>
        </section>
      ))}

      <footer className="tl-footer-full">
        <div className="tl-footer-nav">
          <span className="tl-footer-nav-title">{t.allApps}</span>
          {NAV_CATEGORY_ORDER.map((category) => (
            <a key={category} href={`/app`}>{categoryLabel(category, locale)}</a>
          ))}
        </div>
        <div className="tl-footer-bottom">
          <span>© {new Date().getFullYear()} AIOMMO Studio · All In One MMO</span>
          <span>{t.footerTagline}</span>
        </div>
      </footer>
    </div>
  );
}
