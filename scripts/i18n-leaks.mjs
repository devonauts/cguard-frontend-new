/**
 * Busca TEXTO EN ESPAÑOL QUE NUNCA SE TRADUCE, que es lo que el chequeo de
 * paridad no puede ver.
 *
 * POR QUÉ HACE FALTA OTRO ESCÁNER. `i18n-parity.mjs` compara las claves que
 * EXISTEN en los tres JSON, y da 100% mientras las tres listas coincidan. No
 * detecta nada de esto:
 *
 *   A) `t('clave')` donde `clave` NO está en en.json → i18next devuelve el texto
 *      por defecto (español) o la clave cruda. Sin error, sin aviso.
 *   B) Texto español escrito a mano en el JSX, que ni siquiera pasa por `t()`.
 *   C) La clave SÍ está en en.json… pero su VALOR sigue en español. Es la más
 *      escurridiza: la paridad la cuenta como cubierta y el escáner de claves
 *      tampoco la ve, porque la clave existe. Sólo se nota mirando el texto.
 *
 * Las dos se ven igual en pantalla: una página en español con el CRM en inglés.
 *
 * Uso:  node scripts/i18n-leaks.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(RAIZ, 'src');

// ── diccionarios ───────────────────────────────────────────────────────────
const aplanar = (o, pre = '', out = {}) => {
  for (const [k, v] of Object.entries(o || {})) {
    const clave = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) aplanar(v, clave, out);
    else out[clave] = v;
  }
  return out;
};
const es = aplanar(JSON.parse(fs.readFileSync(path.join(SRC, 'locales/es.json'), 'utf8')));
const en = aplanar(JSON.parse(fs.readFileSync(path.join(SRC, 'locales/en.json'), 'utf8')));
const enTiene = (k) => Object.prototype.hasOwnProperty.call(en, k);

// ── recorrer archivos ──────────────────────────────────────────────────────
const archivos = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|locales|__/.test(e.name)) anda(p); }
    else if (/\.tsx$/.test(e.name)) archivos.push(p);
  }
})(SRC);

// ── señales de español ─────────────────────────────────────────────────────
const ACENTOS = /[áéíóúÁÉÍÓÚñÑ¿¡]/;
// Palabras que sólo aparecen en español y no en inglés/portugués técnico.
const PALABRAS = /\b(el|la|los|las|un|una|del|con|para|por|que|sin|sobre|desde|hasta|este|esta|estos|cuando|donde|quien|cual|todos|todas|cada|puede|debe|tiene|hay|guardar|cerrar|buscar|eliminar|editar|agregar|añadir|nuevo|nueva|cancelar|aceptar|volver|siguiente|anterior|cargando|ninguno|seleccionar|elegir|nombre|apellido|correo|contraseña|fecha|hora|turno|puesto|vigilante|guardia|cliente|empresa|reporte|informe)\b/i;
const esEspanol = (s) => {
  const t = s.trim();
  if (t.length < 3 || t.length > 300) return false;
  if (/^[\d\s\W]+$/.test(t)) return false;          // sólo símbolos/números
  if (/^https?:|^\/|^[a-z]+([A-Z][a-z]+)+$/.test(t)) return false; // urls, rutas, camelCase
  return ACENTOS.test(t) || (PALABRAS.test(t) && /\s/.test(t));
};

// Claves muertas: duplican namespaces de primer nivel y el código nunca las
// invoca (el menú resuelve `sidebar.<id>.label` dinámico). Traducirlas es
// trabajo tirado, así que tampoco se denuncian.
const MUERTAS = /^sidebar\.(postSites|guards|clients|adminOfficeUsers|auth|dashboard|dispatcher|header|incidents|actions)\./;

const hallazgos = [];

// ── C) claves cuyo VALOR inglés sigue en español ───────────────────────────
{
  // Palabras que en inglés no existen. Un valor «inglés» que las contenga no se
  // tradujo nunca. Se exige una señal fuerte —acento o palabra funcional— para
  // no denunciar nombres propios ni topónimos («Bogotá» en una zona horaria).
  const FUNCIONAL = /\b(el|la|los|las|un|una|del|con|para|por|que|sin|sobre|desde|hasta|este|esta|cuando|donde|todos|cada|puede|debe|tiene|no hay|más)\b/i;
  for (const [k, v] of Object.entries(en)) {
    if (MUERTAS.test(k) || typeof v !== 'string' || v.length < 6) continue;
    if (!FUNCIONAL.test(v)) continue;          // sin palabra funcional española, no concluye
    hallazgos.push({ archivo: '(src/locales/en.json)', linea: 0, tipo: 'valor-ingles-en-espanol', clave: k, texto: v });
  }
}


for (const f of archivos) {
  const rel = path.relative(RAIZ, f);
  const src = fs.readFileSync(f, 'utf8');
  const lineas = src.split('\n');

  // ── A) claves t() que no están en en.json ────────────────────────────────
  for (const m of src.matchAll(/\bt\(\s*['"`]([^'"`]+)['"`]/g)) {
    const clave = m[1];
    if (clave.includes('${') || /^\s*$/.test(clave)) continue;   // clave dinámica
    if (enTiene(clave)) continue;
    const linea = src.slice(0, m.index).split('\n').length;
    hallazgos.push({
      archivo: rel, linea, tipo: 'clave-sin-ingles', clave,
      // Si tampoco está en es.json, en pantalla sale la CLAVE CRUDA.
      gravedad: Object.prototype.hasOwnProperty.call(es, clave) ? 'cae-a-espanol' : 'clave-cruda',
      muestra: (lineas[linea - 1] || '').trim().slice(0, 120),
    });
  }

  // ── B) español escrito a mano en el JSX ──────────────────────────────────
  lineas.forEach((ln, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;            // comentario
    if (/\bt\(|i18n\.t\(|useTranslation/.test(ln)) return; // ya traduce algo

    // texto entre etiquetas:  >Texto suelto<
    for (const m of ln.matchAll(/>\s*([^<>{}\n][^<>{}\n]{2,120}?)\s*</g)) {
      if (esEspanol(m[1])) hallazgos.push({
        archivo: rel, linea: i + 1, tipo: 'texto-fijo', texto: m[1].trim(), muestra: ln.trim().slice(0, 120),
      });
    }
    // atributos que se ven:  label="Texto"  placeholder="Texto"  title=…
    for (const m of ln.matchAll(/\b(label|placeholder|title|description|hint|empty|sub|alt|tooltip|aria-label)="([^"]{3,120})"/g)) {
      if (esEspanol(m[2])) hallazgos.push({
        archivo: rel, linea: i + 1, tipo: 'atributo-fijo', atributo: m[1], texto: m[2], muestra: ln.trim().slice(0, 120),
      });
    }
  });
}

// ── agrupar por página ─────────────────────────────────────────────────────
const porArchivo = {};
for (const h of hallazgos) (porArchivo[h.archivo] ||= []).push(h);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ hallazgos, porArchivo }, null, 1));
} else {
  const orden = Object.entries(porArchivo).sort((a, b) => b[1].length - a[1].length);
  console.log(`\n── Fugas de español en el CRM ──`);
  console.log(`   ${hallazgos.length} hallazgos en ${orden.length} archivos (de ${archivos.length} .tsx)\n`);
  const porTipo = {};
  for (const h of hallazgos) porTipo[h.tipo] = (porTipo[h.tipo] || 0) + 1;
  for (const [k, v] of Object.entries(porTipo)) console.log(`   ${k.padEnd(20)} ${v}`);
  console.log('\n   Peores archivos:');
  for (const [a, hs] of orden.slice(0, 30)) console.log(`   ${String(hs.length).padStart(4)}  ${a}`);
}
