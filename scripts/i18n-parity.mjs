/**
 * ════════════════════════════════════════════════════════════════════════════
 * PARIDAD DE IDIOMAS — es / en / pt del CRM.
 *
 * Falla (exit 1) si el inglés o el portugués no cubren TODAS las claves VIVAS del
 * español (la referencia). Así el portugués no vuelve a derivar a un porcentaje
 * bajo sin que nadie lo note.
 *
 * SUPERFICIE VIVA: se excluyen las claves muertas `sidebar.<módulo>` que DUPLICAN
 * un namespace de primer nivel y que el código nunca invoca (el menú resuelve
 * `sidebar.<id>.label` de forma dinámica). Traducir esas sería trabajo tirado.
 *
 * Correr:  npm run i18n:parity
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = resolve(__dirname, '..', 'src', 'locales');

const load = (f) => JSON.parse(readFileSync(resolve(localesDir, f), 'utf-8'));
const es = load('es.json');
const en = load('en.json');
const pt = load('pt_fixed.json');

// Sub-ramas de `sidebar` que duplican un namespace top-level → claves muertas.
const DEAD_SIDEBAR = new Set([
  'actions', 'adminOfficeUsers', 'auth', 'clients', 'dashboard',
  'dispatcher', 'guards', 'header', 'incidents', 'postSites',
]);

function flat(o, prefix = '') {
  const out = {};
  for (const k of Object.keys(o || {})) {
    const nk = prefix ? `${prefix}.${k}` : k;
    const v = o[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flat(v, nk));
    else out[nk] = v;
  }
  return out;
}

const isAlive = (k) => {
  const parts = k.split('.');
  return !(parts[0] === 'sidebar' && parts.length >= 2 && DEAD_SIDEBAR.has(parts[1]));
};

const fes = flat(es);
const fen = flat(en);
const fpt = flat(pt);

const live = Object.keys(fes).filter((k) => isAlive(k) && typeof fes[k] === 'string');
const missingEN = live.filter((k) => !(k in fen));
const missingPT = live.filter((k) => !(k in fpt));
// Cognados válidos entre es y pt son legítimos → aviso, no error.
const stuckPT = live.filter(
  (k) => k in fpt && typeof fpt[k] === 'string' && fpt[k] === fes[k] && String(fes[k]).length > 3 && /\s/.test(String(fes[k])),
);

let fail = false;
const log = (s) => process.stdout.write(s + '\n');

const pct = (n) => Math.round((100 * (live.length - n)) / live.length);
log('── Paridad i18n CRM (superficie viva, referencia: es) ──');
log(`   claves vivas es=${live.length}   en=${pct(missingEN.length)}%   pt=${pct(missingPT.length)}%`);

if (missingEN.length) {
  fail = true;
  log(`\n❌ EN: faltan ${missingEN.length} claves`);
  missingEN.slice(0, 40).forEach((k) => log(`     ${k}`));
  if (missingEN.length > 40) log(`     … y ${missingEN.length - 40} más`);
}
if (missingPT.length) {
  fail = true;
  log(`\n❌ PT: faltan ${missingPT.length} claves`);
  missingPT.slice(0, 40).forEach((k) => log(`     ${k}`));
  if (missingPT.length > 40) log(`     … y ${missingPT.length - 40} más`);
}
if (stuckPT.length) log(`\n⚠️  PT: ${stuckPT.length} valores idénticos al español (revisar si son cognados o falta traducir)`);

if (fail) {
  log('\n✗ PARIDAD ROTA — hay claves sin traducir. Añádelas antes de continuar.');
  process.exit(1);
} else {
  log('\n✓ Paridad completa: en y pt cubren toda la superficie viva de es.');
  process.exit(0);
}
