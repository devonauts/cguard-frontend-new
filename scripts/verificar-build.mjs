#!/usr/bin/env node
/**
 * RED DE SEGURIDAD DEL ARTEFACTO DE PRODUCCIÓN.
 *
 * El 6 de septiembre de 2026 se publicó un build del CRM que llamaba a
 * `http://localhost:8080/api/auth/sign-in`. Nadie podía entrar. La causa fue el
 * orden de precedencia de Vite —`.env.local` se carga también en `vite build` y
 * pisa a `.env`— pero la LECCIÓN no es esa: es que un artefacto roto así se ve
 * igual que uno bueno. Compila sin un aviso, pesa lo mismo, se despliega sin
 * fricción, y el fallo sólo aparece cuando un usuario real intenta entrar.
 *
 * ── POR QUÉ NO BUSCA «localhost» A PELO ─────────────────────────────────────
 * La primera versión rastreaba `dist` en busca de cualquier URL local. Cazó el
 * fallo real... y otras dos que NO lo eran: un valor por defecto que la línea
 * siguiente sobrescribe (`let a="http://localhost:3001"; a=new URL(env).origin`)
 * y un `"http://localhost"` dentro de una dependencia. Una red que también
 * suena con builds correctos se desactiva a la semana, y entonces no hay red.
 *
 * Así que se comprueba la CAUSA, no sus síntomas, con dos afirmaciones:
 *
 *   1. La variable que Vite resuelve de verdad. Se lee con `loadEnv` de Vite,
 *      o sea con su MISMA precedencia (.env.[modo].local > .env.[modo] >
 *      .env.local > .env). Da igual qué fichero gane ni si alguien exporta la
 *      variable a mano: aquí se ve el valor que se va a incrustar.
 *   2. Que ese valor está de verdad DENTRO del bundle. Cubre el otro fallo
 *      posible: la variable bien puesta pero no incrustada.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

const RAIZ = process.cwd();
const DIST = path.resolve(process.argv[2] || 'dist');
const MODO = process.env.NODE_ENV === 'development' ? 'development' : 'production';

const fallar = (titulo, detalle) => {
  console.error(`\n\x1b[31m[verificar-build] ${titulo}\x1b[0m\n${detalle}\n`);
  process.exit(1);
};

const AYUDA_PRECEDENCIA =
  '  Orden de Vite, de más a menos prioridad:\n' +
  '    .env.production.local  >  .env.production  >  .env.local  >  .env\n' +
  '  La URL de producción tiene que estar en `.env.production`.';

// ── 1. La variable, resuelta como la resuelve Vite ──────────────────────────
const env = loadEnv(MODO, RAIZ, 'VITE_');
const url = (env.VITE_API_URL || '').trim();

if (!url) {
  fallar('VITE_API_URL VACÍA', `  El build saldría sin saber a dónde llamar.\n${AYUDA_PRECEDENCIA}`);
}

let destino;
try {
  destino = new URL(url);
} catch {
  fallar('VITE_API_URL NO ES UNA URL', `  Valor: ${url}\n${AYUDA_PRECEDENCIA}`);
}

const ES_LOCAL =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|.*\.local)$/i.test(destino.hostname) ||
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(destino.hostname);

if (ES_LOCAL) {
  fallar(
    'BUILD DE PRODUCCIÓN APUNTANDO A UNA MÁQUINA LOCAL',
    `  VITE_API_URL = ${url}\n\n` +
      '  Esto es exactamente el fallo del 6-sep-2026: el CRM publicado llamaba a\n' +
      '  localhost y nadie podía iniciar sesión. NO se publica.\n\n' +
      AYUDA_PRECEDENCIA,
  );
}

if (destino.protocol !== 'https:') {
  fallar(
    'VITE_API_URL SIN CIFRAR',
    `  ${url}\n  El navegador bloquea una llamada http:// desde una página https://.\n${AYUDA_PRECEDENCIA}`,
  );
}

// ── 2. Que ese valor viajó de verdad al bundle ──────────────────────────────
if (!fs.existsSync(DIST)) fallar('NO EXISTE dist', `  ${DIST} — ¿falló vite build?`);

function* ficheros(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* ficheros(p);
    else if (/\.(js|mjs)$/i.test(e.name)) yield p;
  }
}

const origen = destino.origin;
let incrustada = false;
for (const f of ficheros(DIST)) {
  if (fs.readFileSync(f, 'utf8').includes(origen)) { incrustada = true; break; }
}

if (!incrustada) {
  fallar(
    'LA URL NO LLEGÓ AL BUNDLE',
    `  VITE_API_URL = ${url}\n  pero «${origen}» no aparece en ningún .js de ${path.relative(RAIZ, DIST)}.\n` +
      '  La variable está bien puesta pero el código no la lee (¿nombre distinto,\n' +
      '  o acceso dinámico a import.meta.env?).',
  );
}

console.log(`[verificar-build] ✓ API = ${url} · incrustada en el bundle`);
