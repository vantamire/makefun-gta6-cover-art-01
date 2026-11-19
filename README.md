# Vice Coast Cover Studio

Turn any photo and caption into GTA 6-style multi-panel cover art — a
sunset Vice City poster with bold lettering, comic-book (toon) photos, and
neon signs. Everything runs offline in the browser: no upload, no account,
no network request.

## What it does

- **4 layouts** — Varied mosaic, Hero + 3 panels, Dynamic collage (tilted
  panels that never overlap), and Full-bleed photo.
- **Up to 4 photos** — assign a photo per panel, drag to pan, zoom to crop.
  The **Toon filter** (on by default) turns every photo into comic art:
  posterised colour, inked Sobel edges, cel shading. Faces are never
  cropped — the crop anchors at the top of the photo.
- **5 colour grades** — Sunset, Neon Night, Golden Hour, Teal Pink, Mono Noir.
- **Bold captions** — big Anton title with a sunset gradient, Pacifico
  subtitle, and a HEAT 5 badge ribbon.
- **Procedural comic art** — every scene the app draws itself (palm trees,
  a detailed sports car, layered skylines, neon shop signs, a striped
  sunset over the sea) is original: no Rockstar logo, artwork, or font.

## How to use

1. Open `app/index.html` in a browser, or run `node serve.ts` and open
   http://localhost:8080.
2. Add your photos (or use the two sample photos already loaded).
3. Pick a layout, type a title and subtitle, pick a grade.
4. Click a panel to select it, drag to pan, zoom to crop.
5. Choose an export size and hit **Export PNG**.

## Export sizes

- 1920 × 1080 (landscape)
- 1080 × 1080 (square)
- 1080 × 1350 (portrait)

## Fonts

Anton and Pacifico, vendored under `app/fonts/` under the SIL Open Font
License (see `OFL.txt` and `OFL-Pacifico.txt`).

## License

MIT — see `LICENSE`.
