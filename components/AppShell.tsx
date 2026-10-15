"use client";

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";
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
  ImageIcon,
  Briefcase,
  RotateCcw,
  ArrowLeft,
  ChevronRight,
  Home,
  Sparkles,
  ChevronsLeft,
  UserPlus
} from "lucide-react";
import { visibleNavFeatures, NAV_CATEGORY_ORDER, featureBySlug, isExternalFeature, type AppFeature } from "@/lib/features";
import type { NavSource } from "@/lib/analytics/types";
import { badgeLabel, categoryLabel, featureDescription, featureName, useUiPreferences } from "@/lib/uiPreferences";
import { companyRegisterUrl } from "@/features/company/companyLinks";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { getToolIcon, colorForSlug } from "@/components/toolIconMap";
import { ParticleBackground } from "@/features/landing/ParticleBackground";
import { FileDropGuard } from "@/components/FileDropGuard";
import "./topnav.css";

const CATEGORY_ICON: Record<string, any> = {
  download: Download,
  video: Film,
  audio: Music,
  image: ImageIcon,
  office: Briefcase,
  template: Sparkles
};

const CATEGORY_COLOR: Record<string, string> = {
  download: "#f59e0b",
  video: "#ec4899",
  audio: "#22c55e",
  image: "#a78bfa",
  office: "#06b6d4",
  template: "#fb923c"
};

/** Desktop sidebar collapsed state lives on <html data-sb="collapsed"> (set before paint by app/layout.tsx from localStorage "aio-sb"). */
const SIDEBAR_STORAGE_KEY = "aio-sb";
/** Set when a top-bar category is clicked away from the homepage; the homepage scrolls to that section on arrival. */
const SCROLL_TARGET_KEY = "aio-scroll-to";
const subscribeSidebar = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sb"] });
  return () => mo.disconnect();
};
const readSidebarCollapsed = () => document.documentElement.dataset.sb === "collapsed";

type Props = {
  features: AppFeature[];
  activeSlug: string;
  /** Opens a tool by slug ("" = homepage); `source` records which UI was used. */
  onSelect: (slug: string, source: NavSource) => void;
  /** Provided only while a tool is open: steps back through the navigation stack. */
  onBack?: () => void;
  /** Provided only while a tool is open: resets that tool to its initial state. */
  onRefresh?: () => void;
  children: React.ReactNode;
};

/** Let ctrl/cmd/shift/middle-click keep the browser's "open in new tab" behaviour. */
function isPlainLeftClick(e: React.MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function AppShell({ features, activeSlug, onSelect, onBack, onRefresh, children }: Props) {
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
      // The breadcrumb's category button toggles the dropdown itself.
      const onAnchor = (target as Element).closest?.("[data-dropdown-anchor]");
      if (!insideBar && !insideDropdown && !onAnchor) {
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

  function openCategoryDropdown(category: string, anchor?: HTMLElement) {
    const btn = anchor ?? btnRefs.current[category];
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
      setDropdownPos({ left, top: anchor ? rect.bottom + 6 : barRect.bottom });
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

  function handleItemClick(e: React.MouseEvent, feature: AppFeature, source: NavSource) {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    onSelect(feature.slug, source);
    closeDropdown();
    closeMobileSheet();
  }

  function goHome(e: React.MouseEvent) {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    closeDropdown();
    closeMobileSheet();
    setChosenCategory("");
    onSelect("", "crumb");
  }

  const activeFeature = featureBySlug(activeSlug);
  const activeCategory = activeFeature?.category ?? "";

  // Desktop/tablet sidebar (≥ 641px): the top bar is the main menu (categories); the sidebar
  // lists the tools of the chosen category and follows the open tool.
  const sidebarCollapsed = useSyncExternalStore(subscribeSidebar, readSidebarCollapsed, () => false);
  const [chosenCategory, setChosenCategory] = useState<string>(activeCategory);
  useEffect(() => {
    if (activeCategory) setChosenCategory(activeCategory);
  }, [activeCategory]);
  // Sidebar always shows one group's tools: the group picked in the top bar (it follows the open tool's
  // group whenever a tool opens, but the top bar can switch it at any time), else the first group.
  const sidebarCategory = chosenCategory || activeCategory || sortedCategories[0] || "";


  function toggleSidebar() {
    const next = !sidebarCollapsed;
    if (next) document.documentElement.dataset.sb = "collapsed";
    else delete document.documentElement.dataset.sb;
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "collapsed" : ""); } catch {}
    closeDropdown();
  }

  function sidebarVisible() {
    return window.matchMedia("(min-width: 641px)").matches;
  }

  /** Top-bar category click: switches the sidebar list and goes to that group's section on the
   *  homepage (from any page); without the sidebar (narrow screens) the old dropdown opens. */
  function onTopCategoryClick(category: string) {
    if (!sidebarVisible()) {
      toggleCategory(category);
      return;
    }
    closeDropdown();
    setChosenCategory(category);
    if (!activeSlug) {
      document.getElementById(category)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Leaving a tool page: remember the target section, scroll once the homepage has rendered
    // (also works when the shell remounts, e.g. coming from /mau-video).
    try { sessionStorage.setItem(SCROLL_TARGET_KEY, category); } catch {}
    onSelect("", "menu");
  }

  useEffect(() => {
    if (activeSlug) return;
    let target = "";
    try { target = sessionStorage.getItem(SCROLL_TARGET_KEY) ?? ""; sessionStorage.removeItem(SCROLL_TARGET_KEY); } catch {}
    if (!target) return;
    setChosenCategory(target);
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [activeSlug]);

  function renderSidebarItem(feature: AppFeature) {
    const Icon = getToolIcon(feature.icon_name);
    const isExternal = isExternalFeature(feature);
    const current = feature.slug === activeSlug;
    const name = featureName(feature.slug, feature.name, locale);
    const inner = (
      <>
        <span className="tn-sb-icon" style={{ ["--icon-color" as string]: colorForSlug(feature.slug) }}><Icon size={19} /></span>
        <span className="tn-sb-label">{name}</span>
        {feature.badge === "MỚI" && <span className="tn-badge-new">{badgeLabel(feature.badge, locale)}</span>}
        {isExternal && <Crown size={12} className="tn-sb-crown" />}
      </>
    );
    const cls = `tn-sb-item ${current ? "is-current" : ""}`;
    if (isExternal) {
      return (
        <a key={feature.slug} className={cls} href={feature.route_path ?? undefined} target="_blank" rel="noopener noreferrer" title={name}>
          {inner}
        </a>
      );
    }
    if (feature.standalone) {
      return (
        <a key={feature.slug} className={cls} href={feature.route_path ?? "/"} aria-current={current ? "page" : undefined} data-track={`Menu: ${feature.name}`} title={name}>
          {inner}
        </a>
      );
    }
    return (
      <a key={feature.slug} className={cls} href={feature.route_path ?? "/"} aria-current={current ? "page" : undefined}
        data-track={`Menu: ${feature.name}`} title={name} onClick={(e) => handleItemClick(e, feature, "menu")}>
        {inner}
      </a>
    );
  }

  // Breadcrumb category: shows the sibling tools of the open one (dropdown on
  // desktop, bottom sheet on phones) for quick switching.
  function openCrumbCategory(e: React.MouseEvent<HTMLButtonElement>) {
    if (!activeCategory) return;
    if (window.matchMedia("(max-width: 640px)").matches) {
      openMobileSheet(activeCategory);
    } else if (openCategory === activeCategory) {
      closeDropdown();
    } else {
      openCategoryDropdown(activeCategory, e.currentTarget);
    }
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

  function renderCategoryItem(feature: AppFeature, onDone: () => void, source: NavSource) {
    const Icon = getToolIcon(feature.icon_name);
    const isExternal = isExternalFeature(feature);
    const isPremium = isExternal;
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
    if (feature.standalone) {
      // Its own page on this domain: a plain full-page navigation.
      return (
        <a key={feature.slug} className={`tn-item ${feature.slug === activeSlug ? "is-current" : ""}`} href={feature.route_path ?? "/"}
          aria-current={feature.slug === activeSlug ? "page" : undefined} data-track={`Menu: ${feature.name}`} onClick={onDone}>
          {content}
        </a>
      );
    }
    if (isExternal) {
      return (
        <a key={feature.slug} className="tn-item" href={feature.route_path ?? undefined}
          target="_blank" rel="noopener noreferrer" onClick={onDone}>
          {content}
        </a>
      );
    }
    return (
      <a key={feature.slug} className={`tn-item ${feature.slug === activeSlug ? "is-current" : ""}`}
        href={feature.route_path ?? "/"} aria-current={feature.slug === activeSlug ? "page" : undefined}
        data-track={`Menu: ${feature.name}`}
        onClick={(e) => handleItemClick(e, feature, source)}>
        {content}
      </a>
    );
  }

  return (
    <div className="tn-shell" data-ui-theme={theme} data-ui-locale={locale}>
      <ParticleBackground />
      <FileDropGuard />

      <aside className="tn-sidebar" aria-label={locale === "en" ? "Tools in this category" : "Công cụ trong danh mục"}>
        <a className="tn-sb-brand" href="/" onClick={goHome} title="AIOMMO Studio">
          <img src="/company/logo.png" alt="" />
          <span>
            AIOMMO Studio
            <small>ALL IN ONE MMO</small>
          </span>
        </a>
        <nav className="tn-sb-scroll">
          {sidebarCategory && grouped[sidebarCategory] && (() => {
            const CatIcon = CATEGORY_ICON[sidebarCategory] ?? Folder;
            const items = grouped[sidebarCategory].sort((a, b) => a.sort_order - b.sort_order);
            const label = categoryLabel(sidebarCategory, locale);
            return (
              <div className="tn-sb-group is-open" style={{ ["--cat-color" as string]: CATEGORY_COLOR[sidebarCategory] ?? "var(--accent)" }}>
                <div className="tn-sb-group-title" title={label}><CatIcon size={13} /><span>{label}</span></div>
                <div className="tn-sb-items">{items.map(renderSidebarItem)}</div>
              </div>
            );
          })()}
        </nav>
        <div className="tn-sb-foot">
          <a className="tn-sb-cta" href={companyRegisterUrl("app")} target="_blank" rel="noopener noreferrer" data-track="Đăng ký ngay (sidebar)"
            title={locale === "en" ? "Register now" : "Đăng ký ngay"}>
            <UserPlus size={16} />
            <span className="tn-sb-label">{locale === "en" ? "Register now" : "Đăng ký ngay"}</span>
          </a>
          <button type="button" className="tn-sb-item tn-sb-toggle" onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? (locale === "en" ? "Expand menu" : "Mở rộng menu") : (locale === "en" ? "Collapse menu" : "Thu nhỏ menu")}
            title={sidebarCollapsed ? (locale === "en" ? "Expand" : "Mở rộng") : (locale === "en" ? "Collapse" : "Thu nhỏ")}>
            <span className="tn-sb-icon"><ChevronsLeft size={15} /></span>
            <span className="tn-sb-label">{locale === "en" ? "Collapse" : "Thu nhỏ"}</span>
          </button>
        </div>
      </aside>

      <div className="tn-bar" ref={barRef}>
        <a className="tn-brand" href="/" onClick={goHome}>
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
                  className={`tn-cat-btn ${isOpen ? "is-open" : ""} ${category === activeCategory ? "is-current" : ""} ${category === sidebarCategory ? "is-chosen" : ""}`}
                  onClick={() => onTopCategoryClick(category)}
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
              .map((feature) => renderCategoryItem(feature, closeDropdown, "menu"))}
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
                  .map((feature) => renderCategoryItem(feature, closeMobileSheet, "sheet"))}
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
          {/* Always rendered on desktop (invisible without a tool) so the centred categories never shift between pages. */}
          <button
            className={`tn-refresh-btn ${onRefresh ? "" : "is-placeholder"}`}
            onClick={onRefresh}
            disabled={!onRefresh}
            aria-hidden={!onRefresh}
            tabIndex={onRefresh ? undefined : -1}
            aria-label={locale === "en" ? "Refresh tool" : "Làm mới công cụ"}
            title={onRefresh ? (locale === "en" ? "Reset this tool" : "Xóa dữ liệu và bắt đầu lại") : undefined}
          >
            <RotateCcw size={15} />
            <span>{locale === "en" ? "Refresh" : "Làm mới"}</span>
          </button>
          <button className="tn-icon-btn" onClick={toggleTheme}
            aria-label={theme === "light" ? "Dark mode" : "Light mode"}>
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button className="tn-icon-btn" onClick={toggleLocale} aria-label="Toggle language">
            <Languages size={16} />
          </button>
        </div>
      </div>

      <div className="tn-content">
        {onBack && activeFeature && (
          <div className="tn-crumbs">
            <button type="button" className="tn-back-btn" onClick={onBack} data-track="Quay lại">
              <ArrowLeft size={16} />
              <span>{locale === "en" ? "Back" : "Quay lại"}</span>
            </button>
            <nav className="tn-crumb-trail" aria-label={locale === "en" ? "Breadcrumb" : "Đường dẫn"}>
              <a href="/" className="tn-crumb tn-crumb-home" onClick={goHome}>
                <Home size={14} />
                <span>{locale === "en" ? "Home" : "Trang chủ"}</span>
              </a>
              <ChevronRight size={14} className="tn-crumb-sep tn-crumb-home" />
              <button type="button" className="tn-crumb" onClick={openCrumbCategory} data-dropdown-anchor
                style={{ ["--cat-color" as string]: CATEGORY_COLOR[activeCategory] ?? "var(--accent)" }}>
                {categoryLabel(activeCategory, locale)}
                <ChevronDown size={13} />
              </button>
              <ChevronRight size={14} className="tn-crumb-sep" />
              <span className="tn-crumb tn-crumb-current" aria-current="page">
                {featureName(activeFeature.slug, activeFeature.name, locale)}
              </span>
            </nav>
          </div>
        )}
        {children}
      </div>

      <nav className="tn-mobile-tabbar" ref={tabbarRef}>
        <a
          href="/"
          className={`tn-mobile-tab ${!activeSlug && !mobileSheetCategory ? "is-active" : ""}`}
          onClick={goHome}
          aria-label={locale === "en" ? "Home" : "Trang chủ"}
          aria-current={!activeSlug ? "page" : undefined}
          style={{ ["--tab-color" as string]: "var(--accent)" }}
        >
          <span className="tn-mobile-tab-icon"><Home size={19} /></span>
          <span className="tn-mobile-tab-dot" />
        </a>
        {sortedCategories.map((category) => {
          const Icon = CATEGORY_ICON[category] ?? Folder;
          const isActive = mobileSheetCategory ? mobileSheetCategory === category : category === activeCategory;
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
