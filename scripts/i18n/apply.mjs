/**
 * Aplica el manifiesto: envuelve el español en `t()` y sube las claves a los
 * tres diccionarios.
 *
 * LA REGLA QUE NO SE PUEDE ROMPER: una cadena sólo se envuelve si su clave
 * queda EN LOS TRES DICCIONARIOS en la misma pasada. El fallo de la pasada
 * anterior no fue envolver mal, fue envolver y no subir la clave: i18next
 * devuelve entonces el `defaultValue` español, sin error y sin que la paridad
 * lo note. Por eso aquí no existe `defaultValue`: si la clave falta, se ve.
 *
 * Uso:  node scripts/i18n/apply.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const SECO = process.argv.includes('--dry');
const man = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts/i18n/pendientes.json'), 'utf8'));

const listos = man.textos.filter((r) => r.en && r.pt);
const escapaRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── agrupar por archivo para leer/escribir una sola vez ────────────────────
const porArchivo = new Map();
for (const r of listos) for (const u of r.usos) {
  if (!porArchivo.has(u.archivo)) porArchivo.set(u.archivo, []);
  porArchivo.get(u.archivo).push({ ...u, clave: r.clave, texto: r.texto });
}

let hechos = 0, saltados = 0;
const tocados = [];

for (const [rel, usos] of porArchivo) {
  const p = path.join(RAIZ, rel);
  let src = fs.readFileSync(p, 'utf8');
  const antes = src;
  // Los textos largos primero: si «Nombre» se sustituyera antes que «Nombre del
  // llamador*», partiría el segundo por la mitad.
  const unicos = [...new Map(usos.map((u) => [u.texto + u.clave, u])).values()]
    .sort((a, b) => b.texto.length - a.texto.length);

  for (const u of unicos) {
    const T = escapaRegex(u.texto);
    const llamada = `t('${u.clave}')`;
    let n = 0;

    // 1. NODO DE TEXTO. Dos cuidados:
    //    · El espacio se conserva como {" "} — sin eso, «Nombre <span>*</span>»
    //      queda pegado: «Nombre*».
    //    · NO se sustituye dentro de una cadena entrecomillada. El patrón
    //      `>texto<` también casa dentro de un literal con HTML —
    //      'No encontramos<br />notas que coincidan<br />…'— y ahí meter {t(…)}
    //      parte el archivo. Se comprueba contando comillas antes del punto.
    src = src.replace(new RegExp(`>(\\s*)${T}(\\s*)<`, 'g'), (m, izq, der, pos) => {
      const inicioLinea = src.lastIndexOf('\n', pos) + 1;
      const antes = src.slice(inicioLinea, pos).replace(/\\./g, '');
      const dentroDeCadena = ((antes.match(/'/g) || []).length % 2) === 1
                          || ((antes.match(/"/g) || []).length % 2) === 1
                          || ((antes.match(/`/g) || []).length % 2) === 1;
      if (dentroDeCadena) return m;
      n++;
      return `>${izq.includes(' ') || izq.includes('\n') ? '{" "}' : ''}{${llamada}}${der.includes(' ') || der.includes('\n') ? '{" "}' : ''}<`;
    });

    // 2. ATRIBUTO VISIBLE. Pasa a llaves: attr="X" → attr={t('k')}
    src = src.replace(
      new RegExp(`\\b(label|placeholder|title|description|hint|empty|sub|alt|tooltip|aria-label|emptyMessage|confirmText|cancelText|noun|subtitle)="${T}"`, 'g'),
      (m, attr) => { n++; return `${attr}={${llamada}}`; },
    );

    // 3. AVISO. toast.x('X') → toast.x(t('k'))
    src = src.replace(new RegExp(`(toast\\.\\w+\\(\\s*)["']${T}["']`, 'g'), (m, pre) => { n++; return `${pre}${llamada}`; });

    if (n) hechos += n; else saltados++;
  }
  if (src !== antes) { tocados.push(rel); if (!SECO) fs.writeFileSync(p, src); }
}

// ── diccionarios: la clave SIEMPRE, en los tres ────────────────────────────
if (!SECO) {
  // En los grupos fusionados a propósito (variantes de mayúsculas o puntos
  // suspensivos del mismo texto) TODAS las filas comparten clave: hay que
  // escribir la forma canónica, o el español que queda es el de la última fila.
  // `pt.json` es el diccionario que carga `src/i18n.ts`. Aquí ponía
  // `pt_fixed`, así que cada pasada escribía el portugués en un archivo que la
  // app no lee: la clave se envolvía en `t()` y el usuario brasileño seguía
  // viendo español. Es la misma fuga que el comentario de arriba jura evitar.
  for (const [arch, campo] of [['es', 'texto'], ['en', 'en'], ['pt', 'pt']]) {
    const p = path.join(RAIZ, 'src/locales', `${arch}.json`);
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const r of listos) {
      const partes = r.clave.split('.');
      let nodo = d;
      for (const x of partes.slice(0, -1)) {
        if (typeof nodo[x] !== 'object' || nodo[x] === null) nodo[x] = {};
        nodo = nodo[x];
      }
      nodo[partes.at(-1)] = campo === 'texto' ? (r.textoCanonico || r.texto) : r[campo];
    }
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n');
  }
}

console.log(`${SECO ? '[SECO] ' : ''}sustituciones: ${hechos} · archivos tocados: ${tocados.length} · textos sin coincidencia: ${saltados}`);
