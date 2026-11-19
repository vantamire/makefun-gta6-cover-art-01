// Vice Coast Cover Studio — editor wiring: photos, panel picking, pan and zoom,
// layout / grade / caption controls, and the one-click PNG export.
// A `?shot=` query hands the page to ./shots.js for a fixed screenshot scene.
import { defaultCoverState, drawViceCoastCover, exportCoverCanvas, layoutPanels } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const panelHint = document.getElementById('panelHint');
const zoomInput = document.getElementById('zoom');
const zoomVal = document.getElementById('zoomVal');
const photoSlotsEl = document.getElementById('photoSlots');
const panelStripEl = document.getElementById('panelStrip');

const state = defaultCoverState();
const images = [null, null, null, null]; // up to 4 photo slots
let activeSlot = 0;
let selectedPanel = 'c0';
let dragging = null;

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function redraw() {
  drawViceCoastCover(ctx, canvas.width, canvas.height, state, images);
  renderPanelStrip();
}

function renderPhotoSlots() {
  photoSlotsEl.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `photo-slot${i === activeSlot ? ' active' : ''}`;
    b.title = images[i] ? `Photo ${i + 1} — click to use for the selected panel` : `Photo ${i + 1} — empty`;
    if (images[i]) b.style.backgroundImage = `url(${images[i].src})`;
    else b.textContent = '+';
    const n = document.createElement('span');
    n.className = 'n'; n.textContent = String(i + 1);
    b.appendChild(n);
    b.addEventListener('click', () => {
      activeSlot = i;
      assignPhotoToSelected(i);
      renderPhotoSlots();
    });
    photoSlotsEl.appendChild(b);
  }
}

function renderPanelStrip() {
  const panels = layoutPanels(state.layout, canvas.width, canvas.height)
    .filter((p) => p.kind !== 'title');
  panelStripEl.innerHTML = '';
  for (const p of panels) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `panel-chip${p.id === selectedPanel ? ' active' : ''}`;
    b.textContent = `${p.id} · ${p.kind}`;
    b.addEventListener('click', () => { selectPanel(p.id); });
    panelStripEl.appendChild(b);
  }
}

/** Picks a panel for cropping: shows its zoom and updates the hint. */
export function selectPanel(id) {
  selectedPanel = id;
  const override = state.panels[id] || {};
  zoomInput.value = String(override.zoom ?? 1);
  zoomVal.textContent = `${Number(zoomInput.value).toFixed(2)}×`;
  panelHint.textContent = `Panel ${id} selected — drag it in the preview to pan, use Zoom to crop. Click a photo slot to put that photo here.`;
  redraw();
}

/** Assigns photo slot `slot` to the selected panel (or the first panel). */
export function assignPhotoToSelected(slot) {
  if (!images[slot]) return;
  const id = selectedPanel || 'c0';
  state.panels[id] = { ...(state.panels[id] || {}), photo: slot };
  redraw();
}

/** Loads a user file into a photo slot, then fills empty panels with it. */
export async function loadPhoto(file, slot) {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  images[slot] = img;
  activeSlot = slot;
  for (const p of layoutPanels(state.layout, canvas.width, canvas.height)) {
    if (p.kind === 'title') continue;
    const o = state.panels[p.id] || {};
    if (typeof o.photo !== 'number') state.panels[p.id] = { ...o, photo: slot };
  }
  renderPhotoSlots();
  redraw();
}

/** Drags the selected panel's photo to pan it inside its frame. */
export function panPanel(id, dx, dy) {
  const o = state.panels[id] || {};
  state.panels[id] = { ...o, ox: (o.ox ?? 0) + dx, oy: (o.oy ?? 0) + dy };
  redraw();
}

/** Sets the selected panel's zoom (1 = fit, 2.5 = tight crop). */
export function zoomPanel(id, zoom) {
  const o = state.panels[id] || {};
  state.panels[id] = { ...o, zoom };
  zoomVal.textContent = `${zoom.toFixed(2)}×`;
  redraw();
}

/** Renders the cover at W x H and downloads it as a PNG. */
export function exportCover() {
  const [w, h] = document.getElementById('exportSize').value.split('x').map(Number);
  const out = exportCoverCanvas(state, images, w, h);
  out.toBlob((blob) => {
    if (!blob) { statusEl.textContent = 'Export failed — try again.'; return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-coast-cover-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    statusEl.textContent = `Saved vice-coast-cover-${w}x${h}.png — share it!`;
  }, 'image/png');
}

function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

canvas.addEventListener('pointerdown', (e) => {
  const pt = canvasPoint(e);
  const panels = layoutPanels(state.layout, canvas.width, canvas.height);
  const hit = [...panels].reverse().find((p) => pt.x >= p.x && pt.x <= p.x + p.w && pt.y >= p.y && pt.y <= p.y + p.h);
  if (!hit || hit.kind === 'title') return;
  selectPanel(hit.id);
  dragging = { id: hit.id, x: pt.x, y: pt.y };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const pt = canvasPoint(e);
  panPanel(dragging.id, (pt.x - dragging.x) / canvas.width, (pt.y - dragging.y) / canvas.height);
  dragging.x = pt.x; dragging.y = pt.y;
});
canvas.addEventListener('pointerup', () => { dragging = null; });

document.getElementById('photos').addEventListener('change', async (e) => {
  const files = [...e.target.files].slice(0, 4);
  for (let i = 0; i < files.length; i++) {
    const slot = images.findIndex((im) => !im);
    if (slot === -1) break;
    try { await loadPhoto(files[i], slot); } catch { statusEl.textContent = 'That file could not be read as a photo.'; }
  }
  e.target.value = '';
});
document.getElementById('fillAll').addEventListener('click', () => {
  if (!images[activeSlot]) { statusEl.textContent = 'Add a photo first.'; return; }
  for (const p of layoutPanels(state.layout, canvas.width, canvas.height)) {
    if (p.kind === 'title') continue;
    state.panels[p.id] = { ...(state.panels[p.id] || {}), photo: activeSlot };
  }
  statusEl.textContent = `All panels now use photo ${activeSlot + 1}.`;
  redraw();
});
document.getElementById('layoutRow').addEventListener('click', (e) => {
  const b = e.target.closest('[data-layout]');
  if (!b) return;
  state.layout = b.dataset.layout;
  document.querySelectorAll('#layoutRow .btn-toggle').forEach((x) => x.classList.toggle('active', x === b));
  selectedPanel = layoutPanels(state.layout, canvas.width, canvas.height).find((p) => p.kind !== 'title')?.id || 'c0';
  redraw();
});
document.getElementById('gradeRow').addEventListener('click', (e) => {
  const b = e.target.closest('[data-grade]');
  if (!b) return;
  state.grade = b.dataset.grade;
  document.querySelectorAll('#gradeRow .btn-toggle').forEach((x) => x.classList.toggle('active', x === b));
  redraw();
});
document.getElementById('title').addEventListener('input', (e) => { state.title = e.target.value; redraw(); });
document.getElementById('subtitle').addEventListener('input', (e) => { state.subtitle = e.target.value; redraw(); });
zoomInput.addEventListener('input', () => zoomPanel(selectedPanel, Number(zoomInput.value)));
for (const id of ['grain', 'vignette', 'badge', 'toon']) {
  document.getElementById(id).addEventListener('change', (e) => { state[id] = e.target.checked; redraw(); });
}
document.getElementById('export').addEventListener('click', exportCover);

// Default cover: photos fill the photo panels, each with its own crop —
// the hero and pier panels at full frame (face-safe, anchored at the top),
// the skyline/street/sunset panels as tighter second crops of the same
// photos. Procedural comic scenes fill only the remaining panels.
const PHOTO_BY_KIND = {
  hero: { photo: 0, zoom: 1.0, anchorY: 0.04 },
  skyline: { photo: 0, zoom: 1.7, anchorY: 0.10 },
  pier: { photo: 1, zoom: 1.0, anchorY: 0.04 },
  street: { photo: 1, zoom: 1.65, anchorY: 0.08 },
  sunset: { photo: 0, zoom: 1.35, anchorY: 0.10 },
};
const controller = {
  state, images, canvas,
  async loadSample(slot, name) {
    images[slot] = await loadImage(`samples/${name}.jpg`);
    renderPhotoSlots();
  },
  assignDefaultPanels() {
    for (const p of layoutPanels(state.layout, canvas.width, canvas.height)) {
      const m = PHOTO_BY_KIND[p.kind];
      if (m) state.panels[p.id] = { ...m };
    }
  },
  redraw,
};

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  runShot(shot, params, controller);
} else {
  (async () => {
    try {
      await controller.loadSample(0, 'boulevard');
      await controller.loadSample(1, 'pier');
      controller.assignDefaultPanels();
    } catch { /* samples are optional; procedural art still draws */ }
    renderPhotoSlots();
    redraw();
  })();
}
