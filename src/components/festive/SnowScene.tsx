import { useEffect, useRef } from "react";

/**
 * Realistic snowfall over the whole app. Never takes a click.
 *
 * - Flakes fall in three depths (far: small, slow, faint; near: big, soft, fast) with a wind
 *   that gusts, each flake swaying on its own, and a little parallax when the page scrolls.
 * - Snow settles on buttons and cards: a cap grows on their top edge as flakes land on it.
 *   Caps on the page are real elements in the page (an SVG each), so they scroll with it
 *   exactly; only the top bar and sidebar, which never scroll, are drawn on the canvas.
 * - Click a button or card and its snow breaks into lumps that fall off; it builds up again.
 *   Hovering one shakes a little powder loose.
 */

/** What snow settles on. Small chips and icons are skipped by size below. */
const TARGETS = [
  "main .btn3d",
  "main a.rounded-full",
  "main [data-tour='attendance'] > div.rounded-lg",
  "main button.rounded-full",
  "main .ce-card",
  "main .ce-meeting-card",
  "main .xm-banner",
  "main section.ce-rise",
  // the navbar: a layer of snow along the bar, and on every tab in it
  "header nav",
  "header nav a",
  "aside[aria-label='Personal']",
  "aside[aria-label='Personal'] nav a",
].join(",");

const SVG_NS = "http://www.w3.org/2000/svg";

interface Flake {
  x: number;
  y: number;
  r: number;
  /** 0 far … 2 near */
  depth: number;
  vy: number;
  phase: number;
  sway: number;
  alpha: number;
}

interface Lump {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  life: number;
  powder: boolean;
}

interface Cap {
  /** 0 bare … 1 full */
  snow: number;
  seed: number[];
  drips: { at: number; len: number; w: number }[];
  radius: number;
  /** in the top bar or the sidebar: never scrolls, drawn on the canvas */
  fixed: boolean;
  /** for page caps: the SVG in the page layer, and what it last showed */
  svg: SVGSVGElement | null;
  drawn: { snow: number; w: number; x: number; y: number; limit?: number };
  /** thickest this cap may grow: never over the text of whatever sits just above */
  limit: number;
  /** a scrolling box (the sidebar list) the cap must stay inside */
  clipEl: Element | null;
  /** seconds it has been full, how long it waits before sliding, and the slide in progress */
  full: number;
  patience: number;
  slide: number;
  side: number;
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/** A soft round flake, pre-drawn once per blur level. */
function flakeSprite(soft: number): HTMLCanvasElement {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(Math.max(0.05, 0.55 - soft * 0.35), "rgba(255,255,255,0.95)");
  grad.addColorStop(Math.min(0.95, 0.75 - soft * 0.1), "rgba(235,243,255,0.45)");
  grad.addColorStop(1, "rgba(220,232,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

/** Cap thickness on top of an element `width` wide, in px. */
const maxThick = (width: number) => Math.max(8, Math.min(20, 4 + width * 0.022));

/** How thick this cap may get on an element `width` wide. */
const thickOf = (cap: Cap, width: number) => Math.min(maxThick(width), cap.limit);

/**
 * Room above an element before the nearest thing over it (in the same column), plus the
 * padding such a thing always has under its text: the snow may fill that, never more.
 */
function roomAbove(el: Element): number {
  const r = el.getBoundingClientRect();
  let node: Element | null = el;
  for (let depth = 0; node && depth < 6; depth++) {
    for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
      const sr = sib.getBoundingClientRect();
      if (sr.height === 0) continue;
      const overlaps = sr.right > r.left + 2 && sr.left < r.right - 2;
      if (overlaps && sr.bottom <= r.top + 2) return Math.max(0, r.top - sr.bottom);
    }
    node = node.parentElement;
    if (!node || node.matches("main, header, aside")) break;
  }
  return 60;
}

/** Where the cap's top edge is above `x` (from 0 to width), as a height in px. */
function capHeight(cap: Cap, width: number, x: number): number {
  const inset = Math.min(cap.radius * 0.55, width / 4);
  const x0 = inset;
  const x1 = width - inset;
  const t = (x - x0) / (x1 - x0);
  if (t <= 0 || t >= 1) return 0;
  const env = Math.pow(Math.sin(Math.PI * t), 0.35);
  const s = cap.seed;
  const bumps =
    0.72 +
    0.12 * Math.sin(t * 7 + s[0]!) +
    0.09 * Math.sin(t * 17 + s[1]!) +
    0.07 * Math.sin(t * 31 + s[2]!);
  return thickOf(cap, width) * cap.snow * env * bumps;
}

/**
 * The outline of a cap on an element `width` wide whose top edge is at y = `base`, starting
 * at x = `ox`. Used for both the SVG (page) and the canvas (top bar, sidebar).
 */
function capOutline(cap: Cap, width: number, ox: number, base: number) {
  const inset = Math.min(cap.radius * 0.55, width / 4);
  const x0 = inset - 1.5;
  const x1 = width - inset + 1.5;
  const step = Math.max(3, (x1 - x0) / 60);
  const top: [number, number][] = [];
  for (let x = x0; x <= x1; x += step) top.push([ox + x, base + 1.5 - capHeight(cap, width, x)]);
  top.push([ox + x1, base + 1.5 - capHeight(cap, width, x1)]);
  const drips = cap.drips.map((d) => ({
    cx: ox + x0 + (x1 - x0) * d.at,
    len: d.len * cap.snow,
    w: d.w,
  }));
  return { top, drips, x0: ox + x0, x1: ox + x1, bottom: base + 2.5 };
}

function capPathD(cap: Cap, width: number, ox: number, base: number): string {
  const o = capOutline(cap, width, ox, base);
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(o.x0)} ${f(o.bottom)}`;
  for (const [x, y] of o.top) d += `L${f(x)} ${f(y)}`;
  d += `L${f(o.x1)} ${f(o.bottom)}`;
  for (let i = o.drips.length - 1; i >= 0; i--) {
    const { cx, len, w } = o.drips[i]!;
    d += `L${f(cx + w / 2)} ${f(o.bottom)}Q${f(cx + w / 2)} ${f(o.bottom + len)} ${f(cx)} ${f(o.bottom + len)}Q${f(cx - w / 2)} ${f(o.bottom + len)} ${f(cx - w / 2)} ${f(o.bottom)}`;
  }
  return `${d}Z`;
}

function rimPathD(cap: Cap, width: number, ox: number, base: number): string {
  const o = capOutline(cap, width, ox, base);
  const pts = o.top.slice(1, -1);
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${(y + 0.8).toFixed(1)}`).join("");
}

export function SnowScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    if (!canvas || !layer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites = [flakeSprite(0.1), flakeSprite(0.5), flakeSprite(0.95)];
    let w = 0;
    let h = 0;
    let dpr = 1;
    const flakes: Flake[] = [];
    const lumps: Lump[] = [];
    const caps = new Map<Element, Cap>();
    let elements: Element[] = [];
    let headerBottom = 0;
    let lastScroll = window.scrollY;

    const newFlake = (anywhere: boolean): Flake => {
      const roll = Math.random();
      const depth = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
      const r = depth === 0 ? rand(0.8, 1.8) : depth === 1 ? rand(1.8, 3.2) : rand(3.2, 5.5);
      return {
        x: rand(-40, w + 40),
        y: anywhere ? rand(-h * 0.1, h) : rand(-60, -10),
        r,
        depth,
        vy:
          (depth === 0 ? rand(18, 32) : depth === 1 ? rand(34, 58) : rand(60, 95)) *
          (calm ? 0.5 : 1),
        phase: rand(0, Math.PI * 2),
        sway: rand(0.4, 1.4),
        alpha: depth === 0 ? rand(0.35, 0.6) : depth === 1 ? rand(0.6, 0.85) : rand(0.75, 0.95),
      };
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const want = Math.min(calm ? 70 : 260, Math.round((w * h) / (calm ? 22000 : 7000)));
      while (flakes.length < want) flakes.push(newFlake(true));
      flakes.length = want;
    };

    const makeSvg = (): SVGSVGElement => {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("class", "xm-cap");
      const body = document.createElementNS(SVG_NS, "path");
      body.setAttribute("fill", "url(#xm-cap-fill)");
      const rim = document.createElementNS(SVG_NS, "path");
      rim.setAttribute("fill", "none");
      rim.setAttribute("stroke", "rgba(255,255,255,0.95)");
      rim.setAttribute("stroke-width", "1");
      svg.append(body, rim);
      for (let i = 0; i < 3; i++) {
        const g = document.createElementNS(SVG_NS, "path");
        g.setAttribute("class", "xm-glint");
        g.setAttribute("style", `animation-delay:${(i * 1.1 + Math.random()).toFixed(2)}s`);
        svg.append(g);
      }
      layer.append(svg);
      return svg;
    };

    const capFor = (el: Element): Cap => {
      let cap = caps.get(el);
      if (!cap) {
        const cs = getComputedStyle(el);
        const fixed = Boolean(el.closest("header, aside"));
        cap = {
          snow: rand(0.55, 0.95),
          seed: Array.from({ length: 6 }, () => rand(0, Math.PI * 2)),
          drips: Array.from({ length: Math.floor(rand(1, 4)) }, () => ({
            at: rand(0.12, 0.88),
            len: rand(2, 5),
            w: rand(4, 9),
          })),
          radius: Math.min(parseFloat(cs.borderTopLeftRadius) || 0, 400),
          fixed,
          svg: fixed ? null : makeSvg(),
          drawn: { snow: -1, w: -1, x: -1e9, y: -1e9 },
          limit: 20,
          clipEl: el.closest("aside nav"),
          full: 0,
          patience: rand(5, 12),
          slide: 0,
          side: 1,
        };
        caps.set(el, cap);
      }
      return cap;
    };

    const dropCap = (el: Element) => {
      caps.get(el)?.svg?.remove();
      caps.delete(el);
    };

    const refreshTargets = () => {
      elements = Array.from(document.querySelectorAll(TARGETS)).slice(0, 80);
      const keep = new Set(elements);
      for (const el of [...caps.keys()]) if (!el.isConnected || !keep.has(el)) dropCap(el);
      for (const el of elements) {
        const cap = capFor(el);
        cap.limit = Math.max(3, roomAbove(el) + 8);
      }
      headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    };

    /** Put a page cap's SVG where its element is, redrawing only what changed. */
    const placeSvg = (cap: Cap, r: DOMRect, layerRect: DOMRect) => {
      const svg = cap.svg!;
      const pad = 6;
      const thick = thickOf(cap, r.width) + 2;
      const x = r.left - layerRect.left - pad;
      const y = r.top - layerRect.top - thick;
      const d = cap.drawn;
      if (Math.abs(d.x - x) > 0.25 || Math.abs(d.y - y) > 0.25) {
        svg.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        d.x = x;
        d.y = y;
      }
      if (
        Math.abs(d.snow - cap.snow) < 0.012 &&
        Math.abs(d.w - r.width) < 0.5 &&
        d.limit === cap.limit
      )
        return;
      const W = r.width + pad * 2;
      const H = thick + 9;
      svg.setAttribute("width", W.toFixed(1));
      svg.setAttribute("height", H.toFixed(1));
      svg.setAttribute("viewBox", `0 0 ${W.toFixed(1)} ${H.toFixed(1)}`);
      svg.style.opacity = cap.snow < 0.04 ? "0" : "1";
      const [body, rim, ...glints] = Array.from(svg.children) as SVGPathElement[];
      body!.setAttribute("d", capPathD(cap, r.width, pad, thick));
      rim!.setAttribute("d", rimPathD(cap, r.width, pad, thick));
      glints.forEach((g, i) => {
        const t = (cap.seed[i + 3]! / (Math.PI * 2)) * 0.8 + 0.1;
        const gx = pad + r.width * t;
        const gy = thick + 3.5 - capHeight(cap, r.width, r.width * t);
        g.setAttribute(
          "d",
          `M${(gx - 1.8).toFixed(1)} ${gy.toFixed(1)}h3.6M${gx.toFixed(1)} ${(gy - 1.8).toFixed(1)}v3.6`,
        );
      });
      d.snow = cap.snow;
      d.w = r.width;
      d.limit = cap.limit;
    };

    /** Top bar and sidebar caps, on the canvas (they never scroll). */
    const drawFixedCap = (cap: Cap, r: DOMRect) => {
      if (cap.snow < 0.04) return;
      ctx.save();
      if (cap.clipEl) {
        // a tab in the sidebar list: keep the snow inside the list as it scrolls
        const c = clipRects.get(cap.clipEl) ?? cap.clipEl.getBoundingClientRect();
        ctx.beginPath();
        ctx.rect(c.left - 8, c.top - 6, c.width + 16, c.height + 6);
        ctx.clip();
      }
      const path = new Path2D(capPathD(cap, r.width, r.left, r.top));
      const top = r.top - thickOf(cap, r.width) * cap.snow;
      const grad = ctx.createLinearGradient(0, top, 0, r.top + 6);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.55, "#f4f8fd");
      grad.addColorStop(1, "#c9d8ea");
      // no blurred shadow under it: a canvas blur on every cap, every frame, is very costly
      ctx.fillStyle = grad;
      ctx.fill(path);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1;
      ctx.stroke(new Path2D(rimPathD(cap, r.width, r.left, r.top)));
      ctx.restore();
    };

    /** Knock the snow off an element: lumps and powder fall from where the cap was. */
    const shake = (el: Element, amount = 1) => {
      const cap = caps.get(el);
      if (!cap || cap.snow < 0.08) return;
      const r = el.getBoundingClientRect();
      const thick = thickOf(cap, r.width) * cap.snow;
      const count = Math.round(Math.min(46, (r.width / 9) * cap.snow + 4) * amount);
      if (amount >= 1) {
        for (let i = 0; i < count; i++) {
          const x = rand(r.left + 4, r.right - 4);
          lumps.push({
            x,
            y: r.top + 1.5 - capHeight(cap, r.width, x - r.left) + rand(0, thick * 0.6),
            vx: rand(-40, 40),
            vy: rand(-90, -10),
            r: rand(1.6, Math.max(2.2, thick * 0.45)),
            rot: rand(0, Math.PI),
            vr: rand(-6, 6),
            life: 1,
            powder: false,
          });
        }
      }
      for (let i = 0; i < Math.max(4, count * 1.5); i++) {
        lumps.push({
          x: rand(r.left, r.right),
          y: r.top - rand(0, thick),
          vx: rand(-60, 60),
          vy: rand(-120, -20) * (amount >= 1 ? 1 : 0.4),
          r: rand(0.6, 1.4),
          rot: 0,
          vr: 0,
          life: 1,
          powder: true,
        });
      }
      cap.snow = amount >= 1 ? 0 : Math.max(0, cap.snow - 0.06);
    };

    /** The innermost snowy thing under `t`. */
    const targetOf = (t: EventTarget | null): Element | null => {
      if (!(t instanceof Element)) return null;
      let best: Element | null = null;
      for (const el of elements) if (el.contains(t) && (!best || best.contains(el))) best = el;
      return best;
    };

    const onClick = (e: MouseEvent) => {
      const el = targetOf(e.target);
      if (el) shake(el);
    };

    let hovered: Element | null = null;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = targetOf(e.target);
      if (el && el !== hovered && el.matches(".btn3d, a, button")) shake(el, 0.25);
      hovered = el;
    };

    const clipRects = new Map<Element, DOMRect>();
    let raf = 0;
    let last = performance.now();
    let sinceRefresh = 1;
    let wind = 0;
    let windGoal = 12;
    let windTimer = 0;
    let sinceGust = 15;
    const blowFog = (right: boolean) => {
      const fog = document.querySelector<HTMLElement>(".xm-fog");
      if (!fog || calm) return;
      fog.classList.remove("is-right", "is-left");
      void fog.offsetWidth; // restart the animation
      fog.classList.add(right ? "is-right" : "is-left");
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sinceRefresh += dt;
      if (sinceRefresh > 0.6) {
        refreshTargets();
        sinceRefresh = 0;
      }
      // the wind changes its mind every few seconds, and sometimes gusts
      windTimer -= dt;
      sinceGust += dt;
      if (windTimer <= 0) {
        // a real gust every 25-45 s: the snow streams sideways and a bank of mist blows through
        if (sinceGust > rand(25, 45)) {
          windGoal = (Math.random() < 0.5 ? -1 : 1) * rand(90, 140);
          windTimer = rand(5, 7);
          sinceGust = 0;
          blowFog(windGoal > 0);
        } else {
          windGoal = rand(-14, 22);
          windTimer = rand(3, 8);
        }
      }
      wind += (windGoal - wind) * Math.min(1, dt * 0.6);
      // parallax: near flakes move with the page a little as it scrolls, far ones barely
      const scrolled = window.scrollY - lastScroll;
      lastScroll = window.scrollY;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // read every position first, then write: reading after a write makes the browser lay
      // the whole page out again, once per element, which is what made pages slow
      const layerRect = layer.getBoundingClientRect();
      const rects = elements.map((el) => el.getBoundingClientRect());
      clipRects.clear();
      for (const el of elements) {
        const c = caps.get(el)?.clipEl;
        if (c && !clipRects.has(c)) clipRects.set(c, c.getBoundingClientRect());
      }
      const live: { cap: Cap; r: DOMRect }[] = [];
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]!;
        const r = rects[i]!;
        const cap = capFor(el);
        // snow builds up by itself too, slowly, so a cleared button is white again in ~40s
        cap.snow = Math.min(1, cap.snow + dt / 40);
        if (cap.slide > 0) {
          // too much snow: it slides off one end, slowly, in little clumps
          cap.slide -= dt;
          cap.snow = Math.max(0.4, cap.snow - dt * 0.32);
          if (!calm && Math.random() < dt * 22 && r.width > 0) {
            const edge =
              cap.side < 0 ? r.left + rand(2, r.width * 0.14) : r.right - rand(2, r.width * 0.14);
            const th = thickOf(cap, r.width) * cap.snow;
            lumps.push({
              x: edge,
              y: r.top - rand(0, th * 0.7),
              vx: cap.side * rand(15, 45),
              vy: rand(-10, 15),
              r: rand(1.1, Math.max(1.6, th * 0.3)),
              rot: rand(0, Math.PI),
              vr: rand(-4, 4),
              life: 1,
              powder: Math.random() < 0.4,
            });
          }
        } else if (cap.snow >= 0.995) {
          cap.full += dt;
          if (cap.full > cap.patience) {
            cap.full = 0;
            cap.patience = rand(6, 14);
            cap.slide = rand(1.4, 2.4);
            cap.side = Math.random() < 0.5 ? -1 : 1;
          }
        }
        const small = r.width < 56 || r.height < 22;
        if (cap.svg) {
          if (small) {
            if (cap.svg.style.opacity !== "0") cap.svg.style.opacity = "0";
            cap.drawn.snow = -1;
          } else placeSvg(cap, r, layerRect);
        }
        if (small || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
        live.push({ cap, r });
      }

      // falling snow
      for (const f of flakes) {
        const k = f.depth === 0 ? 0.4 : f.depth === 1 ? 0.7 : 1;
        f.phase += dt * f.sway;
        f.x += (wind * k + Math.sin(f.phase) * 14 * f.sway) * dt;
        f.y += f.vy * dt - scrolled * (0.15 + f.depth * 0.25);
        let landed = false;
        if (f.depth > 0) {
          for (const { cap, r } of live) {
            if (f.x > r.left && f.x < r.right && f.y > r.top - 4 && f.y < r.top + 6) {
              if (!cap.fixed && r.top < headerBottom) continue;
              if (Math.random() < 0.5) {
                cap.snow = Math.min(1, cap.snow + f.r * 0.004);
                landed = true;
              }
              break;
            }
          }
        }
        if (landed || f.y > h + 10 || f.y < -80 || f.x < -60 || f.x > w + 60) {
          const up = f.y < -80;
          Object.assign(f, newFlake(false));
          if (up) f.y = h + rand(0, 20) - 20;
          if (f.x < -40 || f.x > w + 40) f.x = rand(0, w);
          continue;
        }
        const size = f.r * 2 * (f.depth === 2 ? 1.6 : 1.25);
        ctx.globalAlpha = f.alpha;
        ctx.drawImage(sprites[f.depth]!, f.x - size / 2, f.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      for (const { cap, r } of live) if (cap.fixed) drawFixedCap(cap, r);

      // snow knocked off a button
      for (let i = lumps.length - 1; i >= 0; i--) {
        const p = lumps[i]!;
        p.vy += (p.powder ? 260 : 900) * dt;
        p.vx += (wind * 0.5 - p.vx) * dt * (p.powder ? 2 : 0.5);
        p.x += p.vx * dt;
        p.y += p.vy * dt - scrolled;
        p.rot += p.vr * dt;
        p.life -= dt * (p.powder ? 0.9 : 0.45);
        if (p.life <= 0 || p.y > h + 20) {
          lumps.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.min(1, p.life * 1.6);
        if (p.powder) {
          ctx.drawImage(sprites[1]!, p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * 1.25, p.r, 0, 0, Math.PI * 2);
          const g = ctx.createRadialGradient(-p.r * 0.4, -p.r * 0.4, 0, 0, 0, p.r * 1.3);
          g.addColorStop(0, "#ffffff");
          g.addColorStop(1, "#c8d6e8");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        lastScroll = window.scrollY;
        raf = requestAnimationFrame(frame);
      }
    };

    resize();
    refreshTargets();
    window.addEventListener("resize", resize);
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const el of [...caps.keys()]) dropCap(el);
    };
  }, []);

  return (
    <>
      {/* page caps live here, in the page, so they scroll with it; under the top bar */}
      <div
        ref={layerRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[35] h-0 overflow-visible"
      >
        <svg width="0" height="0" className="absolute">
          <defs>
            <linearGradient id="xm-cap-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.6" stopColor="#f3f7fc" />
              <stop offset="1" stopColor="#c3d3e8" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[45]"
        style={{ width: "100vw", height: "100vh" }}
      />
    </>
  );
}
