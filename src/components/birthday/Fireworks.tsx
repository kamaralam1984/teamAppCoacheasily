import { useEffect, useRef } from "react";

const COLOURS = [
  "#ffd166",
  "#ff6b6b",
  "#4ecdc4",
  "#a78bfa",
  "#ff9f1c",
  "#f7f7f7",
  "#7bed9f",
  "#ff6fb5",
];

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  colour: string;
  size: number;
}

interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  w: number;
  h: number;
  colour: string;
}

/** Rockets that burst into sparks, with confetti raining behind them. Draws on one canvas, stops when removed. */
export function Fireworks() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const sparks: Spark[] = [];
    const confetti: Confetto[] = [];
    const pick = () => COLOURS[Math.floor(Math.random() * COLOURS.length)]!;

    function burst(x: number, y: number) {
      const count = 70 + Math.floor(Math.random() * 40);
      const colour = pick();
      const second = pick();
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const speed = 1.5 + Math.random() * 4.2;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          max: 60 + Math.random() * 40,
          colour: i % 3 === 0 ? second : colour,
          size: 1.4 + Math.random() * 1.8,
        });
      }
    }

    function rain() {
      confetti.push({
        x: Math.random() * width,
        y: -12,
        vx: (Math.random() - 0.5) * 1.6,
        vy: 1.4 + Math.random() * 2.2,
        spin: (Math.random() - 0.5) * 0.3,
        angle: Math.random() * Math.PI,
        w: 6 + Math.random() * 6,
        h: 3 + Math.random() * 5,
        colour: pick(),
      });
    }

    let frame = 0;
    let raf = 0;
    // an opening salvo, then a steady show
    for (let i = 0; i < 4; i++) {
      window.setTimeout(
        () => burst(width * (0.2 + Math.random() * 0.6), height * (0.15 + Math.random() * 0.35)),
        i * 220,
      );
    }
    const timer = window.setInterval(() => {
      burst(width * (0.1 + Math.random() * 0.8), height * (0.1 + Math.random() * 0.45));
    }, 650);

    function tick() {
      frame += 1;
      ctx!.globalCompositeOperation = "source-over";
      ctx!.clearRect(0, 0, width, height);
      if (frame % 3 === 0) rain();

      ctx!.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.life += 1;
        s.vy += 0.045;
        s.vx *= 0.985;
        s.x += s.vx;
        s.y += s.vy;
        const fade = 1 - s.life / s.max;
        if (fade <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx!.globalAlpha = fade;
        ctx!.fillStyle = s.colour;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.size * (0.6 + fade * 0.6), 0, Math.PI * 2);
        ctx!.fill();
      }

      ctx!.globalCompositeOperation = "source-over";
      ctx!.globalAlpha = 1;
      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i]!;
        c.x += c.vx;
        c.y += c.vy;
        c.angle += c.spin;
        if (c.y > height + 20) {
          confetti.splice(i, 1);
          continue;
        }
        ctx!.save();
        ctx!.translate(c.x, c.y);
        ctx!.rotate(c.angle);
        ctx!.fillStyle = c.colour;
        ctx!.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx!.restore();
      }
      raf = window.requestAnimationFrame(tick);
    }
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(timer);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0" />;
}
