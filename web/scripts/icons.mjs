// Icon font subsetting. The full Material Symbols Rounded variable font is ~4.8 MB; Tide only needs a few dozen
// glyphs at one fixed axis setting (FILL 1, wght 600, GRAD 100, opsz 24, see theme/tokens.css), which is ~1-2% of it.
//
//   node scripts/icons.mjs          regenerate src/theme/fonts/tide-symbols.{woff2,json}
//
// Names are collected from every lowercase string literal in src/ that is a real Material Symbols name (a safe
// superset: dynamic names such as icon(cond ? 'a' : 'b') or { icon: 'dns' } are literals too). test/iconFont.test.ts
// fails when the committed list is out of date.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = join(ROOT, 'src/theme/fonts');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(f)) out.push(p);
  }
  return out;
}

export function allSymbolNames() {
  // From google/material-design-icons variablefont/MaterialSymbolsRounded[...].codepoints (the npm package's type
  // list is incomplete: it lacks e.g. expand_more).
  return new Set(readFileSync(join(ROOT, 'scripts/material-symbols-names.txt'), 'utf8').split('\n').filter(Boolean));
}

/** Every Material Symbols name that appears as a string literal in src/, sorted. */
export function usedIconNames() {
  const known = allSymbolNames();
  const used = new Set();
  for (const file of walk(join(ROOT, 'src'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(['"`])([a-z][a-z0-9_]*)\1/g)) if (known.has(m[2])) used.add(m[2]);
  }
  return [...used].sort();
}

async function main() {
  const names = usedIconNames();
  const css = await (await fetch(
    `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,600,1,100&icon_names=${names.join(',')}&display=block`,
    // A modern UA, or Google serves TTF instead of WOFF2.
    { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } },
  )).text();
  const url = css.match(/url\((https:[^)]+)\) format\('woff2'\)/)?.[1];
  if (!url) throw new Error(`no woff2 in Google Fonts response:\n${css}`);
  const font = Buffer.from(await (await fetch(url)).arrayBuffer());
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'tide-symbols.woff2'), font);
  writeFileSync(join(OUT_DIR, 'tide-symbols.json'), `${JSON.stringify(names)}\n`);
  console.log(`${names.length} icons, ${(font.length / 1024).toFixed(1)} KB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
