// Vice Coast Cover Studio — canvas cover engine, cartoon edition.
// Every photo becomes comic art through the Toon filter (posterised colour,
// inked edges, cel shading), and every procedural scene is drawn in the
// same comic style: bold outlines, flat cel colour, sunset/neon palette.
// Everything here is original art: no Rockstar logo, artwork or font.

export const GRADES = ['sunset', 'neon', 'golden', 'teal', 'noir'];
export const LAYOUTS = ['nine', 'hero3', 'tilted', 'full'];

const INK = '#160826'; // comic outline colour, used everywhere

/** Fresh default state for a new cover. Panel overrides live under state.panels[id]. */
export function defaultCoverState() {
  return {
    layout: 'tilted',
    grade: 'sunset',
    title: 'VICE COAST',
    subtitle: 'chase the sunset',
    grain: true,
    vignette: true,
    badge: true,
    toon: true,
    panels: {},
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Panel geometry for a layout at W x H. Each panel: {id, x, y, w, h, rot, kind}.
 * The 'title' kind is the title block, not a photo panel.
 *
 * Tilted, never overlapping: panels sit angled like photos laid out on a
 * table (±2–5°, a different angle per panel), but each panel is shrunk
 * just enough that its rotated corners stay inside its own grid cell,
 * with a clear dark gap around it — so no panel ever covers another and
 * no face is ever hidden. The title block is its own tilted panel in the
 * middle, slightly larger than the photo panels around it, so the title
 * stands out without crowding anyone. The layouts stay dynamic (never a
 * uniform grid) through varied cell sizes: one tall photo panel, one
 * wide panel, and the title in the centre.
 */
function tileEdges(start, total, fractions) {
  const edges = [start];
  let acc = 0;
  for (let i = 0; i < fractions.length - 1; i++) {
    acc += fractions[i];
    edges.push(Math.round(start + total * acc));
  }
  edges.push(start + total);
  return edges;
}

function tileGrid(W, H, cols, rows, cells) {
  const m = Math.round(W * 0.018);
  const g = Math.round(W * 0.01);
  const iw = W - 2 * m - 2 * g;
  const ih = H - 2 * m - 2 * g;
  const colE = tileEdges(m, iw + 2 * g, cols);
  const rowE = tileEdges(m, ih + 2 * g, rows);
  // Panels tile the inner area exactly: neighbours share an edge
  // coordinate, so they meet edge-to-edge. Each panel's white frame is
  // stroked centred on its own edge, so two neighbours' frames coincide
  // at the seam and read as one thin white gutter line.
  return cells.map(([id, kind, c0, c1, r0, r1]) => ({
    id,
    kind,
    rot: 0,
    x: colE[c0],
    y: rowE[r0],
    w: colE[c1] - colE[c0],
    h: rowE[r1] - rowE[r0],
  }));
}

/** Deterministic tilt angle for a panel id: ±2–5°, a different angle each. The title panel stays straight (0°) so its lettering reads upright — the owner asked for it — while every other panel keeps its tilt. */
function tiltAngleFor(id) {
  if (id === 'title' || id === 'c4') return 0;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const mag = 2 + (h % 31) / 10; // 2.0–5.0 degrees
  return (h % 2 === 0 ? 1 : -1) * mag * Math.PI / 180;
}

/**
 * Angles a tiled layout like photos on a table, without any overlap.
 * Each cell keeps its panel: the panel is inset by a small gap, then
 * shrunk just enough that its rotated bounding box still fits inside
 * its own cell with a hair of clearance on every side. Since the cells
 * are disjoint and every rotated panel stays inside its cell, no two
 * panels can cover each other — the panels sit right against each
 * other, practically touching, their white frames meeting at the seam
 * so the cover reads as one poster, not loose photos.
 * (Owner corrected the earlier "5 px more" reading: "tambah" meant MORE
 * tight, not more room. So the gap is now 5 px tighter than the tight
 * ~3 px version: gap 0, and clearance just 1 px — the 1 px is only
 * there to absorb Math.round (measured worst rounding overshoot
 * 0.72 px at gap 0 / clearance 0); the white frames, stroked centred
 * on each panel's edge, bridge that hairline, so neighbours read as
 * meeting at the shared cell edge and can touch, but never cross
 * into each other.)
 */
function tiltPanels(panels, W) {
  const gap = 0;
  const clear = 1;
  return panels.map((p) => {
    const rot = tiltAngleFor(p.id);
    const cos = Math.cos(rot);
    const sin = Math.abs(Math.sin(rot));
    const w0 = p.w - 2 * gap;
    const h0 = p.h - 2 * gap;
    const bboxW = w0 * cos + h0 * sin;
    const bboxH = w0 * sin + h0 * cos;
    const scale = Math.min((p.w - 2 * clear) / bboxW, (p.h - 2 * clear) / bboxH, 1);
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    return {
      ...p,
      rot,
      x: Math.round(p.x + (p.w - w) / 2),
      y: Math.round(p.y + (p.h - h) / 2),
      w,
      h,
    };
  });
}

/** Axis-aligned bounding box of a rotated panel, for gap math. */
function rotatedBBox(p) {
  const rot = p.rot || 0;
  const bw = p.w * Math.abs(Math.cos(rot)) + p.h * Math.abs(Math.sin(rot));
  const cx = p.x + p.w / 2;
  return { l: cx - bw / 2, r: cx + bw / 2 };
}

/**
 * Sets two side-by-side panels so their rotated bounding boxes sit
 * `targetGap` apart — pulling them together when the gap is wider,
 * pushing them apart when it is tighter. Moving by bounding boxes
 * (never by the raw panel edges) keeps the guarantee: boxes that
 * stay disjoint mean panels that cannot overlap, and the y-coordinates
 * never move, so nothing above or below is touched. Used for one pair
 * only (see the tilted layout below).
 */
function closeHorizontalGap(left, right, targetGap) {
  if (!left || !right) return;
  const gap = rotatedBBox(right).l - rotatedBBox(left).r;
  const shift = Math.round((gap - targetGap) / 2);
  left.x += shift;
  right.x -= shift;
}

export function layoutPanels(layout, W, H) {
  let panels;
  if (layout === 'hero3') {
    // Hero photo across the top, title as its own cell in the bottom row
    // between two small panels — it never sits on top of the hero. The
    // centre column is widened a touch so the title reads bigger.
    panels = tileGrid(W, H, [0.32, 0.36, 0.32], [0.60, 0.40], [
      ['hero', 'hero', 0, 3, 0, 1],
      ['p1', 'neon', 0, 1, 1, 2],
      ['title', 'title', 1, 2, 1, 2],
      ['p3', 'pier', 2, 3, 1, 2],
    ]);
  } else if (layout === 'tilted') {
    // Dynamic collage: tall hero photo on the left, wide neon panel
    // across the top right, title as the centre cell, pier photo at
    // middle right, wide car panel across the bottom left, palm sunset
    // at bottom right. Same map at any aspect ratio — the fractions do
    // the work. The title cell is a little larger than before (wider
    // middle column, taller middle row) so the title stands out, and
    // the panels around it give up a little room to make it fit.
    panels = tileGrid(W, H, [0.34, 0.30, 0.36], [0.30, 0.38, 0.32], [
      ['s1', 'hero', 0, 1, 0, 2],
      ['s2', 'neon', 1, 3, 0, 1],
      ['title', 'title', 1, 2, 1, 2],
      ['s4', 'pier', 2, 3, 1, 2],
      ['s5', 'car', 0, 2, 2, 3],
      ['s6', 'palm', 2, 3, 2, 3],
    ]);
    panels = tiltPanels(panels, W);
    // The bottom pair (wide car s5, palm sunset s6) shrinks hardest in
    // tiltPanels — both are wide panels in a short row, so their rotated
    // boxes lose ~15% of their width and the facing edges end up ~100 px
    // apart at 1280 wide, while every other neighbouring pair meets at
    // ~2 px. Set just this pair's boxes to ~5 px apart (owner: the
    // bottom pair was too tight at ~2 px, add 3 px of breathing room):
    // the outer edges give a little room, the middle seam opens a
    // touch, and the boxes stay disjoint so nothing can overlap.
    // (Owner circled exactly this gap in red.)
    closeHorizontalGap(panels.find((p) => p.id === 's5'), panels.find((p) => p.id === 's6'), 5);
    return panels;
  } else if (layout === 'full') {
    // Full-bleed photo above, title as its own full-width panel below —
    // a joined band, not an overlay. The title band is a touch taller
    // than before so the title sits bigger.
    panels = tileGrid(W, H, [1], [0.74, 0.26], [
      ['hero', 'hero', 0, 1, 0, 1],
      ['title', 'title', 0, 1, 1, 2],
    ]);
  } else {
    // 'nine': varied mosaic — uneven columns and rows, centre cell is
    // the title, every panel a different size. The centre cell is
    // widened and deepened a touch so the title reads bigger.
    panels = tileGrid(W, H, [0.34, 0.32, 0.34], [0.30, 0.38, 0.32], [
      ['c0', 'hero', 0, 1, 0, 1],
      ['c1', 'skyline', 1, 2, 0, 1],
      ['c2', 'neon', 2, 3, 0, 1],
      ['c3', 'palm', 0, 1, 1, 2],
      ['c4', 'title', 1, 2, 1, 2],
      ['c5', 'pier', 2, 3, 1, 2],
      ['c6', 'street', 0, 1, 2, 3],
      ['c7', 'sunset', 1, 2, 2, 3],
      ['c8', 'car', 2, 3, 2, 3],
    ]);
  }
  return tiltPanels(panels, W);
}

/**
 * A real palm: a curved, ringed trunk and seven drooping fronds, each a
 * spine with leaflets fanning off it — never a five-line fan.
 */
export function drawPalm(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineCap = 'round';
  // Trunk: a gentle S-curve, drawn in segments so it can taper.
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([x + s * 0.10 * Math.sin(t * 1.6), y - s * t]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.lineWidth = Math.max(2, s * 0.075 * (1 - (i / pts.length) * 0.45));
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
  }
  // Ring texture across the trunk.
  ctx.lineWidth = Math.max(1, s * 0.014);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let i = 1; i < pts.length - 1; i += 2) {
    ctx.beginPath(); ctx.moveTo(pts[i][0] - s * 0.035, pts[i][1]); ctx.lineTo(pts[i][0] + s * 0.035, pts[i][1]); ctx.stroke();
  }
  const crownX = pts[pts.length - 1][0];
  const crownY = pts[pts.length - 1][1];
  // Coconuts tucked under the crown.
  ctx.fillStyle = color;
  for (const [dx, dy, r] of [[-0.05, 0.03, 0.045], [0.05, 0.04, 0.04], [0.0, 0.07, 0.038]]) {
    ctx.beginPath(); ctx.arc(crownX + dx * s, crownY + dy * s, r * s, 0, Math.PI * 2); ctx.fill();
  }
  // Six fronds, each a drooping spine with short, thick leaflets angled
  // back toward the trunk — feathery, never a bare starburst.
  ctx.strokeStyle = color;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * (0.08 + i * 0.16); // spread across the top
    const len = s * (0.60 + ((i * 37) % 10) / 10 * 0.28);
    const tipX = crownX + Math.cos(a) * len;
    const tipY = crownY + Math.sin(a) * len * 0.40 + s * 0.38;
    const ctrlX = crownX + Math.cos(a) * len * 0.55;
    const ctrlY = crownY + Math.sin(a) * len * 0.28 - s * 0.04;
    ctx.lineWidth = Math.max(2, s * 0.035);
    ctx.beginPath(); ctx.moveTo(crownX, crownY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY); ctx.stroke();
    // Leaflets along the spine, shorter toward the tip, angled down-back.
    ctx.lineWidth = Math.max(1.5, s * 0.028);
    for (let t = 0.20; t < 0.95; t += 0.16) {
      const px = (1 - t) * (1 - t) * crownX + 2 * (1 - t) * t * ctrlX + t * t * tipX;
      const py = (1 - t) * (1 - t) * crownY + 2 * (1 - t) * t * ctrlY + t * t * tipY;
      const ll = s * 0.11 * (1 - t * 0.5);
      const na = a + Math.PI / 2.4;
      const na2 = a - Math.PI / 2.4;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * ll, py + Math.sin(na) * ll + s * 0.03); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na2) * ll, py + Math.sin(na2) * ll + s * 0.03); ctx.stroke();
    }
  }
  ctx.restore();
}

function sunDisc(ctx, cx, cy, r, stops) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}

/** A glowing sun with GTA-style horizontal slats across its lower half. */
function stripedSun(ctx, cx, cy, r) {
  sunDisc(ctx, cx, cy, r, [[0, '#fff3c4'], [0.7, '#ffb347'], [1, 'rgba(255, 94, 98, 0)']]);
  ctx.save();
  ctx.fillStyle = 'rgba(43, 15, 61, 0.85)';
  for (let i = 0; i < 4; i++) {
    const yy = cy + r * (0.05 + i * 0.22);
    ctx.fillRect(cx - r, yy, r * 2, r * 0.05 + i * r * 0.012);
  }
  ctx.restore();
}

function skyGradient(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}

/** Layered skyline: a hazy back row, then a dark front row with lit windows, antennas and comic outlines. */
function skylineRow(ctx, x, y, w, h, seed, color, lit) {
  const rnd = mulberry32(seed);
  let bx = x;
  while (bx < x + w - 6) {
    const bw = 12 + rnd() * w * 0.13;
    const bh = h * (0.28 + rnd() * 0.62);
    const top = y + h - bh;
    ctx.fillStyle = color;
    ctx.fillRect(bx, top, bw, bh);
    ctx.strokeStyle = 'rgba(22, 8, 38, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, top, bw, bh);
    if (rnd() > 0.6) { // antenna with a warning light
      ctx.beginPath(); ctx.moveTo(bx + bw / 2, top); ctx.lineTo(bx + bw / 2, top - h * 0.12); ctx.stroke();
      ctx.fillStyle = '#ff2e4e';
      ctx.beginPath(); ctx.arc(bx + bw / 2, top - h * 0.12, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    if (lit) {
      const cols = ['#ffd166', '#ffb347', '#ff8a5c', '#7ef0ff'];
      for (let wy = top + 6; wy < y + h - 8; wy += 11) {
        for (let wx = bx + 4; wx < bx + bw - 5; wx += 9) {
          if (rnd() > 0.5) {
            ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
            ctx.globalAlpha = 0.55 + rnd() * 0.45;
            ctx.fillRect(wx, wy, 4, 6);
          }
        }
      }
      ctx.globalAlpha = 1;
    }
    bx += bw + 3;
  }
}

function softCloud(ctx, x, y, w, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w * 0.55, y + w * 0.08, w * 0.7, w * 0.22, 0, 0, Math.PI * 2); ctx.fill();
}

/** A detailed comic sports car in side profile: gradient body, glass with sky reflection, spokes, lights, shadow. Keeps its own ~2.8:1 proportions inside any panel, so a wide panel never stretches it into a limo. */
export function drawCar(ctx, x, y, w, h) {
  ctx.save();
  const cw = Math.min(w, h * 2.8);
  const ch = cw / 2.8;
  x = x + (w - cw) / 2;
  y = y + (h - ch) / 2;
  w = cw; h = ch;
  // Ground shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 0.86, w * 0.42, h * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  const groundY = y + h * 0.82;
  // Body: low nose, long hood, raked windshield, roof, fastback tail.
  const body = new Path2D();
  body.moveTo(x + w * 0.08, groundY);
  body.quadraticCurveTo(x + w * 0.07, y + h * 0.68, x + w * 0.16, y + h * 0.66);
  body.quadraticCurveTo(x + w * 0.30, y + h * 0.62, x + w * 0.38, y + h * 0.60);
  body.quadraticCurveTo(x + w * 0.44, y + h * 0.50, x + w * 0.52, y + h * 0.49);
  body.quadraticCurveTo(x + w * 0.62, y + h * 0.49, x + w * 0.68, y + h * 0.56);
  body.quadraticCurveTo(x + w * 0.80, y + h * 0.60, x + w * 0.90, y + h * 0.66);
  body.quadraticCurveTo(x + w * 0.93, y + h * 0.72, x + w * 0.92, groundY);
  body.closePath();
  const bg = ctx.createLinearGradient(x, y + h * 0.45, x, groundY);
  bg.addColorStop(0, '#ff5e7a'); bg.addColorStop(0.45, '#d81e50'); bg.addColorStop(1, '#6e0d2b');
  ctx.fillStyle = bg; ctx.fill(body);
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, w * 0.008); ctx.stroke(body);
  // Glass: windshield + side window with a sky reflection streak.
  const glass = new Path2D();
  glass.moveTo(x + w * 0.40, y + h * 0.585);
  glass.quadraticCurveTo(x + w * 0.45, y + h * 0.52, x + w * 0.52, y + h * 0.515);
  glass.quadraticCurveTo(x + w * 0.60, y + h * 0.515, x + w * 0.65, y + h * 0.575);
  glass.closePath();
  const gg = ctx.createLinearGradient(x + w * 0.4, y + h * 0.5, x + w * 0.65, y + h * 0.6);
  gg.addColorStop(0, '#cfeeff'); gg.addColorStop(0.6, '#5aa9e6'); gg.addColorStop(1, '#1e4d7a');
  ctx.fillStyle = gg; ctx.fill(glass);
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, w * 0.005); ctx.stroke(glass);
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, w * 0.005);
  ctx.beginPath(); ctx.moveTo(x + w * 0.53, y + h * 0.515); ctx.lineTo(x + w * 0.53, y + h * 0.585); ctx.stroke();
  // Body highlight + door cut + handle.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'; ctx.lineWidth = Math.max(1.5, w * 0.006);
  ctx.beginPath(); ctx.moveTo(x + w * 0.18, y + h * 0.665); ctx.quadraticCurveTo(x + w * 0.35, y + h * 0.635, x + w * 0.44, y + h * 0.62); ctx.stroke();
  ctx.strokeStyle = 'rgba(22, 8, 38, 0.7)'; ctx.lineWidth = Math.max(1.5, w * 0.005);
  ctx.beginPath(); ctx.moveTo(x + w * 0.55, y + h * 0.60); ctx.lineTo(x + w * 0.55, y + h * 0.79); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w * 0.60, y + h * 0.635); ctx.lineTo(x + w * 0.66, y + h * 0.635); ctx.stroke();
  // Headlight glow + taillight strip.
  ctx.save();
  ctx.shadowColor = '#fff3c4'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath(); ctx.ellipse(x + w * 0.115, y + h * 0.69, w * 0.028, h * 0.022, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ff2e4e';
  ctx.fillRect(x + w * 0.885, y + h * 0.685, w * 0.028, h * 0.03);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(x + w * 0.885, y + h * 0.685, w * 0.028, h * 0.03);
  // Wheels: tyre, rim, five spokes, hub.
  for (const cx of [x + w * 0.27, x + w * 0.74]) {
    const r = h * 0.085;
    ctx.fillStyle = '#0d0718';
    ctx.beginPath(); ctx.arc(cx, groundY, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, w * 0.006); ctx.stroke();
    ctx.fillStyle = '#e8e8f0';
    ctx.beginPath(); ctx.arc(cx, groundY, r * 0.58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = Math.max(1.5, w * 0.004);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath(); ctx.moveTo(cx, groundY);
      ctx.lineTo(cx + Math.cos(a) * r * 0.55, groundY + Math.sin(a) * r * 0.55); ctx.stroke();
    }
    ctx.fillStyle = '#ff2e88';
    ctx.beginPath(); ctx.arc(cx, groundY, r * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** A glowing neon shop sign with readable text. */
function neonSign(ctx, x, y, w, h, text, color) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 16;
  ctx.fillStyle = color; ctx.globalAlpha = 0.22;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = fitText(ctx, text, 'Anton, sans-serif', h * 0.62, w * 0.9);
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

/**
 * Procedural poster art for a panel with no photo assigned — all in the
 * same comic style: ink outlines, cel colour, sunset/neon palette.
 */
export function drawScene(ctx, kind, x, y, w, h) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (kind === 'neon') {
    skyGradient(ctx, x, y, w, h, [[0, '#0d0718'], [0.55, '#2a0f45'], [1, '#12082b']]);
    const rnd = mulberry32(7);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) { ctx.globalAlpha = 0.3 + rnd() * 0.6; ctx.fillRect(x + rnd() * w, y + rnd() * h * 0.4, 1.6, 1.6); }
    ctx.globalAlpha = 1;
    skylineRow(ctx, x, y + h * 0.28, w, h * 0.34, 55, '#150a24', true);
    // Shop fronts with readable neon signs.
    const signs = [['HOTEL', '#22e6ff'], ['VICE', '#ff2e88'], ['PIZZA', '#ff7a3d'], ['24 HRS', '#ffd166']];
    const sy = y + h * 0.30;
    signs.forEach(([text, color], i) => {
      const sw = w * 0.20;
      const sx = x + w * (0.04 + i * 0.24);
      const sh = Math.max(14, h * 0.11);
      neonSign(ctx, sx, sy + (i % 2) * h * 0.13, sw, sh, text, color);
    });
    // Wet street: dark asphalt, sign reflections stretching down, dashes.
    ctx.fillStyle = '#0a0616'; ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
    signs.forEach(([, color], i) => {
      const sw = w * 0.20;
      const sx = x + w * (0.04 + i * 0.24);
      const rg = ctx.createLinearGradient(0, y + h * 0.62, 0, y + h * 0.98);
      rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = rg;
      ctx.fillRect(sx, y + h * 0.62, sw, h * 0.36);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = 'rgba(255, 209, 102, 0.8)';
    for (let dx = 0; dx < w; dx += w * 0.16) ctx.fillRect(x + dx, y + h * 0.80, w * 0.07, 3);
    ctx.fillStyle = 'rgba(140, 210, 255, 0.14)';
    ctx.beginPath(); ctx.ellipse(x + w * 0.68, y + h * 0.88, w * 0.18, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  if (kind === 'skyline' || kind === 'hero') {
    skyGradient(ctx, x, y, w, h, [[0, '#ffd166'], [0.4, '#ff7a3d'], [0.75, '#ff2e88'], [1, '#3d0f4d']]);
    stripedSun(ctx, x + w * 0.5, y + h * 0.42, Math.min(w, h) * 0.24);
    softCloud(ctx, x + w * 0.18, y + h * 0.16, w * 0.16, 'rgba(255, 214, 166, 0.55)');
    softCloud(ctx, x + w * 0.72, y + h * 0.10, w * 0.13, 'rgba(255, 190, 140, 0.45)');
    skylineRow(ctx, x, y + h * 0.30, w, h * 0.45, 31, '#5b2a6e', false);
    skylineRow(ctx, x, y + h * 0.38, w, h * 0.62, 21, '#241031', true);
    ctx.fillStyle = '#12081f'; ctx.fillRect(x, y + h * 0.94, w, h * 0.06);
    ctx.restore();
    return;
  }
  if (kind === 'palm') {
    skyGradient(ctx, x, y, w, h, [[0, '#ffd166'], [0.45, '#ff7a3d'], [0.8, '#ff2e88'], [1, '#3d0f4d']]);
    stripedSun(ctx, x + w * 0.50, y + h * 0.44, Math.min(w, h) * 0.24);
    ctx.fillStyle = '#2b0f3d'; ctx.fillRect(x, y + h * 0.64, w, h * 0.36);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.55)';
    for (let i = 0; i < 5; i++) ctx.fillRect(x + w * (0.42 + i * 0.06), y + h * (0.68 + i * 0.05), w * 0.2, 2);
    drawPalm(ctx, x - w * 0.02, y + h * 0.98, h * 0.58, '#1c0a2e');
    drawPalm(ctx, x + w * 1.02, y + h * 1.0, h * 0.44, '#160826');
    ctx.restore();
    return;
  }
  if (kind === 'pier') {
    skyGradient(ctx, x, y, w, h, [[0, '#ffd166'], [0.45, '#ff7a3d'], [0.8, '#ff2e88'], [1, '#3d0f4d']]);
    stripedSun(ctx, x + w * 0.5, y + h * 0.40, Math.min(w, h) * 0.22);
    ctx.fillStyle = '#274b73'; ctx.fillRect(x, y + h * 0.58, w, h * 0.42);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.5)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + w * (0.44 + i * 0.03), y + h * (0.62 + i * 0.07), w * 0.14, 2);
    // Wooden pier from the bottom corner, planks in perspective.
    ctx.fillStyle = '#4a2c1a';
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.42, y + h * 0.62); ctx.lineTo(x + w * 0.78, y + h * 0.62); ctx.lineTo(x + w, y + h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(22, 8, 38, 0.8)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      ctx.beginPath();
      ctx.moveTo(x + w * (0.42 + t * 0.36), y + h * 0.62);
      ctx.lineTo(x + w * t, y + h);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (kind === 'street') {
    skyGradient(ctx, x, y, w, h, [[0, '#ffd166'], [0.4, '#ff7a3d'], [0.75, '#ff2e88'], [1, '#3d0f4d']]);
    stripedSun(ctx, x + w * 0.72, y + h * 0.34, Math.min(w, h) * 0.18);
    skylineRow(ctx, x, y + h * 0.26, w, h * 0.40, 41, '#3d1445', true);
    ctx.fillStyle = '#12081f';
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.38, y + h * 0.62); ctx.lineTo(x + w * 0.62, y + h * 0.62); ctx.lineTo(x + w, y + h);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + w * (0.47 + i * 0.015), y + h * (0.70 + i * 0.10), w * 0.02, h * 0.05);
    drawPalm(ctx, x + w * 0.06, y + h * 0.66, h * 0.34, '#1c0a2e');
    drawPalm(ctx, x + w * 0.95, y + h * 0.66, h * 0.30, '#160826');
    drawCar(ctx, x + w * 0.18, y + h * 0.52, w * 0.64, h * 0.34);
    ctx.restore();
    return;
  }
  if (kind === 'car') {
    skyGradient(ctx, x, y, w, h, [[0, '#ffd166'], [0.4, '#ff7a3d'], [0.75, '#ff2e88'], [1, '#3d0f4d']]);
    stripedSun(ctx, x + w * 0.24, y + h * 0.32, Math.min(w, h) * 0.20);
    softCloud(ctx, x + w * 0.62, y + h * 0.14, w * 0.15, 'rgba(255, 214, 166, 0.5)');
    skylineRow(ctx, x, y + h * 0.34, w, h * 0.34, 61, '#3d1445', true);
    ctx.fillStyle = '#12081f'; ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    drawCar(ctx, x + w * 0.06, y + h * 0.28, w * 0.88, h * 0.58);
    ctx.restore();
    return;
  }
  // 'sunset': open sea at dusk, striped sun, shimmer, palms framing the edges.
  skyGradient(ctx, x, y, w, h, [[0, '#ffd166'], [0.45, '#ff7a3d'], [0.8, '#ff2e88'], [1, '#3d0f4d']]);
  stripedSun(ctx, x + w * 0.58, y + h * 0.42, Math.min(w, h) * 0.26);
  ctx.fillStyle = '#2b0f3d'; ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
  ctx.fillStyle = 'rgba(255, 209, 102, 0.5)';
  for (let i = 0; i < 5; i++) ctx.fillRect(x + w * (0.45 + i * 0.07), y + h * (0.66 + i * 0.06), w * 0.22, 2);
  drawPalm(ctx, x - w * 0.02, y + h * 0.98, h * 0.52, '#1c0a2e');
  drawPalm(ctx, x + w * 1.02, y + h * 1.0, h * 0.42, '#160826');
  ctx.restore();
}

/** Shrink a font size until `text` fits `maxW`. Returns the fitted size. */
export function fitText(ctx, text, fontFamily, startSize, maxW, weight = 400) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${fontFamily}`;
  while (size > 10 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${fontFamily}`;
  }
  return size;
}

const GRADE_TINTS = {
  sunset: ['rgba(255, 122, 61, 0.28)', 'rgba(255, 46, 136, 0.30)'],
  neon: ['rgba(34, 230, 255, 0.20)', 'rgba(255, 46, 136, 0.38)'],
  golden: ['rgba(255, 209, 102, 0.34)', 'rgba(255, 122, 61, 0.22)'],
  teal: ['rgba(45, 212, 191, 0.30)', 'rgba(255, 46, 136, 0.30)'],
  noir: ['rgba(0, 0, 0, 0.10)', 'rgba(0, 0, 0, 0.22)'],
};

/**
 * Colour grade over one panel: a warm-to-pink wash, a neon wash, golden hour,
 * teal-and-pink, or a mono wash. Uses soft-light so photos keep their detail.
 */
export function applySunsetGrade(ctx, x, y, w, h, grade) {
  const [top, bottom] = GRADE_TINTS[grade] || GRADE_TINTS.sunset;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const shade = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
  shade.addColorStop(0, 'rgba(20, 6, 32, 0)');
  shade.addColorStop(1, 'rgba(20, 6, 32, 0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Toon filter: turns any photo into comic art.
// Posterised colour (5 levels a channel, saturation boosted), inked edges
// from a Sobel pass on luminance, and flat cel shading. Processed at a
// capped resolution and cached, so a redraw stays fast and an export stays
// under a second.
// ---------------------------------------------------------------------------
const toonCache = new Map();

/** Face-safe cover crop: anchorY near 0 keeps the top of the photo — the head — in frame. */
export function cropRectFor(img, w, h, override) {
  const zoom = override.zoom ?? 1;
  const ox = override.ox ?? 0;
  const oy = override.oy ?? 0;
  const anchorY = override.anchorY ?? 0.05;
  const anchorX = override.anchorX ?? 0.5;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const sw = w / scale;
  const sh = h / scale;
  const sx = clamp((img.naturalWidth - sw) * anchorX + ox * sw, 0, img.naturalWidth - sw);
  const sy = clamp((img.naturalHeight - sh) * anchorY + oy * sh, 0, img.naturalHeight - sh);
  return { sx, sy, sw, sh };
}

export function toonizePhoto(img, crop, pw, ph) {
  const key = `${img.src}|${Math.round(crop.sx)}|${Math.round(crop.sy)}|${Math.round(crop.sw)}|${Math.round(crop.sh)}|${pw}x${ph}`;
  const hit = toonCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(2, pw); c.height = Math.max(2, ph);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, c.width, c.height);
  const imageData = g.getImageData(0, 0, c.width, c.height);
  const d = imageData.data;
  const n = c.width * c.height;
  const lum = new Float32Array(n);
  // Posterise + saturate.
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r0 = d[o], g0 = d[o + 1], b0 = d[o + 2];
    const avg = (r0 + g0 + b0) / 3;
    const r = clamp(avg + (r0 - avg) * 1.15, 0, 255);
    const gg = clamp(avg + (g0 - avg) * 1.15, 0, 255);
    const b = clamp(avg + (b0 - avg) * 1.15, 0, 255);
    d[o] = Math.round(r / 255 * 4) * 63.75;
    d[o + 1] = Math.round(gg / 255 * 4) * 63.75;
    d[o + 2] = Math.round(b / 255 * 4) * 63.75;
    lum[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
  }
  // Sobel edges -> comic ink.
  const W = c.width;
  for (let y = 1; y < c.height - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = -lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1] + lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1];
      const gy = -lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1] + lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1];
      const mag = Math.abs(gx) + Math.abs(gy);
      if (mag > 130) {
        const o = i * 4;
        const k = clamp((mag - 130) / 160, 0.55, 0.92);
        d[o] = d[o] * (1 - k) + 22 * k;
        d[o + 1] = d[o + 1] * (1 - k) + 8 * k;
        d[o + 2] = d[o + 2] * (1 - k) + 38 * k;
      }
    }
  }
  g.putImageData(imageData, 0, 0);
  if (toonCache.size > 24) toonCache.delete(toonCache.keys().next().value);
  toonCache.set(key, c);
  return c;
}

/**
 * Draws one photo panel: face-safe cover-fit photo, Toon-filtered when the
 * Toon switch is on, or a procedural comic scene when no photo is assigned,
 * then the grade and a frame.
 */
export function drawPanel(ctx, panel, img, state) {
  const { x, y, w, h } = panel;
  ctx.save();
  if (panel.rot) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(panel.rot);
    ctx.translate(-w / 2, -h / 2);
  } else {
    ctx.translate(x, y);
  }
  // A soft drop shadow under a tilted panel, like a photo lying on a
  // table — it never covers another panel, since every tilted panel
  // stays inside its own cell.
  if (panel.rot) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.min(18, w * 0.04);
    ctx.shadowOffsetX = w * 0.012;
    ctx.shadowOffsetY = h * 0.03;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  if (img) {
    const override = state.panels[panel.id] || {};
    const crop = cropRectFor(img, w, h, override);
    if (state.toon) {
      const pw = Math.min(Math.round(w), 520);
      const ph = Math.max(2, Math.round(pw * h / w));
      const tc = toonizePhoto(img, crop, pw, ph);
      if (state.grade === 'noir') ctx.filter = 'grayscale(1) contrast(1.12) brightness(1.06)';
      ctx.drawImage(tc, 0, 0, w, h);
      ctx.filter = 'none';
    } else {
      if (state.grade === 'noir') ctx.filter = 'grayscale(1) contrast(1.12) brightness(1.06)';
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
      ctx.filter = 'none';
    }
    applySunsetGrade(ctx, 0, 0, w, h, state.grade);
  } else {
    drawScene(ctx, panel.kind, 0, 0, w, h);
    applySunsetGrade(ctx, 0, 0, w, h, state.grade);
  }
  ctx.restore();
  // White poster frame, following the panel's own rotation.
  ctx.save();
  if (panel.rot) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(panel.rot);
    ctx.translate(-w / 2, -h / 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = Math.max(2, w * 0.008);
    ctx.strokeRect(0, 0, w, h);
  } else {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = Math.max(2, w * 0.008);
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
}

/** The heat badge: a small pink ribbon with five stars. */
export function drawBadgeRibbon(ctx, x, y, w, h) {
  const r = Math.min(h * 0.32, 14);
  ctx.save();
  ctx.fillStyle = '#ff2e88';
  ctx.shadowColor = 'rgba(255, 46, 136, 0.7)'; ctx.shadowBlur = h * 0.35;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const size = fitText(ctx, '★ ★ ★ ★ ★  HEAT 5', 'Anton, sans-serif', h * 0.52, w * 0.92);
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.fillText('★ ★ ★ ★ ★  HEAT 5', x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

/** Halftone dot field behind the title — subtle now, so the title stays clean. */
function halftone(ctx, x, y, w, h) {
  const rnd = mulberry32(4242);
  ctx.save();
  for (let gy = y + 8; gy < y + h - 4; gy += 18) {
    for (let gx = x + 8; gx < x + w - 4; gx += 18) {
      const a = 0.05 + rnd() * 0.09;
      ctx.fillStyle = rnd() > 0.5 ? `rgba(255, 209, 102, ${a})` : `rgba(255, 46, 136, ${a})`;
      ctx.beginPath(); ctx.arc(gx, gy, 1.8 + rnd() * 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * The title block: halftone field, the big invented title in Anton with a
 * sunset gradient fill and white edge, the script subtitle in Pacifico,
 * and a small heat badge ribbon on top. Follows its panel rotation.
 */
export function drawTitleBlock(ctx, x, y, w, h, state, rot = 0) {
  ctx.save();
  if (rot) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rot);
    ctx.translate(-w / 2, -h / 2);
    x = 0; y = 0;
  }
  // A soft drop shadow under the tilted title panel, like a photo
  // lying on a table.
  if (rot) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  const bg = ctx.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, '#1b0f2e'); bg.addColorStop(0.55, '#3d0f3d'); bg.addColorStop(1, '#12081f');
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  halftone(ctx, x, y, w, h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = Math.max(2, w * 0.008);
  ctx.strokeRect(x, y, w, h);
  const title = (state.title || 'VICE COAST').trim().toUpperCase() || 'VICE COAST';
  const sub = (state.subtitle || '').trim();
  const cx = x + w / 2;
  let ty = y + h * 0.50;
  if (state.badge) {
    const bw = Math.min(w * 0.58, 340);
    drawBadgeRibbon(ctx, cx - bw / 2, y + h * 0.06, bw, Math.max(16, h * 0.13));
    ty = y + h * 0.58;
  }
  // A tall, narrow title cell stacks the title on two lines so the
  // lettering stays big instead of shrinking to fit one line in a
  // mostly empty cell.
  const words = title.split(/\s+/);
  const twoLines = w < h * 0.85 && words.length >= 2;
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#ffd166'); grad.addColorStop(0.5, '#ff7a3d'); grad.addColorStop(1, '#ff2e88');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = grad;
  if (twoLines) {
    const mid = Math.ceil(words.length / 2);
    const lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    const size = Math.min(
      fitText(ctx, lines[0], 'Anton, sans-serif', Math.min(h * 0.30, w * 0.30), w * 0.94),
      fitText(ctx, lines[1], 'Anton, sans-serif', Math.min(h * 0.30, w * 0.30), w * 0.94),
    );
    ctx.font = `${size}px Anton, sans-serif`;
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.strokeStyle = '#ffffff';
    const lh = size * 1.08;
    for (const [i, line] of lines.entries()) {
      const ly = ty + (i - 0.5) * lh;
      ctx.strokeText(line, cx, ly);
      ctx.fillText(line, cx, ly);
    }
  } else {
    const size = fitText(ctx, title, 'Anton, sans-serif', Math.min(h * 0.44, w * 0.17), w * 0.94);
    ctx.font = `${size}px Anton, sans-serif`;
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(title, cx, ty);
    ctx.fillText(title, cx, ty);
  }
  if (sub) {
    const sSize = fitText(ctx, sub, 'Pacifico, cursive', Math.min(h * 0.15, 52), w * 0.90);
    ctx.font = `${sSize}px Pacifico, cursive`;
    ctx.fillStyle = '#ffd9ec';
    ctx.shadowColor = 'rgba(255, 46, 136, 0.8)'; ctx.shadowBlur = 12;
    ctx.fillText(sub, cx, y + h * 0.86);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/**
 * The cover background: a full Vice City / Leonida sunset scene behind the
 * tilted panels — never a plain colour. A big striped sun over a layered
 * skyline with lit windows and neon glow, palms framing the edges, and a
 * dark sea with sun shimmer along the bottom. Drawn procedurally in the
 * same comic style (ink outlines, cel colour), all original art: no
 * Rockstar logo, artwork or font. The whole scene is then dimmed with a
 * dark wash so it reads through the gaps between panels and around the
 * edges without stealing attention from the panels or the title.
 */
function coverBackground(ctx, W, H, grade) {
  const night = grade === 'neon';
  const noir = grade === 'noir';
  // Sky: sunset gradient (or a night sky for the neon grade).
  if (night) {
    skyGradient(ctx, 0, 0, W, H, [[0, '#0a0616'], [0.5, '#1c0b33'], [1, '#2b0f3d']]);
    const rnd = mulberry32(99);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      ctx.globalAlpha = 0.25 + rnd() * 0.55;
      ctx.fillRect(rnd() * W, rnd() * H * 0.35, 1.8, 1.8);
    }
    ctx.globalAlpha = 1;
    sunDisc(ctx, W * 0.76, H * 0.26, Math.min(W, H) * 0.16, [[0, 'rgba(255, 240, 200, 0.85)'], [0.6, 'rgba(255, 179, 71, 0.35)'], [1, 'rgba(255, 94, 98, 0)']]);
  } else {
    skyGradient(ctx, 0, 0, W, H, [[0, '#ffd166'], [0.38, '#ff7a3d'], [0.72, '#ff2e88'], [1, '#4d1450']]);
    stripedSun(ctx, W * 0.74, H * 0.30, Math.min(W, H) * 0.20);
    softCloud(ctx, W * 0.10, H * 0.10, W * 0.12, 'rgba(255, 214, 166, 0.55)');
    softCloud(ctx, W * 0.42, H * 0.06, W * 0.09, 'rgba(255, 190, 140, 0.45)');
    softCloud(ctx, W * 0.86, H * 0.14, W * 0.10, 'rgba(255, 214, 166, 0.4)');
  }
  // Far skyline, hazy, then a nearer dark row with lit windows and a
  // few neon signs glowing between the towers.
  const horizon = H * 0.58;
  skylineRow(ctx, 0, horizon - H * 0.22, W, H * 0.22, 101, night ? '#241031' : '#6b2a6e', false);
  skylineRow(ctx, 0, horizon - H * 0.13, W, H * 0.15, 202, night ? '#12081f' : '#2b0f3d', true);
  if (night) {
    const glows = ['#22e6ff', '#ff2e88', '#ff7a3d', '#ffd166'];
    const rnd = mulberry32(7);
    for (let i = 0; i < 5; i++) {
      const gx = W * (0.08 + i * 0.19 + rnd() * 0.05);
      ctx.save();
      ctx.shadowColor = glows[i % glows.length]; ctx.shadowBlur = 14;
      ctx.fillStyle = glows[i % glows.length];
      ctx.fillRect(gx, horizon - H * 0.16, W * 0.05, H * 0.02);
      ctx.restore();
    }
  }
  // Sea below the skyline, with a shimmer path under the sun.
  const seaTop = horizon;
  const seaGrad = ctx.createLinearGradient(0, seaTop, 0, H);
  if (night) { seaGrad.addColorStop(0, '#160b2e'); seaGrad.addColorStop(1, '#070412'); }
  else { seaGrad.addColorStop(0, '#5b2a6e'); seaGrad.addColorStop(0.35, '#3d1450'); seaGrad.addColorStop(1, '#1c0a2e'); }
  ctx.fillStyle = seaGrad;
  ctx.fillRect(0, seaTop, W, H - seaTop);
  ctx.fillStyle = night ? 'rgba(255, 209, 102, 0.35)' : 'rgba(255, 209, 102, 0.55)';
  const sunX = W * 0.74;
  for (let i = 0; i < 6; i++) {
    const sw = W * (0.10 + i * 0.035);
    ctx.fillRect(sunX - sw / 2, seaTop + H * (0.03 + i * 0.045), sw, Math.max(2, H * 0.006));
  }
  // A thin beach strip along the very bottom, with palm shadows.
  ctx.fillStyle = night ? '#241031' : '#7a4a6e';
  ctx.fillRect(0, H * 0.96, W, H * 0.04);
  // Palms framing the scene from the left and right edges, silhouetted
  // against the sky and sea — tall at the corners, shorter mid-edge.
  drawPalm(ctx, W * 0.02, H * 0.62, H * 0.34, '#1c0a2e');
  drawPalm(ctx, W * 0.985, H * 0.60, H * 0.30, '#160826');
  drawPalm(ctx, W * 0.06, H * 0.97, H * 0.22, '#160826');
  drawPalm(ctx, W * 0.95, H * 0.98, H * 0.20, '#1c0a2e');
  // Dim the whole scene so the panels and title stay the stars: a dark
  // purple wash, heaviest at the edges, plus a stronger wash for noir.
  // Kept light enough that the sun, skyline and palms still read clearly
  // through the gaps between the tilted panels.
  const dim = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
  dim.addColorStop(0, noir ? 'rgba(10, 10, 10, 0.55)' : 'rgba(18, 8, 31, 0.26)');
  dim.addColorStop(1, noir ? 'rgba(0, 0, 0, 0.78)' : 'rgba(18, 8, 31, 0.52)');
  ctx.fillStyle = dim;
  ctx.fillRect(0, 0, W, H);
  if (noir) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(128, 128, 128, 1)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

function grainOverlay(ctx, W, H) {
  const rnd = mulberry32(20261119);
  ctx.save();
  ctx.globalAlpha = 0.10;
  for (let i = 0; i < Math.floor((W * H) / 900); i++) {
    const v = rnd() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  }
  ctx.restore();
}

function vignetteOverlay(ctx, W, H) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/**
 * Draws the whole cover onto `ctx` at W x H. `images` is the photo slots
 * array (HTMLImageElement or null); a panel's override picks its slot.
 */
export function drawViceCoastCover(ctx, W, H, state, images) {
  coverBackground(ctx, W, H, state.grade);
  const panels = layoutPanels(state.layout, W, H);
  const titlePanel = panels.find((p) => p.kind === 'title');
  for (const panel of panels) {
    if (panel.kind === 'title') continue;
    const override = state.panels[panel.id] || {};
    const slot = override.photo;
    const img = typeof slot === 'number' ? images[slot] || null : null;
    drawPanel(ctx, panel, img, state);
  }
  if (titlePanel) drawTitleBlock(ctx, titlePanel.x, titlePanel.y, titlePanel.w, titlePanel.h, state, titlePanel.rot || 0);
  if (state.grain) grainOverlay(ctx, W, H);
  if (state.vignette) vignetteOverlay(ctx, W, H);
  return panels;
}

/** Builds a fresh canvas with the cover at W x H and returns it. */
export function exportCoverCanvas(state, images, W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  drawViceCoastCover(canvas.getContext('2d'), W, H, state, images);
  return canvas;
}
