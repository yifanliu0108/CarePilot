import { useEffect, useRef } from "react";

/**
 * Soft animated backdrop: gene-like node networks + drifting “whole food” dots.
 * Uses CarePilot palette (sage / gray-greens / muted red) — no extra theme deps.
 */
export function LoginGeneFoodCanvas({
  className = "",
}: {
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const onMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener("mousemove", onMove);

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);

    const resize = () => {
      const navH = 56;
      const w = window.innerWidth;
      const h = Math.max(320, window.innerHeight - navH);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Gene nodes (fractional positions) + pair indices for “strand” links
    const geneNodes = [
      { fx: 0.06, fy: 0.22, r: 5 },
      { fx: 0.14, fy: 0.38, r: 6 },
      { fx: 0.1, fy: 0.55, r: 4 },
      { fx: 0.88, fy: 0.18, r: 5 },
      { fx: 0.92, fy: 0.42, r: 7 },
      { fx: 0.84, fy: 0.62, r: 5 },
      { fx: 0.48, fy: 0.88, r: 6 },
      { fx: 0.62, fy: 0.78, r: 4 },
    ];
    const geneLinks: [number, number][] = [
      [0, 1],
      [1, 2],
      [3, 4],
      [4, 5],
      [6, 7],
      [1, 6],
      [4, 7],
    ];

    const foods = [
      { fx: 0.22, fy: 0.72, seed: 1.2, hue: "sage" as const },
      { fx: 0.72, fy: 0.28, seed: 2.1, hue: "mint" as const },
      { fx: 0.38, fy: 0.12, seed: 0.7, hue: "berry" as const },
      { fx: 0.55, fy: 0.48, seed: 1.9, hue: "sage" as const },
      { fx: 0.78, fy: 0.82, seed: 1.4, hue: "berry" as const },
    ];

    const colors = {
      line: "rgba(79, 115, 106, 0.22)",
      nodeCore: "rgba(79, 115, 106, 0.55)",
      nodeRing: "rgba(93, 134, 124, 0.35)",
      sage: "rgba(79, 115, 106, 0.2)",
      mint: "rgba(157, 206, 196, 0.35)",
      berry: "rgba(154, 91, 82, 0.18)",
      glow: "rgba(79, 115, 106, 0.06)",
    };

    let raf = 0;
    let t0 = performance.now();

    const draw = (now: number) => {
      const t = reducedMotion ? 0 : (now - t0) / 1000;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const mx = (mouseRef.current.x - 0.5) * 24;
      const my = (mouseRef.current.y - 0.5) * 20;

      ctx.clearRect(0, 0, w, h);

      // Soft vignette + radial wells (food / vitality)
      const g0 = ctx.createRadialGradient(
        w * 0.2 + mx,
        h * 0.85 + my,
        0,
        w * 0.2,
        h * 0.85,
        h * 0.55,
      );
      g0.addColorStop(0, "rgba(157, 206, 196, 0.12)");
      g0.addColorStop(1, "rgba(233, 239, 237, 0)");
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, w, h);

      const g1 = ctx.createRadialGradient(
        w * 0.85 - mx,
        h * 0.15 - my,
        0,
        w * 0.85,
        h * 0.15,
        h * 0.45,
      );
      g1.addColorStop(0, "rgba(154, 91, 82, 0.08)");
      g1.addColorStop(1, "rgba(233, 239, 237, 0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      // Drifting “whole food” orbs
      for (const f of foods) {
        const bob = Math.sin(t * 0.7 + f.seed) * 10;
        const cx = f.fx * w + mx * 0.4 + Math.cos(t * 0.35 + f.seed) * 12;
        const cy = f.fy * h + my * 0.35 + bob;
        const rad = 22 + Math.sin(t * 1.1 + f.seed) * 4;
        const fill =
          f.hue === "mint"
            ? colors.mint
            : f.hue === "berry"
              ? colors.berry
              : colors.sage;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = colors.glow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      }

      // Gene links (double-helix hint: paired curves)
      ctx.lineWidth = 1.5;
      for (const [a, b] of geneLinks) {
        const na = geneNodes[a];
        const nb = geneNodes[b];
        const ax = na.fx * w + mx;
        const ay = na.fy * h + my + Math.sin(t * 1.2 + a) * 3;
        const bx = nb.fx * w + mx;
        const by = nb.fy * h + my + Math.sin(t * 1.2 + b) * 3;
        const mxp = (ax + bx) / 2 + Math.sin(t * 0.9 + a + b) * 40;
        const myp = (ay + by) / 2 + Math.cos(t * 0.8 + a) * 25;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mxp, myp, bx, by);
        ctx.strokeStyle = colors.line;
        ctx.stroke();
      }

      // Nodes (bases)
      geneNodes.forEach((n, i) => {
        const cx = n.fx * w + mx;
        const cy = n.fy * h + my + Math.sin(t * 1.4 + i * 0.7) * 4;
        const pulse = 1 + Math.sin(t * 2 + i) * 0.12;
        const r = n.r * pulse;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = colors.nodeRing;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = colors.nodeCore;
        ctx.fill();
      });

      if (!reducedMotion) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden
      style={{ display: "block" }}
    />
  );
}
