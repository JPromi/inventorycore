// Checks that every text key used in the sources exists in public/i18n/de.json.
//   node scripts/check-i18n.mjs                      all sources against de.json
//   node scripts/check-i18n.mjs --only src/app/x     only the sources below a folder
//   node scripts/check-i18n.mjs --json extra.json    additional texts merged over de.json
// Finds t('key'), tn('key'), 'key' | t and 'key' | tn with literal keys; keys built at runtime
// (e.g. 'inspectionStatus.' + status) cannot be checked and must exist for every possible value.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const args = process.argv.slice(2);
const only = [];
const extra = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--only') only.push(join(root, args[++i]));
  else if (args[i] === '--json') extra.push(args[++i]);
}

const texts = JSON.parse(readFileSync(join(root, 'public/i18n/de.json'), 'utf8'));
for (const file of extra) merge(texts, JSON.parse(readFileSync(file, 'utf8')));

const patterns = [
  /\btn?\(\s*'([\w.-]+)'/g,
  /\btn?\(\s*"([\w.-]+)"/g,
  /'([\w.-]+)'\s*\|\s*tn?\b/g,
  /"([\w.-]+)"\s*\|\s*tn?\b/g,
];

const missing = [];
for (const file of walk(join(root, 'src'))) {
  if (only.length && !only.some((dir) => file.startsWith(dir))) continue;
  // comment lines (doc examples) are not uses
  const source = readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).join('\n');
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const key = match[1];
      const isPlural = match[0].includes('tn');
      const found = isPlural ? has(`${key}.one`) && has(`${key}.other`) : has(key);
      if (!found) missing.push(`${relative(root, file)}: ${key}${isPlural ? ' (.one/.other)' : ''}`);
    }
  }
}

if (missing.length) {
  console.error(`Fehlende Texte (${missing.length}):\n` + [...new Set(missing)].join('\n'));
  process.exit(1);
}
console.log('Alle verwendeten Texte sind vorhanden.');

function has(key) {
  let node = texts;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = node[part];
  }
  return typeof node === 'string';
}

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && typeof target[key] === 'object') merge(target[key], value);
    else target[key] = value;
  }
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts')) yield path;
  }
}
