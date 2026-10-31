/**
 * Pages whose rules apply to the WHOLE company (geofence, attendance rules and
 * period close, payroll settings and concepts, Gusto, holidays, policies…).
 * A branch manager may read them; only headquarters changes them — the server
 * refuses the save (`rutaVedadaAlGerente` → `gerente_empresa`). Same list, in
 * routes, as `REGLAS_DE_EMPRESA` on the server.
 */
export const RUTAS_DE_REGLAS_DE_EMPRESA: RegExp[] = [
  /^\/nomina\/settings\/?$/,
  /^\/nomina\/roles\/configuracion\/?$/,
  /^\/setting\/(mobile-hub|supervisor-app|politicas|integraciones|publishing-sites|central|keep-safe|seguridad|emergencias|rondas|patrullaje|jornada|marca|festivos|retencion|comunicaciones|report-configuration)(\/|$)/,
];

export function esRutaDeReglaDeEmpresa(ruta: string): boolean {
  return RUTAS_DE_REGLAS_DE_EMPRESA.some((r) => r.test(ruta));
}
