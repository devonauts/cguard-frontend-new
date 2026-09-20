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
/* EL ARCHIVO QUE SE MIDE ES EL QUE SE SIRVE.
   Esto leía `pt_fixed.json`, y `src/i18n.ts` dejó de cargarlo hace tiempo: la
   app sirve `pt.json`. El gate llevaba desde entonces midiendo un archivo
   muerto — daba 1.595 claves «sin traducir» que no le faltaban a ningún
   usuario, mientras las que SÍ faltaban en el diccionario vivo pasaban sin que
   nadie las viera. Una paridad que mide lo que no se sirve no es una paridad,
   y una roja permanente enseña a ignorar el CI. */
const pt = load('pt.json');

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

/* ── LOS CINCO EUROPEOS: SE MIRAN, PERO NO TUMBAN EL GATE ──────────────────
   El objetivo del producto es es/en/pt, y ésos SÍ bloquean. Pero de/fr/it/nl/pl
   están en el selector de idioma: quien los elige ve la interfaz en su idioma y
   los huecos EN ESPAÑOL, sin avisar de nada. Llegaron a 90 claves cada uno —el
   asistente de rondas entero, el registro de fichajes rechazados y la ficha
   fiscal— sin que nada lo dijera, porque este guion no los miraba.
   Se informan para que la deriva se vea. Exigir ocho idiomas para poder
   fusionar es una decisión del dueño, no de este archivo. */
const EXTRA = ['de', 'fr', 'it', 'nl', 'pl'];
const huecos = EXTRA.map((l) => {
  const f = flat(load(`${l}.json`));
  return { l, faltan: live.filter((k) => !(k in f)) };
}).filter((x) => x.faltan.length);

if (huecos.length) {
  log('\n⚠️  Idiomas europeos con huecos (no bloquean):');
  huecos.forEach(({ l, faltan }) => {
    log(`     ${l.toUpperCase()}: faltan ${faltan.length} (${pct(faltan.length)}% cubierto)`);
    faltan.slice(0, 5).forEach((k) => log(`        ${k}`));
    if (faltan.length > 5) log(`        … y ${faltan.length - 5} más`);
  });
} else {
  log(`\n✓ Los cinco europeos (${EXTRA.join(', ')}) también están al 100 %.`);
}

if (fail) {
  log('\n✗ PARIDAD ROTA — hay claves sin traducir. Añádelas antes de continuar.');
  process.exit(1);
} else {
  log('\n✓ Paridad completa: en y pt cubren toda la superficie viva de es.');
  process.exit(0);
}
