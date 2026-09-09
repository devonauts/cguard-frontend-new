/**
 * Unit tests — LOS TRES ARCHIVOS QUE BAJA UN INFORME.
 *
 * Lo que se rompió: durante meses el menú decía «Exportar como Excel» y bajaba
 * un `.csv` renombrado, y «Exportar como PDF» abría el diálogo de impresión.
 * Nadie lo notó porque nada comprobaba QUÉ archivo salía — sólo que salía uno.
 *
 * Estas pruebas miran los bytes: que el xlsx sea un zip OOXML de verdad, que el
 * pdf empiece por `%PDF`, y que el csv lleve su BOM y entrecomille según
 * RFC-4180. Si alguien vuelve a poner un CSV detrás del botón de Excel, esto
 * falla.
 *
 * Corre en el entorno `node` de vitest (el proyecto no tiene jsdom), así que se
 * apuntala lo mínimo del DOM que `downloadBlob` toca. Es a propósito: lo que se
 * quiere comprobar es el CONTENIDO del archivo, no que el navegador sepa pulsar
 * un enlace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCsv, csvCell, exportMatrix, fileSafe } from './reportExport';

const COLUMNAS = ['Fecha', 'Vigilante', 'Horas', 'Detalle'];
const FILAS = [
  ['2026-09-09', 'José Ñuñez', '8.50', 'Todo en orden'],
  ['2026-09-10', 'Ana Pérez', '7', 'Con "comillas", coma y\nsalto'],
];

/** Lo que `downloadBlob` intentó bajar en la última llamada. */
let bajado: { nombre: string; blob: Blob } | null = null;

beforeEach(() => {
  bajado = null;
  const enlace = {
    href: '', download: '', style: {} as Record<string, string>,
    click: vi.fn(), remove: vi.fn(),
  };
  vi.stubGlobal('document', {
    createElement: () => enlace,
    body: { appendChild: (a: typeof enlace) => { bajado = { nombre: a.download, blob: ultimoBlob! }; } },
    documentElement: {},
  });
  // `getComputedStyle` sin tokens: se ejercita la rama de colores de reserva,
  // que es justo la que corre cuando el PDF se genera fuera de una pantalla del
  // CRM (o en un navegador que no sabe leer `oklch`).
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));

  ultimoBlob = null;
  vi.stubGlobal('URL', {
    createObjectURL: (b: Blob) => { ultimoBlob = b; return 'blob:prueba'; },
    revokeObjectURL: () => {},
  });
});

afterEach(() => vi.unstubAllGlobals());

let ultimoBlob: Blob | null = null;

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const inicio = (u: Uint8Array, n: number) => Array.from(u.slice(0, n));

describe('csvCell', () => {
  it('entrecomilla sólo cuando hace falta', () => {
    expect(csvCell('simple')).toBe('simple');
    expect(csvCell('con,coma')).toBe('"con,coma"');
    expect(csvCell('con"comilla')).toBe('"con""comilla"');
    expect(csvCell('con\nsalto')).toBe('"con\nsalto"');
    // Nulo y cero NO son lo mismo: un 0 que se exporta como celda vacía cambia
    // una suma. Pasó con «Horas extra».
    expect(csvCell(null)).toBe('');
    expect(csvCell(0)).toBe('0');
  });
});

describe('fileSafe', () => {
  it('quita acentos, barras y espacios', () => {
    expect(fileSafe('Bitácora de Accesos — 2026/09')).toBe('bitacora-de-accesos-2026-09');
    // Nunca devuelve cadena vacía: un `a.download = ""` baja un archivo sin nombre.
    expect(fileSafe('///')).toBe('informe');
    expect(fileSafe('')).toBe('informe');
  });
});

describe('buildCsv', () => {
  it('lleva BOM UTF-8 y termina las líneas en CRLF', async () => {
    const u = await bytes(buildCsv(COLUMNAS, FILAS));
    // EF BB BF — sin esto Excel abre los acentos rotos.
    expect(inicio(u, 3)).toEqual([0xef, 0xbb, 0xbf]);
    const texto = new TextDecoder().decode(u);
    expect(texto).toContain('Fecha,Vigilante,Horas,Detalle\r\n');
    expect(texto).toContain('José Ñuñez');
    expect(texto).toContain('"Con ""comillas"", coma y\nsalto"');
  });
});

describe('exportMatrix', () => {
  it('csv → un .csv con BOM', async () => {
    await exportMatrix('csv', COLUMNAS, FILAS, { title: 'Informe', fileBase: 'Informe de Prueba' });
    expect(bajado!.nombre).toBe('informe-de-prueba.csv');
    expect(inicio(await bytes(bajado!.blob), 3)).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('excel → un .xlsx que es un zip OOXML, no un csv renombrado', async () => {
    await exportMatrix('excel', COLUMNAS, FILAS, {
      title: 'Informe', subtitle: 'Del 1 al 30', fileBase: 'informe',
    });
    expect(bajado!.nombre).toBe('informe.xlsx');
    const u = await bytes(bajado!.blob);
    // 'P','K',3,4 — la firma de un zip. Era LO que fallaba antes.
    expect(inicio(u, 4)).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // Y dentro tiene la pieza que hace que Excel lo abra como libro.
    expect(new TextDecoder().decode(u)).toContain('xl/workbook.xml');
  });

  /**
   * Vigila los ajustes que SheetJS acepta en silencio y luego NO escribe.
   *
   * Pasó con el panel congelado: `ws['!freeze']` no da error, no aparece en el
   * archivo, y el comentario del código seguía prometiéndolo. Y a punto estuvo
   * de pasar con el autofiltro, que sí funciona y se había perdido en una
   * edición. La única forma de saberlo es mirar el XML de dentro del zip.
   */
  it('el xlsx lleva de verdad el autofiltro y el título fusionado', async () => {
    await exportMatrix('excel', COLUMNAS, FILAS, {
      title: 'Informe', subtitle: 'Del 1 al 30', fileBase: 'informe',
    });
    const zip = new TextDecoder('latin1').decode(await bytes(bajado!.blob));
    // El XML de la hoja va sin comprimir dentro del zip (SheetJS lo guarda
    // «stored»), así que se puede buscar tal cual.
    expect(zip).toContain('<autoFilter ref="A4:D6"/>');
    expect(zip).toContain('<mergeCell ref="A1:D1"/>');
    expect(zip).toContain('<mergeCell ref="A2:D2"/>');
  });

  it('pdf → un .pdf de verdad', async () => {
    await exportMatrix('pdf', COLUMNAS, FILAS, {
      title: 'Informe', subtitle: 'Del 1 al 30', fileBase: 'informe',
    });
    expect(bajado!.nombre).toBe('informe.pdf');
    const u = await bytes(bajado!.blob);
    expect(new TextDecoder('latin1').decode(u.slice(0, 5))).toBe('%PDF-');
    expect(u.length).toBeGreaterThan(500);
  });

  it('sin filas sigue produciendo los tres archivos', async () => {
    for (const f of ['csv', 'excel', 'pdf'] as const) {
      await exportMatrix(f, COLUMNAS, [], { title: 'Vacío', fileBase: 'vacio' });
      expect((await bytes(bajado!.blob)).length).toBeGreaterThan(0);
    }
  });
});
