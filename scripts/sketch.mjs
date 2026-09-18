// Generates three "pencil" drawings as SVG strings and writes sketches.tsx.
import fs from "node:fs";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;

class Sketch {
  constructor(seed, w = 300, h = 180) {
    this.r = rng(seed);
    this.w = w;
    this.h = h;
    this.out = [];
  }
  rand(a = -1, b = 1) {
    return a + (b - a) * this.r();
  }
  // Resample a polyline every ~step px and add jitter + slow wobble.
  wobble(pts, jitter, step = 5) {
    const res = [];
    const phase = this.rand(0, 6.28);
    const freq = this.rand(0.02, 0.05);
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / step));
      const nx = -(y1 - y0) / len;
      const ny = (x1 - x0) / len;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const wob = Math.sin(dist * freq + phase) * jitter * 0.9;
        const j = this.rand(-jitter, jitter) * 0.5 + wob;
        res.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]);
        dist += len / n;
      }
    }
    const last = pts[pts.length - 1];
    res.push([last[0] + this.rand(-jitter, jitter) * 0.3, last[1] + this.rand(-jitter, jitter) * 0.3]);
    return res;
  }
  extend(pts, by) {
    if (by <= 0 || pts.length < 2) return pts;
    const [a, b] = [pts[0], pts[1]];
    const [c, d] = [pts[pts.length - 2], pts[pts.length - 1]];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const l2 = Math.hypot(d[0] - c[0], d[1] - c[1]) || 1;
    const s = [a[0] - ((b[0] - a[0]) / l1) * by, a[1] - ((b[1] - a[1]) / l1) * by];
    const e = [d[0] + ((d[0] - c[0]) / l2) * by, d[1] + ((d[1] - c[1]) / l2) * by];
    return [s, ...pts, e];
  }
  path(pts, width, opacity, color) {
    const d = pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join("");
    const c = color ? ` stroke="${color}"` : "";
    this.out.push(`<path d="${d}" stroke-width="${width}" opacity="${opacity}"${c}/>`);
  }
  fillPoly(pts, color, opacity) {
    const d = pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])} ${f(p[1])}`).join("") + "Z";
    this.out.push(`<path d="${d}" fill="${color}" stroke="none" opacity="${opacity}"/>`);
  }
  // A pencil stroke: one confident pass plus a lighter, looser second pass.
  stroke(pts, { w = 1.4, o = 0.85, jitter = 1.1, passes = 2, overshoot = 2, c } = {}) {
    const base = this.extend(pts, this.rand(0, overshoot));
    this.path(this.wobble(base, jitter), w, o, c);
    for (let p = 1; p < passes; p++) {
      const b2 = this.extend(pts, this.rand(0, overshoot * 1.5));
      this.path(this.wobble(b2, jitter * 1.8), w * 0.7, o * 0.35, c);
    }
  }
  line(x0, y0, x1, y1, opt) {
    this.stroke([[x0, y0], [x1, y1]], opt);
  }
  poly(pts, opt) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      this.stroke([a, b], opt);
    }
  }
  ellipse(cx, cy, rx, ry, { turns = 1.08, start = 0, ...opt } = {}) {
    const pts = [];
    const n = Math.round(40 * turns);
    for (let i = 0; i <= n; i++) {
      const t = start + (i / n) * Math.PI * 2 * turns;
      pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
    }
    this.stroke(pts, { overshoot: 0, ...opt });
  }
  // Hatching clipped to a convex polygon.
  hatch(polyPts, angle, spacing, { w = 0.9, o = 0.28, jitter = 0.8, c } = {}) {
    const a = (angle * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const nx = -dy, ny = dx;
    const proj = polyPts.map((p) => p[0] * nx + p[1] * ny);
    const min = Math.min(...proj), max = Math.max(...proj);
    for (let c = min + spacing * this.rand(0.3, 0.9); c < max; c += spacing * this.rand(0.85, 1.15)) {
      // line: points with p·n = c ; parametrise along d
      const ts = [];
      for (let i = 0; i < polyPts.length; i++) {
        const p = polyPts[i], q = polyPts[(i + 1) % polyPts.length];
        const pp = p[0] * nx + p[1] * ny, qq = q[0] * nx + q[1] * ny;
        if ((pp - c) * (qq - c) <= 0 && pp !== qq) {
          const u = (c - pp) / (qq - pp);
          const x = p[0] + (q[0] - p[0]) * u, y = p[1] + (q[1] - p[1]) * u;
          ts.push(x * dx + y * dy);
        }
      }
      if (ts.length < 2) continue;
      const t0 = Math.min(...ts), t1 = Math.max(...ts);
      const ox = c * nx, oy = c * ny;
      const pts = [[ox + dx * t0, oy + dy * t0], [ox + dx * t1, oy + dy * t1]];
      this.path(this.wobble(this.extend(pts, this.rand(-1, 1.5)), jitter, 6), w, o, c);
    }
  }
  // A handwriting scribble along a baseline.
  scribble(x, y, len, amp = 2.2) {
    const pts = [];
    const n = Math.round(len / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x + len * t, y - Math.abs(Math.sin(i * 1.9)) * amp * this.rand(0.4, 1.4)]);
    }
    this.stroke(pts, { w: 1.1, o: 0.7, jitter: 0.5, passes: 1, overshoot: 0 });
  }
  tick(x, y, s = 5) {
    this.stroke([[x - s * 0.6, y], [x - s * 0.15, y + s * 0.6], [x + s * 0.9, y - s * 0.8]], { w: 1.3, o: 0.85, jitter: 0.4, passes: 1, overshoot: 1 });
  }
  text(x, y, str, { size = 22, c = "#f2f2f0", o = 0.92, anchor = "middle", w = 500 } = {}) {
    const esc = String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    this.out.push(`<text x="${f(x)}" y="${f(y)}" font-family="var(--hand)" font-size="${size}" font-weight="${w}" fill="${c}" stroke="none" opacity="${o}" text-anchor="${anchor}">${esc}</text>`);
  }
  // Everything drawn inside fn lands in one addressable <g>.
  group(attrs, fn) {
    const start = this.out.length;
    fn();
    const inner = this.out.splice(start);
    this.out.push(`<g ${attrs}>${inner.join("")}</g>`);
  }
  svg(seed) {
    return (
      `<svg viewBox="0 0 ${this.w} ${this.h}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#e6e6e2" stroke-linecap="round" stroke-linejoin="round">` +
      `<filter id="g${seed}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="${seed}"/><feDisplacementMap in="SourceGraphic" scale="1.4"/></filter>` +
      `<g filter="url(#g${seed})">` + this.out.join("") + `</g></svg>`
    );
  }
}

// ---------- 1. SMIS: an open register ----------
function register() {
  const s = new Sketch(11);
  const L = [[42, 42], [96, 34], [150, 38]];      // left page top edge, slight curve
  const R = [[150, 38], [204, 34], [258, 42]];    // right page top edge
  s.stroke(L, { w: 1.5 });
  s.stroke(R, { w: 1.5 });
  s.line(42, 42, 40, 152, { w: 1.5 });
  s.line(258, 42, 260, 152, { w: 1.5 });
  s.stroke([[40, 152], [150, 156], [260, 152]], { w: 1.5 });
  s.line(150, 38, 150, 156, { w: 1.2, o: 0.6 });
  // page thickness underneath
  s.stroke([[42, 155], [150, 160], [258, 155]], { w: 1, o: 0.45, passes: 1 });
  s.stroke([[45, 158], [150, 163], [255, 158]], { w: 0.9, o: 0.3, passes: 1 });
  // ruled lines
  for (let i = 0; i < 7; i++) {
    const y = 60 + i * 13;
    s.line(50, y, 142, y - 0.5, { w: 0.8, o: 0.3, passes: 1, jitter: 0.5 });
    s.line(158, y - 0.5, 250, y, { w: 0.8, o: 0.3, passes: 1, jitter: 0.5 });
  }
  // margin
  s.line(66, 48, 65, 150, { w: 0.9, o: 0.4, passes: 1 });
  // names on the left, marks on the right
  for (let i = 0; i < 7; i++) {
    const y = 60 + i * 13;
    s.scribble(72, y - 1, 36 + s.rand(-8, 16));
    const cols = [170, 188, 206, 224, 242];
    cols.forEach((cx, k) => {
      const absent = (i === 3 && k < 3) || (i === 5 && k > 2);
      const late = i === 1 && k === 0;
      if (absent) s.ellipse(cx + 1, y - 4, 3, 3, { turns: 1.15, w: 1.1, o: 0.7, passes: 1, jitter: 0.4 });
      else if (late) s.line(cx - 2, y - 4, cx + 4, y - 4, { w: 1.3, passes: 1, jitter: 0.3 });
      else s.tick(cx, y - 4, 4.5);
    });
  }
  // shadow under the book
  s.hatch([[44, 160], [258, 160], [262, 168], [40, 168]], 8, 2.6, { o: 0.16 });
  return s.svg(1);
}

// ---------- 2. HR: chalk and a duster ----------
function duster() {
  const s = new Sketch(23);
  const front = [[62, 96], [166, 96], [166, 128], [62, 128]];
  const top = [[62, 96], [166, 96], [190, 78], [86, 78]];
  const side = [[166, 96], [190, 78], [190, 110], [166, 128]];
  s.poly(front, { w: 1.5 });
  s.poly(top, { w: 1.4 });
  s.poly(side, { w: 1.4 });
  // felt line splits wood block from felt pad
  s.line(62, 114, 166, 114, { w: 1.2, o: 0.7 });
  s.line(166, 114, 190, 96, { w: 1.2, o: 0.7 });
  // wood grain on top
  for (let i = 0; i < 4; i++) {
    const y0 = 82 + i * 3.5;
    s.stroke([[90 + i * 4, y0 + 10], [180 - i * 2, y0 - 2 + i]], { w: 0.7, o: 0.22, passes: 1, jitter: 0.6 });
  }
  // shading: side face and felt
  s.hatch(side, 55, 3.2, { o: 0.32 });
  s.hatch([[62, 114], [166, 114], [166, 128], [62, 128]], 62, 2.4, { o: 0.4, w: 1 });
  s.hatch([[166, 114], [190, 96], [190, 110], [166, 128]], 62, 2.4, { o: 0.5, w: 1 });
  // chalk sticks
  const chalk = (x0, y0, x1, y1, r) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    s.line(x0 + nx * r, y0 + ny * r, x1 + nx * r, y1 + ny * r, { w: 1.4 });
    s.line(x0 - nx * r, y0 - ny * r, x1 - nx * r, y1 - ny * r, { w: 1.4 });
    const ang = Math.atan2(y1 - y0, x1 - x0);
    // end ellipse (foreshortened)
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const ex = Math.cos(t) * r * 0.45, ey = Math.sin(t) * r;
      pts.push([x1 + ex * Math.cos(ang) - ey * Math.sin(ang), y1 + ex * Math.sin(ang) + ey * Math.cos(ang)]);
    }
    s.stroke(pts, { w: 1.2, o: 0.8, overshoot: 0, jitter: 0.5 });
    // back end: half arc
    const back = [];
    for (let i = 0; i <= 20; i++) {
      const t = Math.PI / 2 + (i / 20) * Math.PI;
      const ex = Math.cos(t) * r * 0.45, ey = Math.sin(t) * r;
      back.push([x0 + ex * Math.cos(ang) - ey * Math.sin(ang), y0 + ex * Math.sin(ang) + ey * Math.cos(ang)]);
    }
    s.stroke(back, { w: 1.2, o: 0.8, overshoot: 0, jitter: 0.5 });
    // shade lower half
    s.hatch(
      [[x0, y0], [x1, y1], [x1 - nx * r, y1 - ny * r], [x0 - nx * r, y0 - ny * r]],
      (ang * 180) / Math.PI + 90, 2.2, { o: 0.22, w: 0.8 }
    );
  };
  chalk(204, 128, 268, 100, 4.5);
  chalk(214, 146, 250, 140, 4.2);
  // dust
  for (let i = 0; i < 26; i++) {
    const x = 60 + s.rand(0, 150), y = 132 + s.rand(0, 14);
    s.line(x, y, x + s.rand(0.5, 3), y + s.rand(-0.5, 0.5), { w: 0.9, o: 0.35, passes: 1, jitter: 0.2, overshoot: 0 });
  }
  // ground shadow
  s.hatch([[64, 130], [190, 130], [196, 138], [58, 138]], 6, 2.6, { o: 0.15 });
  s.hatch([[206, 132], [270, 104], [272, 110], [212, 140]], 6, 2.6, { o: 0.12 });
  return s.svg(2);
}

// ---------- 3. Learning: a pencil on an exam paper ----------
function pencil() {
  const s = new Sketch(37);
  const paper = [[64, 30], [232, 22], [240, 150], [70, 158]];
  s.poly(paper, { w: 1.5 });
  // ruled lines
  for (let i = 0; i < 8; i++) {
    const y = 48 + i * 13;
    s.line(78, y + 1, 224, y - 2, { w: 0.8, o: 0.28, passes: 1, jitter: 0.5 });
  }
  // title and answers
  s.scribble(80, 44, 70, 3);
  s.scribble(80, 70, 90 + s.rand(-10, 20));
  s.scribble(80, 83, 60 + s.rand(-10, 30));
  s.scribble(80, 96, 100 + s.rand(-10, 20));
  s.scribble(80, 122, 70 + s.rand(-10, 20));
  s.scribble(80, 135, 50 + s.rand(-10, 20));
  // the score: "84", circled
  s.ellipse(196, 51, 4.2, 5, { turns: 1.05, w: 1.5, o: 0.9, passes: 1, jitter: 0.4 });
  s.ellipse(196, 43, 3.6, 4.2, { turns: 1.05, start: 3.14, w: 1.5, o: 0.9, passes: 1, jitter: 0.4 });
  s.stroke([[213, 38], [206, 50], [216, 50]], { w: 1.5, o: 0.9, passes: 1, jitter: 0.4 });
  s.line(212, 45, 212, 57, { w: 1.5, o: 0.9, passes: 1, jitter: 0.4 });
  s.ellipse(205, 47, 19, 13, { turns: 1.2, start: 2.4, w: 1.4, o: 0.85, passes: 1, jitter: 0.9 });
  // pencil
  const ax = 34, ay = 168, bx = 206, by = 106;
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len, uy = (by - ay) / len;
  const nx = -uy, ny = ux;
  const R = 5.2;
  const off = (t, r) => [ax + ux * t + nx * r, ay + uy * t + ny * r];
  const body0 = 0, body1 = len;
  // outer edges and inner facet line
  s.stroke([off(body0, R), off(body1, R)], { w: 1.5 });
  s.stroke([off(body0, -R), off(body1, -R)], { w: 1.5 });
  s.stroke([off(body0 + 18, R * 0.3), off(body1, R * 0.3)], { w: 0.9, o: 0.5, passes: 1 });
  s.stroke([off(body0 + 18, -R * 0.35), off(body1, -R * 0.35)], { w: 0.9, o: 0.4, passes: 1 });
  // ferrule and eraser
  s.stroke([off(16, R), off(16, -R)], { w: 1.3 });
  s.stroke([off(22, R), off(22, -R)], { w: 1.1, o: 0.7, passes: 1 });
  s.stroke([off(4, R), off(4, -R)], { w: 1.1, o: 0.7, passes: 1 });
  const cap = [];
  for (let i = 0; i <= 20; i++) {
    const t = Math.PI / 2 + (i / 20) * Math.PI;
    const ex = Math.cos(t) * 4, ey = Math.sin(t) * R;
    cap.push([ax + ux * (0 + ex) + nx * ey, ay + uy * (0 + ex) + ny * ey]);
  }
  s.stroke(cap, { w: 1.4, overshoot: 0 });
  // cone tip and lead
  const tipLen = 20;
  const tip = [bx + ux * tipLen, by + uy * tipLen];
  s.stroke([off(body1, R), tip], { w: 1.5 });
  s.stroke([off(body1, -R), tip], { w: 1.5 });
  s.stroke([off(body1 + 13, R * 0.35), tip], { w: 1.6, o: 0.95, passes: 1, jitter: 0.3 });
  s.stroke([off(body1 + 13, -R * 0.35), tip], { w: 1.6, o: 0.95, passes: 1, jitter: 0.3 });
  // wood grain ripple where the cone meets the body
  const rip = [];
  for (let i = 0; i <= 12; i++) {
    const r = -R + (i / 12) * 2 * R;
    const p = off(body1 + Math.sin(i * 2.1) * 1.6, r);
    rip.push(p);
  }
  s.stroke(rip, { w: 1, o: 0.6, passes: 1, jitter: 0.3, overshoot: 0 });
  // shading on the lower facet of the body
  s.hatch([off(24, -R * 0.35), off(body1, -R * 0.35), off(body1, -R), off(24, -R)], (Math.atan2(uy, ux) * 180) / Math.PI + 75, 2.3, { o: 0.32, w: 0.9 });
  s.hatch([off(0, -R), off(16, -R), off(16, R), off(0, R)], 30, 2.2, { o: 0.25, w: 0.9 });
  // shadow of the pencil on the paper
  s.hatch([off(20, -R - 1), off(body1 + 8, -R - 1), off(body1 + 8, -R - 6), off(20, -R - 6)], (Math.atan2(uy, ux) * 180) / Math.PI + 8, 2.4, { o: 0.14 });
  return s.svg(3);
}


// ---------- 4. Vision: a teacher instructing a class ----------
const ORANGE = "#f4a21d";
const NAVY = "#3a5f8a";
function classroom() {
  const s = new Sketch(53, 1200, 520);
  const P = { jitter: 1.4 };
  // room: floor line and the corner of the room
  s.line(0, 400, 1200, 396, { w: 1.2, o: 0.5, passes: 1, jitter: 1.2 });
  // chalkboard, with a frame and a navy wash
  const board = [[150, 70], [720, 70], [720, 300], [150, 300]];
  s.fillPoly(board, NAVY, 0.42);
  s.poly(board, { w: 1.8 });
  s.poly([[142, 62], [728, 62], [728, 308], [142, 308]], { w: 1, o: 0.45, passes: 1 });
  s.line(150, 312, 720, 312, { w: 1.4, o: 0.7 }); // chalk tray
  // what is on the board: a heading, three lines of working, a small figure
  s.scribble(180, 110, 190, 4);
  s.scribble(180, 150, 300, 3);
  s.scribble(180, 180, 240, 3);
  s.scribble(180, 210, 280, 3);
  s.ellipse(600, 170, 46, 46, { turns: 1.06, w: 1.3, o: 0.8, passes: 1, jitter: 1 });
  s.line(600, 170, 640, 148, { w: 1.2, o: 0.8, passes: 1 });
  s.line(600, 170, 600, 216, { w: 1.2, o: 0.8, passes: 1 });
  s.stroke([[560, 250], [640, 250]], { w: 1.2, o: 0.6, passes: 1 });
  // chalk dust on the tray
  for (let i = 0; i < 18; i++) {
    const x = 160 + s.rand(0, 550);
    s.line(x, 316, x + s.rand(1, 4), 316.5, { w: 1, o: 0.4, passes: 1, jitter: 0.2, overshoot: 0 });
  }
  // window on the right, with the light it throws across the floor
  const win = [[900, 60], [1120, 60], [1120, 290], [900, 290]];
  s.fillPoly(win, ORANGE, 0.14);
  s.poly(win, { w: 1.6 });
  s.line(1010, 60, 1010, 290, { w: 1.1, o: 0.6, passes: 1 });
  s.line(900, 175, 1120, 175, { w: 1.1, o: 0.6, passes: 1 });
  s.line(880, 296, 1140, 296, { w: 1.4, o: 0.7 }); // sill
  const light = [[905, 300], [1125, 300], [1060, 470], [760, 470]];
  s.fillPoly(light, ORANGE, 0.09);
  s.hatch(light, 62, 9, { o: 0.16, w: 1, c: ORANGE, jitter: 1.4 });
  // the teacher, at the right of the board, one arm up to the working
  const tx = 795;
  s.ellipse(tx, 188, 17, 21, { turns: 1.06, w: 1.6, jitter: 0.8 }); // head
  s.stroke([[tx - 18, 170], [tx - 6, 160], [tx + 12, 162], [tx + 20, 176]], { w: 1.4, o: 0.8, passes: 1 }); // hair
  s.line(tx - 3, 209, tx - 3, 224, { w: 1.4, passes: 1 }); // neck
  const torso = [[tx - 32, 226], [tx + 28, 226], [tx + 20, 305], [tx - 24, 305]];
  s.poly(torso, { w: 1.6 });
  const skirt = [[tx - 24, 305], [tx + 20, 305], [tx + 40, 402], [tx - 44, 402]];
  s.poly(skirt, { w: 1.6 });
  s.hatch(skirt, 70, 4.2, { o: 0.55, w: 1.1, c: ORANGE });
  s.hatch(torso, 70, 5, { o: 0.22, w: 1 });
  // arm raised to the board, chalk in hand
  s.stroke([[tx - 30, 232], [tx - 62, 205], [tx - 96, 172]], { w: 1.7 });
  s.stroke([[tx - 30, 244], [tx - 66, 218], [tx - 100, 186]], { w: 1.7 });
  s.stroke([[tx - 96, 172], [tx - 104, 180], [tx - 100, 186]], { w: 1.4, passes: 1 });
  s.line(tx - 104, 176, tx - 118, 166, { w: 2, o: 0.95, passes: 1, jitter: 0.3 }); // chalk
  // other arm down, holding a book at the hip
  s.stroke([[tx + 26, 232], [tx + 40, 300]], { w: 1.6 });
  s.stroke([[tx + 14, 236], [tx + 30, 298]], { w: 1.4, passes: 1 });
  s.poly([[tx + 22, 292], [tx + 60, 288], [tx + 62, 318], [tx + 24, 322]], { w: 1.3, o: 0.8, passes: 1 });
  // legs and shoes
  s.line(tx - 14, 402, tx - 12, 440, { w: 1.6 });
  s.line(tx + 10, 402, tx + 12, 440, { w: 1.6 });
  s.stroke([[tx - 22, 442], [tx - 2, 442]], { w: 1.8, passes: 1 });
  s.stroke([[tx + 2, 442], [tx + 24, 442]], { w: 1.8, passes: 1 });
  // shadow at the teacher's feet
  s.hatch([[tx - 60, 444], [tx + 60, 444], [tx + 80, 458], [tx - 80, 458]], 5, 3.4, { o: 0.16 });
  // the class, seen from behind, three rows
  const rows = [
    { y: 330, sc: 0.62, xs: [270, 430, 590, 1000] },
    { y: 392, sc: 0.8, xs: [190, 380, 570, 950, 1140] },
    { y: 470, sc: 1.0, xs: [90, 320, 550, 900, 1130] },
  ];
  for (const r of rows) {
    for (const x of r.xs) {
      const sc = r.sc, y = r.y;
      // learner: head and shoulders
      s.ellipse(x, y - 78 * sc, 16 * sc, 18 * sc, { turns: 1.05, w: 1.5, jitter: 0.8 });
      s.stroke(
        [[x - 40 * sc, y - 20 * sc], [x - 36 * sc, y - 48 * sc], [x - 14 * sc, y - 58 * sc], [x + 14 * sc, y - 58 * sc], [x + 36 * sc, y - 48 * sc], [x + 40 * sc, y - 20 * sc]],
        { w: 1.5, jitter: 1 }
      );
      s.hatch([[x - 36 * sc, y - 48 * sc], [x + 36 * sc, y - 48 * sc], [x + 40 * sc, y - 20 * sc], [x - 40 * sc, y - 20 * sc]], 60, 5 * sc + 2, { o: 0.16 });
      // desk top, slightly wider than the learner, with legs
      const dw = 62 * sc, dh = 9 * sc;
      s.poly([[x - dw, y - 20 * sc], [x + dw, y - 20 * sc], [x + dw + 6 * sc, y - 20 * sc + dh], [x - dw - 6 * sc, y - 20 * sc + dh]], { w: 1.5 });
      s.line(x - dw - 2 * sc, y - 20 * sc + dh, x - dw - 4 * sc, y + 30 * sc, { w: 1.2, o: 0.7, passes: 1 });
      s.line(x + dw + 2 * sc, y - 20 * sc + dh, x + dw + 4 * sc, y + 30 * sc, { w: 1.2, o: 0.7, passes: 1 });
      // an exercise book on the desk
      s.poly([[x - 22 * sc, y - 19 * sc], [x + 4 * sc, y - 19 * sc], [x + 6 * sc, y - 14 * sc], [x - 20 * sc, y - 14 * sc]], { w: 1, o: 0.6, passes: 1, jitter: 0.5 });
    }
  }
  return s.svg(4);
}


// ---------- 5. Hero: the mark, in chalk ----------
function balloon() {
  const s = new Sketch(71, 120, 124);
  const O = { c: ORANGE };
  // envelope, then the face ring drawn twice as a thick chalk line
  s.ellipse(58, 56, 38, 38, { turns: 1.06, w: 1.8, o: 0.9, jitter: 0.9, ...O });
  s.ellipse(54, 58, 31, 31, { turns: 1.05, w: 2.2, o: 0.95, jitter: 0.7, start: 1.2 });
  s.ellipse(54, 58, 26, 26, { turns: 1.04, w: 1.6, o: 0.7, jitter: 0.7, start: 4.1, passes: 1 });
  // smile
  s.stroke([[45, 60], [49, 65], [54, 67], [59, 65], [63, 60]], { w: 2, o: 0.95, jitter: 0.4, passes: 1 });
  // mortarboard: the board, the cap beneath, the tassel
  s.poly([[54, 8], [84, 20], [54, 32], [24, 20]], { w: 1.8, o: 0.95, jitter: 0.6 });
  s.stroke([[44, 30], [44, 34], [64, 34], [64, 30]], { w: 1.6, o: 0.8, jitter: 0.4, passes: 1 });
  s.hatch([[54, 8], [84, 20], [54, 32], [24, 20]], 20, 3.2, { o: 0.35, w: 1 });
  s.line(84, 20, 86, 34, { w: 1.6, o: 0.9, passes: 1 });
  s.ellipse(86, 36, 2.5, 2.5, { turns: 1.2, w: 1.4, o: 0.9, passes: 1, jitter: 0.3 });
  // neck and basket
  s.line(44, 88, 50, 100, { w: 1.8, o: 0.9, passes: 1 });
  s.line(64, 88, 58, 100, { w: 1.8, o: 0.9, passes: 1 });
  s.poly([[45, 100], [63, 100], [63, 112], [45, 112]], { w: 1.7, o: 0.95, jitter: 0.5 });
  s.hatch([[45, 100], [63, 100], [63, 112], [45, 112]], 0, 3, { o: 0.4, w: 1 });
  // the motion arc, last, in orange
  const arc = [];
  for (let i = 0; i <= 24; i++) {
    const t = -Math.PI / 2.6 + (i / 24) * (Math.PI / 1.3);
    arc.push([58 + Math.cos(t) * 46, 56 + Math.sin(t) * 46]);
  }
  s.stroke(arc, { w: 2.4, o: 0.75, jitter: 0.8, overshoot: 0, ...O });
  return s.svg(5);
}


// ---------- 6. Ontology: one child's record, the lines only ----------
// Node positions are shared with record-map.tsx; keep them in step.
export const RECORD_NODES = [
  { key: "class", a: -57.3 }, { key: "teacher", a: -24.5 }, { key: "maths", a: 8.2 },
  { key: "report", a: 40.9 }, { key: "library", a: 73.6 }, { key: "attendance", a: 106.4 },
  { key: "clinic", a: 139.1 }, { key: "bus", a: 171.8 }, { key: "payment", a: 204.5 },
  { key: "invoice", a: 237.3 }, { key: "guardian", a: 270 },
];
export function recordPos(a) {
  const r = (a * Math.PI) / 180;
  return [600 + Math.cos(r) * 470, 320 + Math.sin(r) * 236];
}
function recordLines() {
  const s = new Sketch(89, 1200, 640);
  // the child: a chalk ring, drawn first
  s.ellipse(600, 320, 104, 46, { turns: 1.06, w: 2, o: 0.9, jitter: 1, c: ORANGE });
  for (const n of RECORD_NODES) {
    const [x, y] = recordPos(n.a);
    const dx = x - 600, dy = y - 320, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    // from just outside the ring to just short of the node
    const x0 = 600 + ux * 112, y0 = 320 + uy * 54;
    const x1 = x - ux * 78, y1 = y - uy * 26;
    s.stroke([[x0, y0], [x1, y1]], { w: 1.5, o: 0.8, jitter: 1.3, overshoot: 3 });
  }
  return s.svg(6);
}


// ---------- 7. The ontology on the board, six layers ----------
// Node positions are shared across layers so lines meet their boxes.
const N = {
  learner:  [600, 300],
  guardian: [330, 110],
  klass:    [870, 110],
  invoice:  [1000, 300],
  payment:  [870, 490],
  report:   [600, 520],
  route:    [200, 300],
  academic: [1110, 110],
  books:    [1110, 490],
  admissions: [95, 110],
  care:     [95, 490],
};
function box(s, key, w, h, title, sub, { c } = {}) {
  const [x, y] = N[key];
  s.poly([[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]], { w: 1.6, o: 0.9, jitter: 1, c });
  s.text(x, y + (sub ? -2 : 8), title, { size: 24, c: c || "#f2f2f0" });
  if (sub) s.text(x, y + 22, sub, { size: 17, o: 0.6 });
}
function link(s, a, b, label, { pad = 0.16, c } = {}) {
  const [x0, y0] = N[a], [x1, y1] = N[b];
  const dx = x1 - x0, dy = y1 - y0;
  const p0 = [x0 + dx * pad, y0 + dy * pad], p1 = [x1 - dx * pad, y1 - dy * pad];
  s.stroke([p0, p1], { w: 1.5, o: 0.8, jitter: 1.3, overshoot: 3, c });
  if (label) {
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    const nx = -dy / Math.hypot(dx, dy), ny = dx / Math.hypot(dx, dy);
    s.text(mx + nx * 21, my + ny * 21 + 6, label, { size: 16, o: 0.62 });
  }
}
function ontoLayer(n) {
  const s = new Sketch(101 + n, 1200, 600);
  const O = "#f4a21d";
  switch (n) {
    case 1: // the learner, her guardian, her class and teacher
      s.ellipse(600, 300, 118, 50, { turns: 1.06, w: 2.2, o: 0.95, jitter: 1, c: O });
      s.text(600, 296, "The learner", { size: 28, c: O });
      s.text(600, 320, "one file, from enquiry to alumnus", { size: 15, o: 0.6 });
      link(s, "learner", "guardian", "guardian");
      box(s, "guardian", 200, 70, "Guardian", "on WhatsApp");
      link(s, "learner", "klass", "enrolled in");
      box(s, "klass", 220, 70, "Class", "and its teacher");
      break;
    case 2: // the money she generates
      link(s, "learner", "invoice", "billed");
      box(s, "invoice", 200, 70, "Invoice", "per term, per fee item");
      link(s, "invoice", "payment", "settled by");
      box(s, "payment", 220, 70, "Payment", "M-Pesa, matched");
      break;
    case 3: // what she learns, and how she gets to school
      link(s, "learner", "report", "results");
      box(s, "report", 230, 70, "Report card", "marks, attendance, remarks");
      link(s, "learner", "route", "rides");
      box(s, "route", 200, 70, "Bus route", "stop, fare, matron");
      break;
    case 4: // the academic spine
      link(s, "klass", "academic", "");
      box(s, "academic", 176, 80, "Timetable", "subjects · schemes · exams");
      break;
    case 5: // the books
      link(s, "payment", "books", "");
      box(s, "books", 176, 80, "The books", "ledger · budget · bank");
      break;
    case 6: // operations
      link(s, "admissions", "guardian", "");
      box(s, "admissions", 160, 70, "Enquiry", "becomes a learner");
      link(s, "care", "route", "");
      box(s, "care", 170, 80, "Care", "clinic · library · discipline");
      break;
  }
  return s.svg(10 + n);
}

// ---------- 8. Ask the school: the record answers a director's question ----------
// The whole school stands on the board as a faint map. A question lights only
// the records it needs, in the order the answer walks them: a link in orange,
// then the record it reaches, in chalk.
const A = {
  learner:    [500, 272],
  guardian:   [180, 92],
  klass:      [500, 78],
  teacher:    [820, 92],
  route:      [140, 272],
  invoice:    [860, 272],
  attendance: [180, 458],
  report:     [500, 470],
  payment:    [690, 458],
  books:      [915, 458],
};
const AW = {
  learner: [0, 0], guardian: [190, 58], klass: [170, 58], teacher: [180, 58], route: [170, 58],
  invoice: [170, 58], attendance: [190, 58], report: [190, 58], payment: [170, 58], books: [150, 58],
};
const AT = {
  guardian: "Guardian", klass: "Class", teacher: "Teacher", route: "Bus route", invoice: "Invoice",
  attendance: "Attendance", report: "Report card", payment: "Payment", books: "The books",
};
function aNode(s, key, { o = 0.9, c, tag = true } = {}) {
  const [x, y] = A[key];
  const g = tag ? `data-n="${key}"` : "";
  s.group(g, () => {
    if (key === "learner") {
      s.ellipse(x, y, 108, 44, { turns: 1.06, w: 2.2, o, jitter: 1, c: c || ORANGE });
      s.text(x, y + 8, "The learner", { size: 27, c: c || ORANGE, o });
      return;
    }
    const [w, h] = AW[key];
    s.poly([[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]], { w: 1.6, o, jitter: 1, c });
    s.text(x, y + 8, AT[key], { size: 24, c: c || "#f2f2f0", o });
  });
}
// From the edge of one record to the edge of the next.
function aEdge(key, towards) {
  const [x, y] = A[key], [tx, ty] = A[towards];
  const dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  if (key === "learner") {
    // point on the ellipse in that direction
    const t = Math.atan2(uy * 108, ux * 44);
    return [x + Math.cos(t) * 118, y + Math.sin(t) * 52];
  }
  const [w, h] = AW[key];
  const k = Math.min((w / 2 + 12) / Math.abs(ux || 1e-6), (h / 2 + 12) / Math.abs(uy || 1e-6));
  return [x + ux * k, y + uy * k];
}
function aLink(s, a, b, label, { o = 0.85, c, tag = true, w = 1.6 } = {}) {
  const p0 = aEdge(a, b), p1 = aEdge(b, a);
  const g = tag ? `data-l="${a}-${b}"` : "";
  s.group(g, () => {
    s.stroke([p0, p1], { w, o, jitter: 1.3, overshoot: 3, c });
    if (label) {
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy);
      const nx = -dy / len, ny = dx / len;
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      // label sits on the upper side of the line, whichever way it runs
      const side = ny < 0 ? 1 : -1;
      // clear of the line by more when the line is steep, since the label is wide
      const off = 14 + Math.abs(nx) * label.length * 4.4;
      s.text(mx + nx * off * side, my + ny * off * side + 6, label, { size: 18, o: 0.7, c: c || "#f2f2f0" });
    }
  });
}
const ASK_LINKS = [
  ["learner", "guardian"], ["learner", "klass"], ["klass", "teacher"], ["learner", "route"], ["learner", "invoice"],
  ["invoice", "payment"], ["payment", "books"], ["learner", "report"], ["learner", "attendance"], ["teacher", "report"],
];
function askGhost() {
  const s = new Sketch(211, 1000, 540);
  for (const [a, b] of ASK_LINKS) aLink(s, a, b, "", { o: 0.22, tag: false, w: 1.2 });
  for (const k of Object.keys(A)) aNode(s, k, { o: k === "learner" ? 0.32 : 0.26, c: "#e6e6e2", tag: false });
  return s.svg(21);
}
// Each question: the words, the walk (a record, or a record reached from
// another over a labelled link), and the answer written under the drawing.
const ASK = [
  {
    q: "Which families owe fees and have a child on the bus?",
    walk: [["learner"], ["invoice", "learner", "billed"], ["route", "learner", "rides"], ["guardian", "learner", "on WhatsApp"]],
    a: "Nine families, on routes 2 and 4. Each gets its own reminder at 08:14, with a Pay button.",
  },
  {
    q: "Does Grade 7 pay for itself?",
    walk: [["klass"], ["learner", "klass", "22 enrolled"], ["invoice", "learner", "billed"], ["payment", "invoice", "settled"], ["books", "payment", "posted"], ["teacher", "klass", "3 teachers"]],
    a: "Not this term. Twenty-two learners, three teachers. Below cost for the second term running.",
  },
  {
    q: "Who is carrying the most lessons?",
    walk: [["teacher"], ["klass", "teacher", "28 lessons, 4 covers"], ["learner", "klass", "Grade 6 East"]],
    a: "Mrs Achieng, Languages. Twenty-eight lessons and four covers this week, two above the load you set.",
  },
  {
    q: "What happened to the 07:42 payment?",
    walk: [["payment"], ["invoice", "payment", "matched 07:43"], ["learner", "invoice", "Amani W."], ["guardian", "learner", "receipt"], ["books", "payment", "posted"]],
    a: "Matched to Amani W., Term 3, at 07:43. Posted to the books. Her mother has the receipt on WhatsApp.",
  },
  {
    q: "Who was absent on Tuesday with no note?",
    walk: [["attendance"], ["learner", "attendance", "Tuesday"], ["klass", "learner", "Grade 4 East"], ["guardian", "learner", "asked 08:10"]],
    a: "Four learners in Grade 4 East. Three homes have replied on WhatsApp since. One has not been reached, and the head knows.",
  },
];
function askLayer(i) {
  const s = new Sketch(231 + i, 1000, 540);
  for (const step of ASK[i].walk) {
    const [key, from, label] = step;
    if (from) aLink(s, from, key, label, { c: ORANGE, o: 0.9, w: 2.2 });
    aNode(s, key, { o: 0.95 });
  }
  return s.svg(31 + i);
}

const sv = { smis: register(), hr: duster(), learning: pencil(), classroom: classroom(), balloon: balloon(), record: recordLines(), onto1: ontoLayer(1), onto2: ontoLayer(2), onto3: ontoLayer(3), onto4: ontoLayer(4), onto5: ontoLayer(5), onto6: ontoLayer(6), askGhost: askGhost() };
ASK.forEach((_, i) => (sv["ask" + i] = askLayer(i)));
const tsx = `"use client"

// Generated pencil drawings. Do not edit the SVG strings by hand: regenerate
// with the sketch script. Each drawing draws itself the first time it scrolls
// into view, stroke by stroke in the order it was made, then stays still.

import { useEffect, useMemo, useRef } from "react"

const SMIS = ${JSON.stringify(sv.smis)}
const HR = ${JSON.stringify(sv.hr)}
const LEARNING = ${JSON.stringify(sv.learning)}
const CLASSROOM = ${JSON.stringify(sv.classroom)}
const BALLOON = ${JSON.stringify(sv.balloon)}
const RECORD = ${JSON.stringify(sv.record)}
const ONTO = [${[1,2,3,4,5,6].map(i=>JSON.stringify(sv["onto"+i])).join(",\n")}]

// Ask the school: the faint map of every record, and one drawing per question.
export const ASK_GHOST = ${JSON.stringify(sv.askGhost)}
export const ASK: { q: string; a: string; svg: string }[] = [
${ASK.map((x, i) => `  { q: ${JSON.stringify(x.q)}, a: ${JSON.stringify(x.a)}, svg: ${JSON.stringify(sv["ask" + i])} },`).join("\n")}
]

function draw(root: HTMLElement, seconds: number) {
  const paths = Array.from(root.querySelectorAll<SVGPathElement>("path"))
  const strokes: { el: SVGPathElement; len: number }[] = []
  const washes: { el: SVGPathElement; o: number }[] = []
  for (const el of paths) {
    if (el.getAttribute("fill") && el.getAttribute("fill") !== "none") {
      washes.push({ el, o: Number(el.getAttribute("opacity") || 1) })
    } else {
      strokes.push({ el, len: el.getTotalLength() })
    }
  }
  for (const el of Array.from(root.querySelectorAll<SVGTextElement>("text"))) {
    washes.push({ el: el as unknown as SVGPathElement, o: Number(el.getAttribute("opacity") || 1) })
  }
  // Constant hand speed, with a floor so a dot still reads as a mark, then
  // the whole schedule is scaled so the drawing finishes on budget.
  const total = strokes.reduce((a, s) => a + s.len, 0)
  const speed = total / (seconds * 1000)
  const plan = strokes.map((s) => ({ ...s, dur: Math.max(12, s.len / speed) }))
  const raw = plan.reduce((a, s) => a + s.dur * 0.92, 0)
  const k = (seconds * 1000) / raw
  let t = 0
  for (const s of plan) {
    const dur = s.dur * k
    s.el.style.strokeDasharray = String(s.len)
    s.el.style.strokeDashoffset = String(s.len)
    s.el.animate([{ strokeDashoffset: s.len }, { strokeDashoffset: 0 }], {
      duration: dur,
      delay: t,
      fill: "forwards",
      easing: "linear",
    })
    t += dur * 0.92 // the next stroke begins as the last one finishes
  }
  for (const w of washes) {
    w.el.style.opacity = "0"
    w.el.animate([{ opacity: 0 }, { opacity: w.o }], {
      duration: 900,
      delay: t + 100,
      fill: "forwards",
      easing: "ease-out",
    })
  }
}

function hide(root: HTMLElement) {
  root.querySelectorAll<SVGTextElement>("text").forEach((el) => (el.style.opacity = "0"))
  root.querySelectorAll<SVGPathElement>("path").forEach((el) => {
    if (el.getAttribute("fill") && el.getAttribute("fill") !== "none") el.style.opacity = "0"
    else {
      const len = el.getTotalLength()
      el.style.strokeDasharray = String(len)
      el.style.strokeDashoffset = String(len)
    }
  })
}

function Sketch({
  svg,
  title,
  seconds,
  delay = 0,
  onDraw,
  play,
  instant = false,
}: {
  svg: string
  title: string
  seconds: number
  delay?: number
  onDraw?: () => void
  // When given, the drawing waits for play to become true instead of
  // watching the viewport. Used for the layered board drawings.
  play?: boolean
  // With play: if the drawing is already due when it mounts, show it at
  // once instead of drawing it again (a layer the reader has seen).
  instant?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const played = useRef(false)
  // The same object every render: React resets innerHTML (and with it the
  // inline stroke styles) whenever it is handed a new one.
  const html = useMemo(() => ({ __html: svg }), [svg])
  useEffect(() => {
    const root = ref.current
    if (!root || play === undefined) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (still || !("animate" in Element.prototype)) return
    if (!played.current && !play) hide(root)
    if (play && !played.current) {
      played.current = true
      if (instant) return
      const t = window.setTimeout(() => {
        draw(root, seconds)
        onDraw?.()
      }, delay)
      return () => window.clearTimeout(t)
    }
  }, [play, seconds, delay, onDraw, instant])
  useEffect(() => {
    const root = ref.current
    if (!root || play !== undefined) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (still || !("IntersectionObserver" in window) || !("animate" in Element.prototype)) return
    hide(root)
    let done = false
    const io = new IntersectionObserver(
      (entries) => {
        if (done || !entries.some((e) => e.isIntersecting)) return
        done = true
        io.disconnect()
        window.setTimeout(() => {
          draw(root, seconds)
          onDraw?.()
        }, delay)
      },
      { threshold: 0.35 }
    )
    io.observe(root)
    return () => io.disconnect()
  }, [seconds, delay, onDraw, play])
  return <div ref={ref} className="sketch" role="img" aria-label={title} data-seconds={seconds} data-delay={delay} dangerouslySetInnerHTML={html} />
}

export const SketchSmis = () => <Sketch svg={SMIS} seconds={3.2} title="Pencil drawing of an open class register" />
export const SketchHr = () => <Sketch svg={HR} seconds={3.2} title="Pencil drawing of a chalkboard duster and two sticks of chalk" />
export const SketchLearning = () => <Sketch svg={LEARNING} seconds={3.2} title="Pencil drawing of a pencil lying on a marked exam paper" />
export const SketchBalloon = () => (
  <Sketch svg={BALLOON} seconds={2.6} delay={1100} title="The Tutagora balloon, drawn in chalk" />
)
export const SketchRecord = ({ onDraw }: { onDraw?: () => void }) => (
  <Sketch svg={RECORD} seconds={4.2} title="Chalk lines from one learner to the records that know her" onDraw={onDraw} />
)
export const SketchOnto = ({ layer, play, instant, delay }: { layer: number; play?: boolean; instant?: boolean; delay?: number }) => (
  <Sketch svg={ONTO[layer - 1]} seconds={1.6} title="" play={play} instant={instant} delay={delay} />
)
export const SketchClassroom = () => (
  <Sketch svg={CLASSROOM} seconds={7} title="Pencil drawing of a teacher at a chalkboard, instructing a class seated at desks, with light from a window" />
)
`;
fs.writeFileSync(new URL("../app/(marketing)/sketches.tsx", import.meta.url), tsx);
console.log(Object.fromEntries(Object.entries(sv).map(([k, v]) => [k, v.length])));
