// Vice Coast Cover Studio — tiny static server for local use.
// Serves app/ at the root. Usage: node serve.ts [--port 8080]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), 'app');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function portFromArgs() {
  var args = process.argv.slice(2);
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) return parseInt(args[i + 1], 10);
    var m = /^--port=(\d+)$/.exec(args[i]);
    if (m) return parseInt(m[1], 10);
  }
  return 8080;
}

const port = portFromArgs();

const server = createServer(async (req, res) => {
  try {
    var path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') path = '/index.html';
    var file = normalize(join(root, path));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    var bytes = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(port, () => {
  console.log('Vice Coast Cover Studio at http://localhost:' + port);
});
