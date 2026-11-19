// Vice Coast Cover Studio — screenshot scenes (?shot=...).
// Each scene sets the app up, renders, then sets window.__shotReady.
(function () {
  'use strict';

  var q = new URLSearchParams(location.search);
  var shot = q.get('shot') || 'cover';

  function applyShot() {
    var app = window.CoverApp;
    var E = window.CoverEngine;
    if (!app || !E) return false;
    // Wait until the editor has booted and the sample photos are in.
    if (!app.getLayout() || !app.state.photos[0]) return false;

    var caption = q.get('caption') || 'VICE COAST';
    var subtitle = q.get('subtitle') || 'chase the sunset';
    var grade = q.get('grade') || 'sunset';
    var layout = q.get('layout');
    if (!layout || E.LAYOUTS.indexOf(layout) < 0) layout = 'mosaic';

    var stage = document.getElementById('stage');

    if (shot === 'editor') {
      app.setState({ layout: 'mosaic', title: caption, subtitle: subtitle, grade: 'sunset' });
      document.getElementById('title-input').value = caption;
      document.getElementById('subtitle-input').value = subtitle;
      app.render();
      window.__shotReady = true;
      return true;
    }

    // Cover scenes: hide the editor chrome, show only the cover.
    document.body.classList.add('cover-mode');
    var sizes = {
      cover: [1280, 720],
      portrait: [1024, 1280],
      square: [1024, 1024],
    };
    var size = sizes[shot] || sizes.cover;
    stage.width = size[0];
    stage.height = size[1];

    if (shot === 'square') {
      // Show a cover the app actually exported: render at 1080x1080,
      // take the PNG the app wrote, and display it scaled to fit.
      app.setState({ layout: layout, title: caption, subtitle: subtitle, grade: grade });
      E.exportPNG(app.state, 1080, 1080).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var img = new Image();
        img.onload = function () {
          stage.style.display = 'none';
          var wrap = document.createElement('div');
          wrap.style.cssText = 'width:100vw;height:100vh;display:grid;place-items:center;background:#0c1836;';
          img.style.cssText = 'max-width:100vw;max-height:100vh;width:auto;height:auto;';
          img.alt = 'Exported Vice Coast cover, 1080 by 1080 PNG';
          wrap.appendChild(img);
          document.body.appendChild(wrap);
          window.__shotReady = true;
        };
        img.onerror = function () { window.__shotReady = true; };
        img.src = url;
      });
      return true;
    }

    app.setState({ layout: layout, title: caption, subtitle: subtitle, grade: grade });
    app.render();
    window.__shotReady = true;
    return true;
  }

  function waitForApp() {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (applyShot() || tries > 200) {
        clearInterval(timer);
        if (tries > 200) window.__shotReady = true;
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForApp);
  } else {
    waitForApp();
  }
})();
