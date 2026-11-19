// Vice Coast Cover Studio — editor wiring: photos, layout, caption,
// grade, panel selection with drag-to-pan and scroll-to-zoom, PNG export.
(function () {
  'use strict';
  var E = window.CoverEngine;

  var SAMPLE_PHOTOS = ['samples/boulevard.jpg', 'samples/pier.jpg'];
  var SCENES = ['car', 'sunset', 'palms', 'skyline'];

  var state = {
    layout: 'mosaic',
    title: 'VICE COAST',
    subtitle: 'chase the sunset',
    grade: 'sunset',
    toon: true,
    grain: true,
    vignette: true,
    photos: [null, null, null, null],
    pans: [
      { x: 0.5, y: 0, zoom: 1 },
      { x: 0.5, y: 0, zoom: 1 },
      { x: 0.5, y: 0, zoom: 1 },
      { x: 0.5, y: 0, zoom: 1 },
    ],
    selectedPanel: -1,
  };

  var stage = document.getElementById('stage');
  var stageLabel = document.getElementById('stage-label');
  var stageSize = document.getElementById('stage-size');
  var panelInfo = document.getElementById('panel-info');
  var renderTimer = null;
  var lastLayout = null;

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('could not load ' + src)); };
      img.src = src;
    });
  }

  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = requestAnimationFrame(function () {
      renderTimer = null;
      render();
    });
  }

  function render() {
    if (!stage) return;
    lastLayout = E.renderCover(stage, state);
    stageSize.textContent = stage.width + ' × ' + stage.height + ' preview';
    updatePanelInfo();
  }

  function pointInQuad(px, py, quad) {
    var sign = 0;
    for (var i = 0; i < 4; i++) {
      var a = quad[i], b = quad[(i + 1) % 4];
      var cross = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
      if (cross !== 0) {
        var s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (sign !== s) return false;
      }
    }
    return true;
  }

  function panelAt(px, py) {
    if (!lastLayout) return -1;
    var all = [lastLayout.title].concat(lastLayout.panels);
    for (var i = all.length - 1; i >= 0; i--) {
      var p = all[i];
      var quad = E.rotatedCorners(p.cx, p.cy, p.w, p.h, p.angle || 0);
      if (pointInQuad(px, py, quad)) return i;
    }
    return -1;
  }

  function panelLabel(idx) {
    if (idx < 0) return 'No panel selected — click one on the cover.';
    if (idx === 0) return 'Title panel — straight, 0.30 × 0.38 of the cover.';
    var p = lastLayout.panels[idx - 1];
    var what = p.kind === 'photo'
      ? 'photo ' + (p.photoIndex + 1)
      : 'scene: ' + p.scene;
    return 'Panel ' + idx + ' — ' + what + ', tilted ' +
      (p.angle * 180 / Math.PI).toFixed(1) + '°. Drag to pan, scroll to zoom.';
  }

  function updatePanelInfo() {
    panelInfo.textContent = panelLabel(state.selectedPanel);
  }

  // ------------------------------------------------------------ photos

  function addPhotoFiles(files) {
    var list = Array.prototype.slice.call(files, 0, 4);
    var loaded = 0;
    list.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var slot = state.photos.indexOf(null);
          if (slot < 0) slot = 3;
          state.photos[slot] = img;
          state.pans[slot] = { x: 0.5, y: 0, zoom: 1 };
          refreshPhotoStrip();
          scheduleRender();
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
      loaded++;
    });
    return loaded;
  }

  function refreshPhotoStrip() {
    var strip = document.getElementById('photo-strip');
    strip.innerHTML = '';
    state.photos.forEach(function (img, i) {
      if (!img) return;
      var thumb = document.createElement('img');
      thumb.src = img.src;
      thumb.alt = 'Photo ' + (i + 1);
      thumb.title = 'Photo ' + (i + 1) + ' — click to fill the selected panel';
      thumb.addEventListener('click', function () {
        if (state.selectedPanel > 0) {
          var p = lastLayout.panels[state.selectedPanel - 1];
          p.photoIndex = i;
          p.kind = 'photo';
        }
        scheduleRender();
      });
      strip.appendChild(thumb);
    });
  }

  function fillAllWithFirstPhoto() {
    var first = -1;
    for (var i = 0; i < state.photos.length; i++) {
      if (state.photos[i]) { first = i; break; }
    }
    if (first < 0 || !lastLayout) return;
    lastLayout.panels.forEach(function (p) {
      if (p.kind === 'photo') p.photoIndex = first;
    });
    scheduleRender();
  }

  // ------------------------------------------------------------ controls

  function buildChips(containerId, items, current, onPick) {
    var row = document.getElementById(containerId);
    row.innerHTML = '';
    items.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (item.key === current ? ' active' : '');
      b.textContent = item.label;
      b.addEventListener('click', function () {
        onPick(item.key);
        buildChips(containerId, items, item.key, onPick);
        scheduleRender();
      });
      row.appendChild(b);
    });
  }

  function buildLayoutChips() {
    buildChips('layout-row', E.LAYOUTS.map(function (k) {
      return { key: k, label: E.LAYOUT_NAMES[k] };
    }), state.layout, function (k) { state.layout = k; state.selectedPanel = -1; });
  }

  function buildGradeChips() {
    buildChips('grade-row', E.GRADE_ORDER.map(function (k) {
      return { key: k, label: E.GRADES[k].name };
    }), state.grade, function (k) { state.grade = k; });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportSize(w, h, name) {
    return E.exportPNG(state, w, h).then(function (blob) {
      downloadBlob(blob, name);
      return blob;
    });
  }

  // ------------------------------------------------------------ pointer

  var dragging = null;

  function stagePoint(ev) {
    var r = stage.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * stage.width / r.width,
      y: (ev.clientY - r.top) * stage.height / r.height,
    };
  }

  function bindStage() {
    stage.addEventListener('pointerdown', function (ev) {
      var pt = stagePoint(ev);
      var idx = panelAt(pt.x, pt.y);
      state.selectedPanel = idx;
      updatePanelInfo();
      if (idx > 0) {
        var p = lastLayout.panels[idx - 1];
        if (p.kind === 'photo') {
          dragging = { idx: idx, lastX: pt.x, lastY: pt.y };
          stage.setPointerCapture(ev.pointerId);
        }
      }
      scheduleRender();
    });
    stage.addEventListener('pointermove', function (ev) {
      if (!dragging) return;
      var pt = stagePoint(ev);
      var p = lastLayout.panels[dragging.idx - 1];
      var pan = state.pans[p.photoIndex];
      pan.x = E.clamp(pan.x + (pt.x - dragging.lastX) / p.w, 0, 1);
      pan.y = E.clamp(pan.y + (pt.y - dragging.lastY) / p.h, 0, 1);
      dragging.lastX = pt.x;
      dragging.lastY = pt.y;
      scheduleRender();
    });
    stage.addEventListener('pointerup', function () { dragging = null; });
    stage.addEventListener('wheel', function (ev) {
      if (state.selectedPanel <= 0) return;
      ev.preventDefault();
      var p = lastLayout.panels[state.selectedPanel - 1];
      if (p.kind !== 'photo') return;
      var pan = state.pans[p.photoIndex];
      pan.zoom = E.clamp(pan.zoom * (ev.deltaY < 0 ? 1.12 : 0.89), 1, 3);
      scheduleRender();
    }, { passive: false });
  }

  // ------------------------------------------------------------ boot

  function bindControls() {
    document.getElementById('photo-input').addEventListener('change', function (ev) {
      addPhotoFiles(ev.target.files);
      ev.target.value = '';
    });
    document.getElementById('fill-all').addEventListener('click', fillAllWithFirstPhoto);
    document.getElementById('title-input').addEventListener('input', function (ev) {
      state.title = ev.target.value;
      scheduleRender();
    });
    document.getElementById('subtitle-input').addEventListener('input', function (ev) {
      state.subtitle = ev.target.value;
      scheduleRender();
    });
    document.getElementById('toon-toggle').addEventListener('change', function (ev) {
      state.toon = ev.target.checked;
      scheduleRender();
    });
    document.getElementById('grain-toggle').addEventListener('change', function (ev) {
      state.grain = ev.target.checked;
      scheduleRender();
    });
    document.getElementById('vignette-toggle').addEventListener('change', function (ev) {
      state.vignette = ev.target.checked;
      scheduleRender();
    });
    document.getElementById('panel-photo').addEventListener('click', function () {
      if (state.selectedPanel <= 0) return;
      var p = lastLayout.panels[state.selectedPanel - 1];
      p.kind = 'photo';
      if (p.photoIndex == null) p.photoIndex = 0;
      scheduleRender();
    });
    document.getElementById('panel-scene').addEventListener('click', function () {
      if (state.selectedPanel <= 0) return;
      var p = lastLayout.panels[state.selectedPanel - 1];
      p.kind = 'scene';
      p.scene = SCENES[state.selectedPanel % SCENES.length];
      scheduleRender();
    });
    document.getElementById('export-1080').addEventListener('click', function () {
      exportSize(1080, 1080, 'vice-coast-1080x1080.png');
    });
    document.getElementById('export-portrait').addEventListener('click', function () {
      exportSize(1080, 1350, 'vice-coast-1080x1350.png');
    });
    document.getElementById('export-wide').addEventListener('click', function () {
      exportSize(1920, 1080, 'vice-coast-1920x1080.png');
    });
  }

  function boot() {
    buildLayoutChips();
    buildGradeChips();
    bindControls();
    bindStage();
    var fontsReady = Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.ready,
    ]).catch(function () { return null; });
    var samples = SAMPLE_PHOTOS.map(function (src) {
      return loadImage(src).catch(function () { return null; });
    });
    Promise.all([fontsReady].concat(samples)).then(function (results) {
      state.photos[0] = results[1];
      state.photos[1] = results[2];
      refreshPhotoStrip();
      render();
    });
    render();
  }

  window.CoverApp = {
    state: state,
    render: render,
    scheduleRender: scheduleRender,
    exportSize: exportSize,
    getLayout: function () { return lastLayout; },
    setState: function (patch) {
      for (var k in patch) state[k] = patch[k];
      scheduleRender();
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
