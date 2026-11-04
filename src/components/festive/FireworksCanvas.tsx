import { useEffect, useRef } from "react";

/**
 * Real-feeling Diwali fireworks on a canvas: two anars throwing a tall, dense fountain of sparks,
 * and rockets that climb on a glowing trail and burst into a big ball of coloured sparks that
 * fall under gravity, flicker and fade. Light blends additively, so overlaps glow like the real
 * thing. Pauses when the tab is hidden; calmer (fewer, slower sparks) with Reduce motion on.
 */

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds left
  max: number;
  hue: number;
  sat: number;
  size: number;
  drag: number;
  gravity: number;
  flicker: boolean;
  px: number;
  py: number;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  hue: number;
  trail: { x: number; y: number }[];
}

const MAX_SPARKS = 900;
// red, green, blue, gold, pink, violet, white-gold
const HUES = [0, 130, 215, 45, 330, 275, 50];

export function FireworksCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rate = calm ? 0.55 : 1; // how much of everything
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const sparks: Spark[] = [];
    const rockets: Rocket[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const add = (s: Omit<Spark, "px" | "py">) => {
      if (sparks.length >= MAX_SPARKS) sparks.shift();
      sparks.push({ ...s, px: s.x, py: s.y });
    };

    /**
     * Where the show happens inside the canvas. The canvas covers the whole card (so its edge
     * never shows as a line); the fireworks keep to the right part on a wide card and to the
     * bottom 300px on a phone.
     */
    const zone = () =>
      w >= 560
        ? { x0: w * 0.58, x1: w, y0: 0, y1: h }
        : { x0: 0, x1: w, y0: Math.max(0, h - 300), y1: h };

    /** An anar at (x, ground): a tall, dense cone of gold-white sparks, now and then coloured. */
    const anarAt = () => {
      const z = zone();
      const zw = z.x1 - z.x0;
      return [
        { x: z.x0 + zw * 0.1, colourful: false },
        { x: z.x0 + zw * 0.9, colourful: true },
      ];
    };
    const ground = () => zone().y1 - 10;

    const emitAnar = (x: number, colourful: boolean, dt: number) => {
      const n = Math.round(240 * dt * rate * (0.8 + Math.random() * 0.4));
      const z = zone();
      const power = Math.min((z.y1 - z.y0) * 0.9, 420);
      for (let i = 0; i < n; i++) {
        const spread = rnd(-0.32, 0.32);
        const speed = rnd(0.55, 1) * Math.sqrt(2 * 520 * power * 0.75);
        const hue =
          colourful && Math.random() < 0.45 ? HUES[Math.floor(Math.random() * 6)]! : rnd(38, 52);
        add({
          x: x + rnd(-2, 2),
          y: ground() - 22,
          vx: Math.sin(spread) * speed,
          vy: -Math.cos(spread) * speed,
          life: rnd(0.7, 1.4),
          max: 1.4,
          hue,
          sat: hue > 35 && hue < 60 ? 95 : 100,
          size: rnd(0.8, 1.9),
          drag: 0.985,
          gravity: 520,
          flicker: Math.random() < 0.35,
        });
      }
    };

    /** A rocket bursting: a ball of sparks, a second ring, and crackling glitter. */
    const explode = (x: number, y: number, hue: number) => {
      const big = 90 + Math.round(Math.random() * 70);
      const count = Math.round(big * rate);
      const z = zone();
      const power = rnd(150, 230) * Math.min(1, Math.max(0.55, (z.x1 - z.x0) / 420));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rnd(-0.05, 0.05);
        const sp = power * rnd(0.55, 1);
        const h2 = Math.random() < 0.25 ? HUES[Math.floor(Math.random() * HUES.length)]! : hue;
        add({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rnd(1.1, 1.9),
          max: 1.9,
          hue: h2,
          sat: 100,
          size: rnd(1.3, 2.4),
          drag: 0.965,
          gravity: 120,
          flicker: Math.random() < 0.4,
        });
      }
      for (let i = 0; i < count * 0.4; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = power * rnd(0.15, 0.45);
        add({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rnd(0.8, 1.5),
          max: 1.5,
          hue: 48,
          sat: 60,
          size: rnd(0.8, 1.4),
          drag: 0.96,
          gravity: 90,
          flicker: true,
        });
      }
    };

    let nextRocket = 0.6;
    const flashes: { x: number; y: number; t: number }[] = [];
    let last = performance.now();
    let raf = 0;
    let running = true;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // launch rockets from the ground, a little apart
      nextRocket -= dt;
      if (nextRocket <= 0) {
        const z = zone();
        const zw = z.x1 - z.x0;
        const zh = z.y1 - z.y0;
        rockets.push({
          x: rnd(z.x0 + zw * 0.22, z.x0 + zw * 0.78),
          y: ground(),
          vy: -rnd(340, 440),
          targetY: rnd(z.y0 + zh * 0.12, z.y0 + zh * 0.4),
          hue: HUES[Math.floor(Math.random() * HUES.length)]!,
          trail: [],
        });
        nextRocket = rnd(0.9, 1.8) / rate;
      }

      // a clean frame every time (fading the old one leaves a haze); tails come from speed below
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (const a of anarAt()) emitAnar(a.x, a.colourful, dt);

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]!;
        r.y += r.vy * dt;
        r.vy *= 0.992;
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 14) r.trail.shift();
        // trail
        for (let k = 0; k < r.trail.length; k++) {
          const p = r.trail[k]!;
          const t = k / r.trail.length;
          ctx.fillStyle = `hsla(40, 100%, ${60 + t * 30}%, ${t * 0.8})`;
          ctx.beginPath();
          ctx.arc(p.x + rnd(-0.6, 0.6), p.y, 1 + t * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (Math.random() < 0.6) {
          add({
            x: r.x,
            y: r.y + 4,
            vx: rnd(-20, 20),
            vy: rnd(20, 60),
            life: rnd(0.2, 0.45),
            max: 0.45,
            hue: 40,
            sat: 100,
            size: 1,
            drag: 0.95,
            gravity: 200,
            flicker: true,
          });
        }
        if (r.y <= r.targetY) {
          explode(r.x, r.y, r.hue);
          flashes.push({ x: r.x, y: r.y, t: 0.35 });
          rockets.splice(i, 1);
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.life -= dt;
        if (s.life <= 0 || s.y > h + 20) {
          sparks.splice(i, 1);
          continue;
        }
        s.px = s.x;
        s.py = s.y;
        s.vx *= s.drag;
        s.vy = s.vy * s.drag + s.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const k = s.life / s.max;
        let alpha = Math.min(1, k * 1.4);
        if (s.flicker && Math.random() < 0.3) alpha *= 0.25;
        const light = 55 + k * 35;
        ctx.strokeStyle = `hsla(${s.hue}, ${s.sat}%, ${light}%, ${alpha})`;
        // a streak as long as the spark is fast, so it reads as a moving spark, not a dot
        ctx.lineWidth = s.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * 0.06, s.y - s.vy * 0.06);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }

      // glow at each anar mouth, and a brief sky flash after a burst
      for (const a of anarAt()) {
        const g = ctx.createRadialGradient(a.x, ground() - 24, 0, a.x, ground() - 24, 46);
        g.addColorStop(0, "rgba(255, 236, 170, 0.55)");
        g.addColorStop(1, "rgba(255, 180, 60, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(a.x - 50, ground() - 74, 100, 100);
      }
      // a round glow where a rocket just burst (never a full-canvas wash: that shows an edge)
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]!;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 90);
        g.addColorStop(0, `rgba(255, 240, 210, ${f.t * 0.9})`);
        g.addColorStop(1, "rgba(255, 240, 210, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(f.x - 90, f.y - 90, 180, 180);
        f.t -= dt;
        if (f.t <= 0) flashes.splice(i, 1);
      }

      // the anar cones on top, solid
      ctx.globalCompositeOperation = "source-over";
      for (const a of anarAt()) {
        const x = a.x;
        const y = ground();
        const grd = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
        grd.addColorStop(0, "#7c2d12");
        grd.addColorStop(0.5, a.colourful ? "#7c3aed" : "#ea580c");
        grd.addColorStop(1, "#7c2d12");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 22);
        ctx.lineTo(x + 6, y - 22);
        ctx.lineTo(x + 15, y);
        ctx.lineTo(x - 15, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#fde68a";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 9);
        ctx.lineTo(x + 10, y - 9);
        ctx.stroke();
      }

      if (running) raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none block h-full w-full ${className}`}
    />
  );
}
