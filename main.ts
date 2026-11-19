// Vice Coast Cover Studio — the entry program (Node 22, standard library only).
//
// It hands the app in: copies this repository's app/ (plain static files the
// browser loads offline — index.html plus its ES modules, vendored fonts and
// sample photos, no network request) and screenshots/ into the output
// directory, then writes /output/dossier.json with the vendored make.fun
// library, the summary the judge reads. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the app locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate allows at most 4 screenshots; refuse loudly instead of handing in
// an entry the scorer would reject.
const shotDir = join(here, 'screenshots');
const shotNames = existsSync(shotDir) ? readdirSync(shotDir).filter((n) => !n.startsWith('.')) : [];
if (shotNames.length > 4) {
  throw new Error(`too many screenshots: ${shotNames.length} (gate allows at most 4)`);
}

mkdirSync(out, { recursive: true });
if (!existsSync(join(here, 'app', 'index.html'))) {
  throw new Error('app/index.html is missing — nothing to hand in');
}
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (kit reference/gate.json): only text_max_bytes shapes
// the dossier's bytes; the rest refuse an entry the scorer would refuse
// (a screenshot over 256 KiB; app/ over 993 files or 48 MiB in all, or a
// path under app/ over 1000 bytes — app/ shares /output's own 1000-entry
// cap with screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
