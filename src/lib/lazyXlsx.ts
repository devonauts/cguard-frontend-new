/**
 * Carga de `xlsx` bajo demanda, una sola vez por sesión.
 *
 * La librería son 413 kB sin comprimir. Importada de forma estática, entra en el
 * chunk de la página aunque el usuario no exporte nunca nada: abrir Visitas o
 * Vigilantes se la descargaba entera para pintar una tabla.
 *
 * El patrón ya estaba aplicado en `PostSiteImportDialog.tsx` (`await
 * import('xlsx')`); esto lo centraliza para que los cinco sitios que quedaban lo
 * compartan y el módulo no se resuelva más de una vez.
 *
 * Uso, dentro del manejador del botón:
 *
 *     const XLSX = await loadXlsx();
 *     const ws = XLSX.utils.json_to_sheet(filas);
 */
let cached: typeof import('xlsx') | null = null;
let pending: Promise<typeof import('xlsx')> | null = null;

export async function loadXlsx(): Promise<typeof import('xlsx')> {
  if (cached) return cached;
  // Se comparte la promesa en vuelo: dos clics seguidos en Exportar no deben
  // lanzar dos descargas del mismo módulo.
  if (!pending) {
    pending = import('xlsx').then((mod) => {
      cached = mod;
      pending = null;
      return mod;
    }).catch((e) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}
