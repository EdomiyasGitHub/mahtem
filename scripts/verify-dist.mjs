// Post-build check: confirms the production bundle is compatible with the
// strict CSP, without needing a browser. Run after `npm run build`.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const dist = 'dist';
const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(dist);

// 1. _headers exists and carries the CSP.
const headersPath = join(dist, '_headers');
if (!existsSync(headersPath)) fail('dist/_headers is missing');
else {
  const h = readFileSync(headersPath, 'utf8');
  if (!h.includes("connect-src 'none'")) fail("_headers CSP lacks connect-src 'none'");
  if (!h.includes("default-src 'none'")) fail("_headers CSP lacks default-src 'none'");
}

// 2. index.html has no inline scripts, inline styles or style attributes.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const [, attrs, body] = m;
  if (!/\bsrc=/.test(attrs) && body.trim()) fail('index.html contains an inline <script> (blocked by CSP)');
}
if (/<style\b/.test(html)) fail('index.html contains an inline <style> (blocked by CSP)');
if (/\sstyle=/.test(html)) fail('index.html contains a style= attribute (blocked by CSP)');
if (/https?:\/\/(?!www\.w3\.org)/.test(html)) fail('index.html references an external URL');

// 3. No asset references a third-party origin or a data: font.
for (const f of files.filter((f) => ['.css', '.js'].includes(extname(f)))) {
  const text = readFileSync(f, 'utf8');
  if (/url\(\s*["']?https?:/.test(text)) fail(`${f} loads a remote url()`);
  if (/url\(\s*["']?data:font/.test(text)) fail(`${f} inlines a data: font (blocked by font-src 'self')`);
  if (/fonts\.(googleapis|gstatic)\.com/.test(text)) fail(`${f} references Google Fonts`);
}

// 4. No source maps shipped.
if (files.some((f) => f.endsWith('.map'))) fail('source maps found in dist/');

const size = files.reduce((n, f) => n + statSync(f).size, 0);
if (failures.length) {
  console.error('verify-dist FAILED:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`verify-dist OK: ${files.length} files, ${(size / 1024).toFixed(0)} KiB, CSP-compatible, _headers present.`);
