// Fixed scenes for screenshots, driven by ?shot=:
//   cover     — the exported-style cover alone, landscape 1280x720
//   editor    — the full editor with a sample photo loaded
//   portrait  — the cover alone at 1080x1350 proportions
//   square    — the cover alone at 1080x1080 proportions
// window.__shotReady is set once the scene has painted, after fonts load.
export async function runShot(shot, query, controller) {
  const { state, canvas } = controller;
  const caption = query.get('caption') || 'VICE COAST';
  const subtitle = query.get('subtitle') || 'chase the sunset';
  state.title = caption;
  state.subtitle = subtitle;
  if (query.get('layout')) state.layout = query.get('layout');
  if (query.get('grade')) state.grade = query.get('grade');

  if (shot === 'portrait') {
    document.body.classList.add('shot-cover');
    canvas.width = 1024; canvas.height = 1280;
  } else if (shot === 'square') {
    document.body.classList.add('shot-cover');
    canvas.width = 1024; canvas.height = 1024;
  } else if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    canvas.width = 1280; canvas.height = 720;
  }

  await controller.loadSample(0, query.get('photo') || 'boulevard');
  await controller.loadSample(1, query.get('photo2') || 'pier');
  controller.assignDefaultPanels();
  controller.redraw();

  try { await document.fonts.ready; } catch { /* fonts are optional */ }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    controller.redraw();
    window.__shotReady = true;
  }));
}
