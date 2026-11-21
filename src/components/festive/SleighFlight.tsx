import { useEffect, useRef } from "react";

/**
 * Santa's sleigh crossing the moon in the top bar every half minute or so: four galloping
 * reindeer (Rudolph's nose glowing), Santa with his sack, a trail of gold sparkle. As it
 * passes in front of the moon a few presents tumble out, fall and come to rest on the bottom
 * of the screen. Click one (or let one fall on another, or just wait 12-20 s) and it bursts
 * open: the lid flies off, a wish (Badhai ho!, Success!…) bursts out and a fountain of
 * sparks pours up. Only the resting presents take a click.
 */

const INK = "#0b1226";
/** every shape is drawn in a glowing gold line, so the team shows against the night sky */
const GOLD = "#f6d77a";

/** One reindeer, facing left (the way the sleigh flies), in a 32 × 24 box. */
function deer(x: number, y: number, lead: boolean, delay: number): string {
  return `
  <g transform="translate(${x} ${y})">
    <g class="xm-gallop" style="animation-delay:${delay}s">
      <ellipse cx="18" cy="12" rx="9" ry="4.3" />
      <path d="M11.5 11 L6.5 4.8 L8.6 3.6 L13.6 9.2 Z" />
      <ellipse cx="5.6" cy="4.6" rx="3.3" ry="1.9" transform="rotate(-12 5.6 4.6)" />
      <path d="M7 3.4 L7.6 -0.6 L5.6 -2.6 M7.6 -0.6 L9.8 -1.8 M8.6 3.4 L10.2 0 L12.4 -0.8 M10.2 0 L10 -2.4"
        fill="none" stroke="${GOLD}" stroke-width="1" stroke-linecap="round" />
      <path d="M26.5 10.5 l3.2 -1.6" stroke="${GOLD}" stroke-width="1.4" stroke-linecap="round" />
      <g class="xm-legs-f" style="animation-delay:${delay}s">
        <path d="M12.5 14.6 L9.6 21.6 M14.6 15 L14.4 22.4" stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round" />
      </g>
      <g class="xm-legs-b" style="animation-delay:${delay}s">
        <path d="M22.6 15 L26.4 21.2 M24.8 14.4 L29.6 18.8" stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round" />
      </g>
      ${lead ? `<circle class="xm-nose" cx="2.3" cy="5.4" r="1.5" fill="#ff3b3b" />` : ""}
    </g>
  </g>`;
}

/** The whole team: reindeer at the front (left), reins, then Santa's sleigh. 196 × 34. */
const SLEIGH_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 200 40" width="100%" height="100%" fill="${INK}" stroke="${GOLD}" stroke-width="0.75" stroke-linejoin="round">
  ${deer(0, 6, true, 0)}${deer(30, 3, false, 0.15)}${deer(60, 6, false, 0.3)}${deer(90, 3, false, 0.45)}
  <path d="M6 10 Q60 16 146 15" fill="none" stroke="${GOLD}" stroke-width="0.7" />
  <path d="M34 8 Q80 14 146 15" fill="none" stroke="#f6d77a" stroke-width="0.5" opacity="0.6" />
  <g class="xm-sleigh-body">
    <circle cx="181" cy="6" r="7" />
    <circle cx="166" cy="9" r="6" />
    <circle cx="163" cy="1.5" r="2.8" />
    <path d="M160.5 0 L167 -1 L170 -5 L172 -4.4 Z" />
    <path d="M144 13 Q143 23 152 25 L180 25 Q190 25 190 15 L190 11 L174 13 L152 15 Q147 15 147 11 Z" />
    <path d="M139 29 Q135 25 140 23.5 M140 29 L184 29 Q191 29 191 24" fill="none" stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round" />
    <path d="M148 26 L150 29 M182 26 L180 29" stroke="${GOLD}" stroke-width="1.4" />
    <path d="M147 16 Q168 18 189 13" fill="none" stroke="#f6d77a" stroke-width="0.6" opacity="0.7" />
  </g>
</svg>`;

/** A wrapped present: red with a gold ribbon, or gold with a red one. The lid can fly off. */
function giftSvg(red: boolean): string {
  const box = red ? "#c8141c" : "#e2b23c";
  const dark = red ? "#7a0710" : "#8a6410";
  const rib = red ? "#f6d77a" : "#c8141c";
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" overflow="visible">
  <rect x="2.6" y="9.4" width="18.8" height="2" fill="#2a0a05" />
  <rect x="2" y="10" width="20" height="13" rx="1.2" fill="${box}" />
  <rect x="2" y="17" width="20" height="6" fill="${dark}" opacity="0.35" />
  <rect x="10.5" y="10" width="3" height="13" fill="${rib}" />
  <rect x="3" y="11" width="1.2" height="10" fill="#fff" opacity="0.25" />
  <g class="xm-lid">
    <rect x="1" y="6.5" width="22" height="4.5" rx="1" fill="${box}" stroke="${dark}" stroke-width="0.4" />
    <rect x="10.5" y="6.5" width="3" height="4.5" fill="${rib}" />
    <path d="M12 6.5 C 7 0, 2.5 3, 6 6 C 8 7.4, 11 6.8, 12 6.5 C 17 0, 21.5 3, 18 6 C 16 7.4, 13 6.8, 12 6.5 Z" fill="${rib}" />
  </g>
</svg>`;
}

/** What jumps out of an opened present: Christmas wishes in English, Hinglish and Marathi. */
const WISHES = [
  "Merry Christmas!",
  "Season's Greetings!",
  "Wishing you joy and success!",
  "Happy Holidays!",
  "Christmas ki dher saari badhai!",
  "Merry Christmas, khush raho!",
  "Badhai ho, aage badhte raho!",
  "Naya saal safalta laaye!",
  "नाताळच्या हार्दिक शुभेच्छा!",
  "खूप खूप शुभेच्छा!",
  "तुम्हाला यश लाभो!",
  "आनंदी नाताळ!",
];

const SPARK_COLOURS = ["#ffd66b", "#fff3c4", "#ff4b53", "#47dc84", "#f2f5fa", "#6fb6ff", "#ffb347"];

interface Gift {
  el: HTMLDivElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  /** wobble as it tumbles through the air */
  phase: number;
  /** falling, then resting on the bottom of the screen until someone opens it */
  state: "falling" | "landed" | "open";
  bounces: number;
  /** when (performance.now) a resting present bursts open by itself, clock time */
  openAt: number;
}

interface Spark {
  el: HTMLSpanElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A clear lane for a wish: where it stands, where it starts and how high it rises. */
interface Lane {
  left: number;
  start: number;
  end: number;
}

/**
 * Everything on screen a wish must not cover: every line of visible words (the page, the top
 * bar, the banners), form fields and pictures (people's photos, PH Sir's Santa). Wishes still
 * in the air are added by the caller, as their whole path.
 */
function wordsOnScreen(self: Element): Box[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out: Box[] = [];
  const add = (r: DOMRect | Box) => {
    if (r.right - r.left < 1 || r.bottom - r.top < 1) return;
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
    out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n.textContent ?? "").trim() !== "" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || self.contains(el)) continue;
    if (el.closest("script, style, noscript, template, [hidden]")) continue;
    range.selectNodeContents(n);
    for (const r of Array.from(range.getClientRects())) add(r);
  }
  for (const el of Array.from(document.querySelectorAll("input, select, textarea, img"))) {
    if (el === self) continue;
    add(el.getBoundingClientRect());
  }
  const santa = document.querySelector(".xm-santa")?.getBoundingClientRect();
  if (santa && santa.width > 0) {
    add({
      left: santa.left,
      right: santa.left + santa.width * 0.82,
      top: santa.top - 20,
      bottom: santa.top + santa.height * 0.6,
    });
  }
  return out;
}

/**
 * The best clear lane for a w × h wish wanting to start near (cx, wantTop): a column the width
 * of the wish with no words in it from where it starts up to where it ends. Prefers lanes near
 * the present, starting low and rising far.
 */
function findLane(w: number, h: number, cx: number, wantTop: number, blocked: Box[]): Lane | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // room for the swell as it sparkles away (it grows to 1.12×, i.e. 6% each side) plus air
  const padX = Math.max(8, w * 0.08);
  const padY = Math.max(8, h * 0.1);
  let best: { lane: Lane; score: number } | null = null;
  const step = 14;
  for (let left = 8; left + w <= vw - 8; left += step) {
    const right = left + w;
    // the words in this column, top to bottom
    const col = blocked
      .filter((b) => b.right > left - padX && b.left < right + padX)
      .sort((a, b) => a.top - b.top);
    // the gaps between them
    let y = 4;
    const gaps: [number, number][] = [];
    for (const b of col) {
      if (b.top - padY > y) gaps.push([y, b.top - padY]);
      y = Math.max(y, b.bottom + padY);
    }
    if (vh - 4 > y) gaps.push([y, vh - 4]);
    for (const [g0, g1] of gaps) {
      if (g1 - g0 < h) continue;
      const start = Math.max(g0, Math.min(g1 - h, wantTop));
      const end = g0;
      const rise = start - end;
      const score =
        Math.abs(left + w / 2 - cx) * 0.6 +
        Math.abs(start - wantTop) * 0.8 -
        Math.min(rise, 300) * 0.5;
      if (!best || score < best.score) best = { lane: { left, start, end }, score };
    }
  }
  return best?.lane ?? null;
}

/** Most presents that may wait on the floor at once; the oldest goes when another lands. */
const MAX_WAITING = 6;

export function SleighFlight() {
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sleigh = document.createElement("div");
    sleigh.className = "xm-sleigh-fly";
    sleigh.innerHTML = SLEIGH_SVG;
    sleigh.style.opacity = "0";
    layer.append(sleigh);

    const gifts: Gift[] = [];
    /**
     * The whole path of every wish still in the air (from where it starts up to where it ends),
     * booked until it is gone, so wishes bursting at the same time never land on each other.
     */
    const flying: { box: Box; until: number }[] = [];
    const sparks: Spark[] = [];
    /** fountains still pouring: where, and for how much longer */
    const fountains: { x: number; y: number; t: number }[] = [];
    let raf = 0;
    let recheck = 0;
    let last = performance.now();
    // the first pass comes soon after the page opens, then every 22-32 seconds
    // clock time (not frames), so a slow phone or a background tab keeps the same rhythm
    let nextFlightAt = performance.now() + 4000;
    let flight: {
      t: number;
      dur: number;
      from: number;
      to: number;
      cy: number;
      w: number;
      moonX: number;
      dropped: number;
      sparkle: number;
    } | null = null;

    let face: Box | null = null;
    let rescan = 0;
    const moon = () => document.querySelector(".xm-moon-header")?.getBoundingClientRect() ?? null;

    const start = () => {
      const m = moon();
      if (!m || m.width === 0) return;
      const vw = window.innerWidth;
      const w = Math.max(110, Math.min(210, m.width * 3.4));
      flight = {
        t: 0,
        dur: Math.max(6.5, Math.min(11, vw / 170)) * (calm ? 1.6 : 1),
        from: vw + 30,
        to: -w - 40,
        cy: m.top + m.height * 0.42,
        w,
        moonX: m.left + m.width / 2,
        dropped: 0,
        sparkle: 0,
      };
      sleigh.style.width = `${w}px`;
      sleigh.style.height = `${(w * 40) / 200}px`;
    };

    /** The part of PH Sir's Santa picture nothing may pass over: his face and the gift. */
    const santaFace = () => {
      const r = document.querySelector(".xm-santa")?.getBoundingClientRect();
      if (!r || r.width === 0) return null;
      return {
        left: r.left - 10,
        right: r.left + r.width * 0.82 + 10,
        top: r.top - 20,
        bottom: r.top + r.height * 0.6,
      };
    };

    const place = (g: Gift) => {
      g.el.style.transform = `translate(${(g.x - g.size / 2).toFixed(1)}px, ${(g.y - g.size / 2).toFixed(1)}px) rotate(${g.rot.toFixed(1)}deg)`;
    };

    const dropGift = (x: number, y: number, vx: number) => {
      const el = document.createElement("div");
      const size = rand(28, 36) * (window.innerWidth < 640 ? 0.85 : 1);
      el.className = "xm-gift-fall";
      el.style.width = el.style.height = `${size}px`;
      el.innerHTML = giftSvg(Math.random() < 0.6);
      layer.append(el);
      const g: Gift = {
        el,
        x,
        y,
        // with PH Sir's Santa on screen, presents drift away from him, never across his face
        vx: santaFace() ? rand(25, 55) : vx * 0.25 + rand(-25, 25),
        vy: rand(-20, 10),
        rot: rand(-20, 20),
        vr: rand(-140, 140),
        size,
        phase: rand(0, 6),
        state: "falling",
        bounces: 0,
        openAt: 0,
      };
      const open = () => openGift(g);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
      gifts.push(g);
    };

    const sparkle = (x: number, y: number) => {
      const s = document.createElement("span");
      s.className = "xm-trail";
      s.style.left = `${x + rand(-3, 3)}px`;
      s.style.top = `${y + rand(-3, 3)}px`;
      layer.append(s);
      window.setTimeout(() => s.remove(), 1200);
    };

    const spark = (x: number, y: number, vx: number, vy: number, big = false) => {
      const el = document.createElement("span");
      el.className = big ? "xm-burst xm-burst-big" : "xm-burst";
      const c = SPARK_COLOURS[Math.floor(Math.random() * SPARK_COLOURS.length)]!;
      el.style.background = c;
      el.style.boxShadow = `0 0 6px 1px ${c}`;
      if (Math.random() < 0.35) el.style.borderRadius = "1px"; // a few bits of confetti
      layer.append(el);
      sparks.push({ el, x, y, vx, vy, life: 1, decay: rand(0.55, 0.9) });
    };

    /** Open a present: the lid flies off, a wish bursts out, and a fountain of sparks pours. */
    const openGift = (g: Gift) => {
      if (g.state === "open") return;
      g.state = "open";
      g.el.classList.add("is-open");
      g.el.style.pointerEvents = "none";
      const cx = g.x;
      const top = g.y - g.size / 2;
      // the blast: a flash and a ring of sparks
      const flash = document.createElement("span");
      flash.className = "xm-flash";
      flash.style.left = `${cx}px`;
      flash.style.top = `${top}px`;
      layer.append(flash);
      window.setTimeout(() => flash.remove(), 900);
      const ring = calm ? 14 : 36;
      for (let i = 0; i < ring; i++) {
        const a = (i / ring) * Math.PI * 2;
        const v = rand(160, 340);
        spark(cx, top, Math.cos(a) * v, Math.sin(a) * v - 120, true);
      }
      // the wish: it pops out of the box and rises up a clear lane of the screen (one with no
      // words of the page in it, so text never sits on text), then sparkles away at the top
      const word = document.createElement("div");
      word.className = "xm-wish";
      const text = document.createElement("span");
      text.className = "xm-wish-text";
      text.textContent = WISHES[Math.floor(Math.random() * WISHES.length)]!;
      // Marathi: the script face has no Devanagari, so it gets the display face instead
      if (/[\u0900-\u097F]/.test(text.textContent)) text.classList.add("is-devanagari");
      word.append(text);
      word.style.visibility = "hidden";
      layer.append(word);
      const now0 = performance.now();
      for (let k = flying.length - 1; k >= 0; k--) if (flying[k]!.until < now0) flying.splice(k, 1);
      const blocked = [...wordsOnScreen(word), ...flying.map((f) => f.box)];
      let lane: Lane | null = null;
      for (const scale of [1, 0.78, 0.6]) {
        text.style.fontSize = "";
        if (scale !== 1) {
          const full = parseFloat(getComputedStyle(text).fontSize) || 40;
          text.style.fontSize = `${Math.round(full * scale)}px`;
        }
        // its real size (offset*, not getBoundingClientRect: the pop-in animation has
        // already scaled it down to a fifth)
        const w = word.offsetWidth;
        const h = word.offsetHeight;
        lane = findLane(w, h, cx, top - h - 18, blocked);
        if (lane) break;
      }
      if (!lane) {
        word.remove(); // nowhere clear to show it: the burst and fountain still happen
      } else {
        word.style.left = `${lane.left}px`;
        word.style.top = `${lane.start}px`;
        word.style.setProperty("--rise", `${Math.round(lane.start - lane.end)}px`);
        flying.push({
          box: {
            left: lane.left,
            right: lane.left + word.offsetWidth,
            top: lane.end,
            bottom: lane.start + word.offsetHeight,
          },
          until: now0 + 4100,
        });
        word.style.visibility = "";
        window.setTimeout(() => {
          // at the top: the words break into a shower of gold sparks
          const r = word.getBoundingClientRect();
          for (let k = 0; k < (calm ? 10 : 34); k++) {
            spark(rand(r.left, r.right), rand(r.top, r.bottom), rand(-120, 120), rand(-160, 20));
          }
        }, 3150);
        window.setTimeout(() => word.remove(), 4000);
      }
      // the fountain keeps pouring for a moment
      fountains.push({ x: cx, y: top + 2, t: calm ? 0.6 : 1.8 });
      window.setTimeout(() => {
        g.el.classList.add("is-gone");
        window.setTimeout(() => {
          g.el.remove();
          const i = gifts.indexOf(g);
          if (i >= 0) gifts.splice(i, 1);
        }, 600);
      }, 1800);
    };

    /**
     * Is the floor at x free for a present? Never over a button, link, field or any words of
     * the page underneath, and never touching another present.
     */
    const spotIsFree = (g: Gift, x: number, floor: number) => {
      const vw = window.innerWidth;
      if (x < g.size / 2 + 4 || x > vw - g.size / 2 - 4) return false;
      for (const o of gifts) {
        if (o === g || o.state !== "landed" || o.el.classList.contains("is-hidden")) continue;
        if (Math.abs(o.x - x) < (o.size + g.size) / 2 + 3) return false;
      }
      const h = g.size;
      for (const fx of [-0.42, 0, 0.42]) {
        for (const fy of [0.15, 0.5, 0.9]) {
          const px = x + fx * h;
          const py = floor - h + fy * h;
          for (const el of document.elementsFromPoint(px, py)) {
            if (layer.contains(el)) continue; // the presents themselves
            if (
              el.closest("a, button, input, select, textarea, label, [role='button'], [tabindex]")
            )
              return false;
            const words = Array.from(el.childNodes).some(
              (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
            );
            if (words) return false;
            break; // only the topmost thing of the page counts
          }
        }
      }
      return true;
    };

    /** The nearest free spot on the floor for a present, or null if there is none now. */
    const freeSpot = (g: Gift, floor: number): number | null => {
      if (spotIsFree(g, g.x, floor)) return g.x;
      const step = g.size * 0.5;
      for (let k = 1; k * step < window.innerWidth; k++) {
        if (spotIsFree(g, g.x - k * step, floor)) return g.x - k * step;
        if (spotIsFree(g, g.x + k * step, floor)) return g.x + k * step;
      }
      return null;
    };

    /** Settle a present on the floor, clear of the others, and let it be opened. */
    const land = (g: Gift, floor: number) => {
      g.state = "landed";
      g.y = floor - g.size / 2;
      g.rot = rand(-6, 6);
      const x = freeSpot(g, floor);
      if (x === null) g.el.classList.add("is-hidden");
      else g.x = x;
      g.openAt = performance.now() + rand(12, 20) * 1000; // nobody opens it? it bursts by itself
      g.el.classList.add("is-landed");
      g.el.style.pointerEvents = "auto";
      g.el.tabIndex = 0;
      g.el.setAttribute("role", "button");
      g.el.setAttribute("aria-label", "Open the present");
      g.el.title = "Open me!";
      place(g);
      const waiting = gifts.filter((o) => o.state === "landed");
      if (waiting.length > MAX_WAITING) {
        const oldest = waiting[0]!;
        oldest.state = "open";
        oldest.el.classList.add("is-gone");
        window.setTimeout(() => {
          oldest.el.remove();
          const i = gifts.indexOf(oldest);
          if (i >= 0) gifts.splice(i, 1);
        }, 600);
      }
    };

    const frame = (now: number) => {
      // follows the clock even on a slow device (but no huge leap after the tab was away)
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;

      if (!flight && now >= nextFlightAt) {
        start();
        nextFlightAt = now + rand(22, 32) * 1000;
      }

      if (flight) {
        const f = flight;
        f.t += dt;
        const p = Math.min(1, f.t / f.dur);
        const x = f.from + (f.to - f.from) * p;
        const h = (f.w * 40) / 200;
        // a shallow arc that dips across the moon's face, with a gentle bob from the gallop
        const rel = (x + f.w * 0.5 - f.moonX) / window.innerWidth;
        const y = f.cy - h * 0.55 + rel * rel * 160 - Math.sin(f.t * 7) * 1.5;
        const tilt = rel * 14;
        sleigh.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${tilt.toFixed(2)}deg)`;
        sleigh.style.opacity =
          p < 0.04 ? String(p / 0.04) : p > 0.96 ? String((1 - p) / 0.04) : "1";

        // Santa's sack sits at the back of the sleigh: drop presents as it crosses the moon
        const sackX = x + f.w * 0.9;
        const vx = (f.to - f.from) / f.dur;
        if (f.dropped < 3 && sackX < f.moonX + 6 - f.dropped * f.w * 0.18) {
          dropGift(sackX, y + h * 0.55, vx);
          f.dropped += 1;
        }
        f.sparkle += dt;
        if (!calm && f.sparkle > 0.045) {
          f.sparkle = 0;
          sparkle(x + f.w * 0.97, y + h * 0.7);
        }
        if (p >= 1) {
          flight = null;
          sleigh.style.opacity = "0";
        }
      }

      // presents falling to the floor (the bottom of the screen), with a bounce or two
      const floor = window.innerHeight - 4;
      // the page scrolls under the resting presents: every so often move any that now sit
      // on a button or words to a free spot (or hide it until there is one). Measuring the page
      // is costly, so it happens only on these checks, never every frame.
      recheck -= dt;
      const doRecheck = recheck <= 0;
      if (doRecheck) {
        recheck = 0.35;
        face = gifts.length ? santaFace() : null;
      }
      // a hidden present looks across the whole floor for room: much rarer
      rescan -= dt;
      const doRescan = doRecheck && rescan <= 0;
      if (doRescan) rescan = 2;
      for (const g of gifts) {
        if (g.state === "landed") {
          // stay on the floor if the window changes size
          const y = floor - g.size / 2;
          if (Math.abs(y - g.y) > 0.5) {
            g.y = y;
            place(g);
          }
          if (now >= g.openAt) {
            if (g.el.classList.contains("is-hidden")) {
              // waiting out of sight: let it go quietly
              g.state = "open";
              g.el.classList.add("is-gone");
              window.setTimeout(() => {
                g.el.remove();
                const k = gifts.indexOf(g);
                if (k >= 0) gifts.splice(k, 1);
              }, 600);
            } else openGift(g);
            continue;
          }
          if (doRecheck) {
            const hidden = g.el.classList.contains("is-hidden");
            if (hidden ? doRescan : !spotIsFree(g, g.x, floor)) {
              const x = freeSpot(g, floor);
              if (x === null) g.el.classList.add("is-hidden");
              else {
                g.el.classList.remove("is-hidden");
                if (x !== g.x) {
                  g.x = x;
                  place(g);
                }
              }
            }
          }
          continue;
        }
        if (g.state !== "falling") continue;
        g.phase += dt * 3;
        // falling through air: gravity, drag, and a little side-to-side as it tumbles
        g.vy += 520 * dt;
        g.vy *= 1 - 0.35 * dt;
        g.vx *= 1 - 0.8 * dt;
        g.x += (g.vx + (g.bounces ? 0 : Math.sin(g.phase) * 18)) * dt;
        g.y += g.vy * dt;
        g.rot += g.vr * dt;
        if (
          face &&
          g.x + g.size / 2 > face.left &&
          g.x - g.size / 2 < face.right &&
          g.y + g.size / 2 > face.top &&
          g.y - g.size / 2 < face.bottom
        ) {
          // keep clear of his face: step out to the side it is nearer
          const toRight = face.right - (g.x - g.size / 2);
          const toLeft = g.x + g.size / 2 - face.left;
          if (toRight < toLeft) {
            g.x = face.right + g.size / 2;
            g.vx = Math.abs(g.vx) + 10;
          } else {
            g.x = face.left - g.size / 2;
            g.vx = -Math.abs(g.vx) - 10;
          }
        }
        // a present falling onto one already resting: both burst open
        const hit = gifts.find(
          (o) =>
            o.state === "landed" &&
            !o.el.classList.contains("is-hidden") &&
            Math.abs(o.x - g.x) < ((o.size + g.size) / 2) * 0.8 &&
            g.y + g.size / 2 >= o.y - o.size / 2 + 2,
        );
        if (hit) {
          place(g);
          openGift(hit);
          openGift(g);
          continue;
        }
        if (g.y + g.size / 2 >= floor) {
          g.y = floor - g.size / 2;
          if (g.bounces < 2 && g.vy > 120) {
            g.vy = -g.vy * 0.32;
            g.vr *= 0.4;
            g.bounces += 1;
          } else {
            land(g, floor);
            continue;
          }
        }
        place(g);
      }

      // the fountains pour sparks upward from open presents
      for (let i = fountains.length - 1; i >= 0; i--) {
        const f = fountains[i]!;
        f.t -= dt;
        const n = calm ? 1 : 3;
        for (let k = 0; k < n; k++) spark(f.x + rand(-4, 4), f.y, rand(-70, 70), rand(-430, -260));
        if (f.t <= 0) fountains.splice(i, 1);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        p.vy += 520 * dt;
        p.vx *= 1 - 1.2 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * p.decay;
        if (p.life <= 0 || p.y > window.innerHeight + 10) {
          p.el.remove();
          sparks.splice(i, 1);
          continue;
        }
        p.el.style.opacity = Math.min(1, p.life * 1.5).toFixed(2);
        p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      }

      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      layer.replaceChildren();
    };
  }, []);

  return (
    <div ref={layerRef} className="pointer-events-none fixed inset-0 z-[46] overflow-hidden" />
  );
}
