"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Folder,
  Languages,
  Moon,
  Sun,
  Crown,
  X,
  Download,
  Film,
  Music,
  FolderArchive,
  Lightbulb,
  RotateCcw
} from "lucide-react";
import { visibleNavFeatures, NAV_CATEGORY_ORDER, type AppFeature } from "@/lib/features";
import { badgeLabel, categoryLabel, featureDescription, featureName, useUiPreferences } from "@/lib/uiPreferences";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { getToolIcon, colorForSlug } from "@/components/toolIconMap";
import { ParticleBackground } from "@/features/landing/ParticleBackground";
import "./topnav.css";

const CATEGORY_ICON: Record<string, any> = {
  download: Download,
  video: Film,
  audio: Music,
  storage: FolderArchive,
  tips: Lightbulb
};

const CATEGORY_COLOR: Record<string, string> = {
  download: "#f59e0b",
  video: "#ec4899",
  audio: "#22c55e",
  storage: "#06b6d4",
  tips: "#a78bfa"
};

type Props = {
  features: AppFeature[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  /** Provided only while a tool is open: resets that tool to its initial state. */
  onRefresh?: () => void;
  children: React.ReactNode;
};

export function AppShell({ features, activeSlug, onSelect, onRefresh, children }: Props) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number } | null>(null);
  const [mobileSheetCategory, setMobileSheetCategory] = useState<string | null>(null);
  const [mobileSheetClosing, setMobileSheetClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const { locale, theme, toggleLocale, toggleTheme } = useUiPreferences();
  const { canInstall, ios, hasNativePrompt, promptInstall } = useInstallPrompt();
  const barRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const sheetRef = useRef<HTMLDivElement>(null);
  const tabbarRef = useRef<HTMLElement>(null);
  const installRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!showIosInstallHint) return;
    function onClickOutside(e: MouseEvent) {
      if (!installRef.current?.contains(e.target as Node)) setShowIosInstallHint(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showIosInstallHint]);

  async function handleInstallClick() {
    if (hasNativePrompt) {
      await promptInstall();
    } else if (ios) {
      setShowIosInstallHint((v) => !v);
    }
  }

  const closeDropdown = useCallback(() => {
    setOpenCategory(null);
    setDropdownPos(null);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideBar = barRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideBar && !insideDropdown) {
        closeDropdown();
      }
    }
    function onScrollOrResize() {
      closeDropdown();
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [closeDropdown]);

  function openCategoryDropdown(category: string) {
    const btn = btnRefs.current[category];
    const barRect = barRef.current?.getBoundingClientRect();
    if (btn && barRect) {
      const rect = btn.getBoundingClientRect();
      const dropdownWidth = 320;
      let left = rect.left;
      if (left + dropdownWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - dropdownWidth - 12);
      }
      // Anchor to the nav bar's own bottom edge (not the button's), so the
      // dropdown never jumps vertically when switching between categories.
      setDropdownPos({ left, top: barRect.bottom });
    }
    setOpenCategory(category);
  }

  function toggleCategory(category: string) {
    if (openCategory === category) {
      closeDropdown();
      return;
    }
    openCategoryDropdown(category);
  }

  function onCategoryHover(category: string) {
    // Once a menu is open, gliding the mouse across other tabs switches
    // the open menu instantly (mega-menu style) — no extra click needed.
    if (openCategory && openCategory !== category) {
      openCategoryDropdown(category);
    }
  }

  const visibleFeatures = visibleNavFeatures(features);
  const grouped = visibleFeatures.reduce<Record<string, AppFeature[]>>((acc, feature) => {
    const key = feature.category || "other";
    acc[key] ??= [];
    acc[key].push(feature);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ia = NAV_CATEGORY_ORDER.indexOf(a);
    const ib = NAV_CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  function handleItemClick(feature: AppFeature) {
    const isExternal = /^https?:\/\//i.test(feature.route_path ?? "");
    if (!isExternal) {
      onSelect(feature.slug);
    }
    closeDropdown();
    closeMobileSheet();
  }

  function openMobileSheet(category: string) {
    setMobileSheetClosing(false);
    setMobileSheetCategory(category);
  }

  function closeMobileSheet() {
    if (!mobileSheetCategory) return;
    setMobileSheetClosing(true);
    window.setTimeout(() => {
      setMobileSheetCategory(null);
      setMobileSheetClosing(false);
    }, 220);
  }

  // No dark backdrop on mobile (so the tab bar stays tappable underneath for
  // instant switching) — instead, close the sheet on any tap outside both the
  // sheet itself and the tab bar (whose own buttons handle switching directly).
  useEffect(() => {
    if (!mobileSheetCategory) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideSheet = sheetRef.current?.contains(target);
      const insideTabbar = tabbarRef.current?.contains(target);
      if (!insideSheet && !insideTabbar) {
        closeMobileSheet();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileSheetCategory]);

  function renderCategoryItem(feature: AppFeature, onDone: () => void) {
    const Icon = getToolIcon(feature.icon_name);
    const isExternal = /^https?:\/\//i.test(feature.route_path ?? "");
    const isPremium = feature.category !== "tips" && isExternal;
    const content = (
      <>
        <span className="tn-item-icon" style={{ ["--icon-color" as string]: colorForSlug(feature.slug) }}><Icon size={17} /></span>
        <span className="tn-item-body">
          <span className="tn-item-title">
            {featureName(feature.slug, feature.name, locale)}
            {feature.badge === "MỚI" && <span className="tn-badge-new">{badgeLabel(feature.badge, locale)}</span>}
            {isPremium && <span className="tn-badge-premium"><Crown size={9} />{locale === "en" ? "REGISTER NOW" : "ĐĂNG KÝ NGAY"}</span>}
          </span>
          <span className="tn-item-desc">{featureDescription(feature.slug, feature.description, locale)}</span>
        </span>
      </>
    );
    if (isExternal) {
      return (
        <a key={feature.slug} className="tn-item" href={feature.route_path ?? undefined}
          target="_blank" rel="noopener noreferrer" onClick={onDone}>
          {content}
        </a>
      );
    }
    return (
      <button key={feature.slug} type="button" className="tn-item" onClick={() => handleItemClick(feature)}>
        {content}
      </button>
    );
  }

  return (
    <div className="tn-shell" data-ui-theme={theme} data-ui-locale={locale}>
      <ParticleBackground />
      <div className="tn-bar" ref={barRef}>
        <a className="tn-brand" href="/">
          <img src="/company/logo.png" alt="" />
          <span>
            AIOMMO Studio
            <small>ALL IN ONE MMO</small>
          </span>
        </a>

        <nav className="tn-categories">
          {sortedCategories.map((category) => {
            const isOpen = openCategory === category;
            const CatIcon = CATEGORY_ICON[category] ?? Folder;
            const catColor = CATEGORY_COLOR[category] ?? "var(--accent)";
            return (
              <div className="tn-cat-wrap" key={category}>
                <button
                  type="button"
                  ref={(el) => { btnRefs.current[category] = el; }}
                  className={`tn-cat-btn ${isOpen ? "is-open" : ""}`}
                  onClick={() => toggleCategory(category)}
                  onMouseEnter={() => onCategoryHover(category)}
                  style={{ ["--cat-color" as string]: catColor }}
                >
                  <CatIcon size={15} className="tn-cat-icon" />
                  {categoryLabel(category, locale)}
                  <ChevronDown size={14} className="tn-chev" />
                </button>
              </div>
            );
          })}
        </nav>

        {mounted && openCategory && dropdownPos && createPortal(
          <div
            ref={dropdownRef}
            className="tn-dropdown"
            style={{ position: "fixed", left: dropdownPos.left, top: dropdownPos.top }}
          >
            {grouped[openCategory]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((feature) => renderCategoryItem(feature, closeDropdown))}
          </div>,
          document.body
        )}

        {mounted && mobileSheetCategory && createPortal(
          <>
            <div className={`tn-sheet-backdrop ${mobileSheetClosing ? "is-closing" : ""}`} onClick={closeMobileSheet} />
            <div ref={sheetRef} className={`tn-sheet ${mobileSheetClosing ? "is-closing" : ""}`}>
              <div className="tn-sheet-handle" />
              <div className="tn-sheet-header">
                <span>{categoryLabel(mobileSheetCategory, locale)}</span>
                <button className="tn-icon-btn" onClick={closeMobileSheet}><X size={16} /></button>
              </div>
              <div className="tn-sheet-list">
                {(grouped[mobileSheetCategory] ?? [])
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((feature) => renderCategoryItem(feature, closeMobileSheet))}
              </div>
            </div>
          </>,
          document.body
        )}

        <div className="tn-right">
          {canInstall && (
            <div className="tn-install-wrap" ref={installRef}>
              <button className="tn-icon-btn" onClick={handleInstallClick}
                aria-label={locale === "en" ? "Install app" : "Cài đặt ứng dụng"}
                title={locale === "en" ? "Install app" : "Cài đặt ứng dụng"}>
                <Download size={16} />
              </button>
              {showIosInstallHint && (
                <div className="tn-install-hint">
                  {locale === "en" ? (
                    <>Tap <strong>Share</strong> then <strong>Add to Home Screen</strong></>
                  ) : (
                    <>Bấm <strong>Chia sẻ</strong> rồi chọn <strong>Thêm vào MH chính</strong></>
                  )}
                </div>
              )}
            </div>
          )}
          {onRefresh && (
            <button
              className="tn-refresh-btn"
              onClick={onRefresh}
              aria-label={locale === "en" ? "Refresh tool" : "Làm mới công cụ"}
              title={locale === "en" ? "Reset this tool" : "Xóa dữ liệu và bắt đầu lại"}
            >
              <RotateCcw size={15} />
              <span>{locale === "en" ? "Refresh" : "Làm mới"}</span>
            </button>
          )}
          <button className="tn-icon-btn" onClick={toggleTheme}
            aria-label={theme === "light" ? "Dark mode" : "Light mode"}>
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="tn-icon-btn" onClick={toggleLocale} aria-label="Toggle language">
            <Languages size={16} />
          </button>
        </div>
      </div>

      <div className="tn-content">{children}</div>

      <nav className="tn-mobile-tabbar" ref={tabbarRef}>
        {sortedCategories.map((category) => {
          const Icon = CATEGORY_ICON[category] ?? Folder;
          const isActive = mobileSheetCategory === category;
          return (
            <button
              key={category}
              type="button"
              className={`tn-mobile-tab ${isActive ? "is-active" : ""}`}
              onClick={() => openMobileSheet(category)}
              aria-label={categoryLabel(category, locale)}
              style={{ ["--tab-color" as string]: CATEGORY_COLOR[category] ?? "var(--accent)" }}
            >
              <span className="tn-mobile-tab-icon"><Icon size={19} /></span>
              <span className="tn-mobile-tab-dot" />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
