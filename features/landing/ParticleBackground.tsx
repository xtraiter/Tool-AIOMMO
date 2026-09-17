"use client";

import { useEffect, useRef, useState } from "react";
import { isBackgroundBusy, subscribeBackgroundBusy } from "@/lib/backgroundEffect";
import "./particle-background.css";

type Particle = { x: number; y: number; vx: number; vy: number; r: number; c: number };

const PARTICLE_COUNT_DESKTOP = 130;
const PARTICLE_COUNT_MOBILE = 18;
const MOBILE_BREAKPOINT = 640;
const LINK_DIST = 115;
const MOUSE_LINK_DIST = 150;
const MOUSE_REPEL_DIST = 150;
const COLORS = ["#f59e0b", "#ec4899", "#22c55e", "#06b6d4", "#a78bfa"];
const COLORS_RGB = ["245,158,11", "236,72,153", "34,197,94", "6,182,212", "167,139,250"];

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(() => isBackgroundBusy());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Decorative-only effect: we still slow it down for reduced-motion users,
    // but we never freeze it entirely — a fully static canvas reads as broken.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speedScale = reduceMotion ? 0.25 : 1;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];
    let rafId: number | null = null;
    let running = true;
    let busy = isBackgroundBusy();
    let mouse: { x: number; y: number } | null = null;

    function resize() {
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      width = window.innerWidth;
      height = window.innerHeight;
      canvasEl.width = width * dpr;
      canvasEl.height = height * dpr;
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initParticles() {
      const count = width < MOBILE_BREAKPOINT ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;
      particles = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 2.2 + Math.random() * 2.4,
        c: i % COLORS.length
      }));
    }

    function step() {
      if (!running) return;
      ctx!.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx * speedScale;
        p.y += p.vy * speedScale;

        if (mouse) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0 && dist < MOUSE_REPEL_DIST) {
            const t = (MOUSE_REPEL_DIST - dist) / MOUSE_REPEL_DIST;
            const force = t * t * 3.4;
            p.x += (dx / dist) * force;
            p.y += (dy / dist) * force;
          }
        }

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
        p.x = Math.max(0, Math.min(width, p.x));
        p.y = Math.max(0, Math.min(height, p.y));
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            let alpha = 0.5 * (1 - dist / LINK_DIST);
            if (mouse) {
              const mx = (a.x + b.x) / 2 - mouse.x;
              const my = (a.y + b.y) / 2 - mouse.y;
              const mDist = Math.sqrt(mx * mx + my * my);
              if (mDist < MOUSE_REPEL_DIST) {
                alpha *= mDist / MOUSE_REPEL_DIST;
              }
            }
            if (alpha > 0.01) {
              ctx!.strokeStyle = `rgba(${COLORS_RGB[a.c]}, ${alpha})`;
              ctx!.lineWidth = 1.3;
              ctx!.beginPath();
              ctx!.moveTo(a.x, a.y);
              ctx!.lineTo(b.x, b.y);
              ctx!.stroke();
            }
          }
        }
      }

      if (mouse) {
        for (const p of particles) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_LINK_DIST) {
            ctx!.strokeStyle = `rgba(245, 158, 11, ${0.4 * (1 - dist / MOUSE_LINK_DIST)})`;
            ctx!.lineWidth = 1.1;
            ctx!.beginPath();
            ctx!.moveTo(mouse.x, mouse.y);
            ctx!.lineTo(p.x, p.y);
            ctx!.stroke();
          }
        }
        ctx!.fillStyle = "rgba(245, 158, 11, 0.9)";
        ctx!.beginPath();
        ctx!.arc(mouse.x, mouse.y, 2.4, 0, Math.PI * 2);
        ctx!.fill();
      }

      particles.forEach((p) => {
        ctx!.fillStyle = COLORS[p.c];
        ctx!.globalAlpha = 0.95;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.globalAlpha = 1;
      });

      rafId = requestAnimationFrame(step);
    }

    resize();
    initParticles();
    rafId = requestAnimationFrame(step);

    function onResize() {
      // Mobile browsers fire "resize" for height-only changes constantly
      // (on-screen keyboard, address-bar show/hide on any tap or input focus)
      // — reinitializing the canvas/particles on those was causing a visible
      // jump/scroll-reset on basically every interaction. Only real width
      // changes (rotation, actual window resize) warrant a re-init.
      if (window.innerWidth === width) return;
      resize();
      initParticles();
    }
    function updateRunning() {
      const shouldRun = document.visibilityState === "visible" && !busy;
      if (shouldRun === running) return;
      running = shouldRun;
      if (running) {
        if (rafId == null) rafId = requestAnimationFrame(step);
      } else if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
    function onVisibility() {
      updateRunning();
    }
    function onMouseMove(e: MouseEvent) {
      mouse = { x: e.clientX, y: e.clientY };
    }
    function onMouseLeave() {
      mouse = null;
    }

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onMouseLeave);
    const unsubscribeBusy = subscribeBackgroundBusy((b) => {
      busy = b;
      setPaused(b);
      updateRunning();
    });

    return () => {
      running = false;
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      unsubscribeBusy();
    };
  }, []);

  return <canvas ref={canvasRef} className={`tl-particles-canvas ${paused ? "is-paused" : ""}`} aria-hidden="true" />;
}
