/**
 * Extrae el español que quedó FUERA del diccionario, sin usar la tilde como
 * detector.
 *
 * POR QUÉ EXISTE. La pasada automática anterior envolvió 629 cadenas en
 * `pages/admin` y NI UNA carecía de tilde: usó el acento como señal de
 * «esto es español». Todo lo que se escribe sin tilde —«Domingo», «Nombre»,
 * «Cancelar», «Estado»— le resultó invisible, y por eso el CRM sigue mezclando
 * idiomas dentro de una misma línea. Esta herramienta detecta por VOCABULARIO,
 * no por ortografía.
 *
 * Emite un manifiesto de cadenas DISTINTAS para traducir una sola vez, con
 * todas sus apariciones. Aplicar es otro paso (apply.mjs): separar extracción de
 * escritura es lo que permite revisar las traducciones antes de tocar el código.
 *
 * Uso:  node scripts/i18n/extract.mjs [--todos]
 *       (por defecto sólo archivos que YA tienen `t()` en alcance: no hay que
 *        insertar hooks y por tanto no se puede romper una firma)
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const TODOS = process.argv.includes('--todos');

// ── señales de español ─────────────────────────────────────────────────────
const ACENTO = /[áéíóúñÁÉÍÓÚÑ¿¡]/;
// Palabras que en inglés no existen o no se usan así. Detectar por VOCABULARIO
// es lo que arregla el fallo de la pasada anterior.
const ESP = new RegExp('\\b(' + [
  'el','la','los','las','un','una','del','con','para','por','que','sin','sobre','desde','hasta',
  'este','esta','estos','estas','cuando','donde','todos','todas','cada','puede','debe','tiene','hay',
  'su','sus','más','ya','no hay','se',
  'nombre','estado','activo','inactivo','guardar','cancelar','cerrar','buscar','eliminar','editar',
  'agregar','añadir','nuevo','nueva','anterior','siguiente','fecha','hora','turno','puesto','cliente',
  'empresa','reporte','informe','usuario','contacto','correo','telefono','ciudad','notas','total',
  'cargando','ninguno','seleccionar','elegir','enviar','crear','borrar','detalle','detalles','resumen',
  'lista','tipo','motivo','abierto','cerrado','pendiente','aprobado','rechazado','vigilante','supervisor',
  'incidente','ronda','visita','asistencia','horario','alta','media','baja','activa','inactiva',
  'domingo','lunes','martes','jueves','viernes','enero','marzo','mayo','junio','julio','agosto',
].join('|') + ')\\b', 'i');

const ATTRS = '(label|placeholder|title|description|hint|empty|sub|alt|tooltip|aria-label|emptyMessage|confirmText|cancelText|noun|subtitle)';

const esEspanol = (t) => {
  if (!t || t.length < 3 || t.length > 160) return false;
  if (/^https?:|^\/|^\d|^[a-z]+([A-Z][a-z]+)+$/.test(t)) return false; // url, ruta, número, camelCase
  if (!/[a-záéíóúñ]/i.test(t)) return false;                            // sólo símbolos
  return ACENTO.test(t) || ESP.test(t);
};

/** camelCase corto y estable a partir del texto — la convención `ui.<Comp>.<clave>`. */
const aClave = (t) => {
  const limpio = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 5);
  if (!limpio.length) return 'texto';
  return limpio[0].toLowerCase() + limpio.slice(1).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
};

const archivos = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|locales/.test(e.name)) anda(p); }
    else if (e.name.endsWith('.tsx') && !e.name.includes('StyleGuide')) archivos.push(p);
  }
})(path.join(RAIZ, 'src'));

const TIENE_HOOK = /const\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useTranslation/;
const porTexto = new Map();

for (const f of archivos) {
  const rel = path.relative(RAIZ, f);
  const src = fs.readFileSync(f, 'utf8');
  const hook = TIENE_HOOK.test(src);
  if (!hook && !TODOS) continue;

  const comp = path.basename(f, '.tsx').replace(/[^A-Za-z0-9]/g, '');
  src.split('\n').forEach((ln, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(ln) || ln.includes('console.')) return;

    const hallados = [];
    // 1. nodo de texto:  >Texto suelto<
    for (const m of ln.matchAll(/>\s*([^<>{}\n][^<>{}\n]{2,120}?)\s*</g)) hallados.push(['texto', m[1]]);
    // 2. atributo visible:  label="Texto"
    for (const m of ln.matchAll(new RegExp(`\\b${ATTRS}="([^"]{3,120})"`, 'g'))) hallados.push(['attr', m[2]]);
    // 3. aviso:  toast.success('Texto')
    for (const m of ln.matchAll(/toast\.\w+\(\s*["']([^"']{4,140})["']/g)) hallados.push(['toast', m[1]]);

    for (const [clase, crudo] of hallados) {
      const t = crudo.trim();
      if (!esEspanol(t)) continue;
      if (!porTexto.has(t)) porTexto.set(t, { texto: t, clave: null, usos: [] });
      porTexto.get(t).usos.push({ archivo: rel, linea: i + 1, clase, comp, hook });
    }
  });
}

// Una clave por texto DISTINTO. Si aparece en un solo componente cuelga de él;
// si se repite en varios es vocabulario común y va a `comun.*` — así «Cancelar»
// se traduce una vez y no cincuenta y tres.
const salida = [];
for (const reg of porTexto.values()) {
  const comps = [...new Set(reg.usos.map(u => u.comp))];
  reg.clave = comps.length === 1 ? `ui.${comps[0]}.${aClave(reg.texto)}` : `comun.${aClave(reg.texto)}`;
  salida.push(reg);
}
salida.sort((a, b) => b.usos.length - a.usos.length);

const destino = path.join(RAIZ, 'scripts/i18n/pendientes.json');
fs.writeFileSync(destino, JSON.stringify({ generado: salida.length, textos: salida }, null, 1));

const apariciones = salida.reduce((n, r) => n + r.usos.length, 0);
const compartidas = salida.filter(r => r.clave.startsWith('comun.')).length;
console.log(`textos DISTINTOS: ${salida.length}  ·  apariciones: ${apariciones}  ·  compartidos entre componentes: ${compartidas}`);
console.log(`→ ${destino}`);
