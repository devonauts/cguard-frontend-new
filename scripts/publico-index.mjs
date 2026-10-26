#!/usr/bin/env node
/**
 * Después del build público (`vite build -c vite.publico.config.ts`):
 *
 *  1. `dist/p/publico.html` → `dist/p/index.html`, que es lo que el backend
 *     sirve a quien no tiene la cookie del código.
 *  2. LA GUARDIA: la mini-app pública no puede llevar NADA del panel. Si un
 *     import arrastra una página de administración, su código volvería a estar
 *     a la vista de cualquiera sin iniciar sesión — así empezó todo
 *     (2026-10-25). Se falla el build en vez de publicarlo.
 *  3. El service worker de baja tiene que estar (`dist/p/sw-baja.js`).
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const P = resolve(process.argv[2] || "dist/p");
const fallar = (m) => {
  console.error(`[publico] ✗ ${m}`);
  process.exit(1);
};

if (!existsSync(P)) fallar(`no existe ${P} — ¿corrió el build público?`);
const origen = join(P, "publico.html");
const index = join(P, "index.html");

if (existsSync(origen)) renameSync(origen, index);
if (!existsSync(index)) fallar("falta dist/p/index.html");
if (!existsSync(join(P, "sw-baja.js"))) fallar("falta dist/p/sw-baja.js (service worker de baja)");

const html = readFileSync(index, "utf8");

// El HTML público sólo carga código de /p/: nada del CRM de verdad.
const delCrm = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map((m) => m[1]);

if (delCrm.length) fallar(`el HTML público carga código del CRM: ${delCrm.join(", ")}`);

/* Páginas que SÓLO existen dentro del panel. Si un trozo con su nombre aparece
   en dist/p, algo del panel se coló en la parte pública. */
const DEL_PANEL = [
  "ControlCenter", "DashboardPage", "StationCardsGrid", "StationsPage", "ClientsPage",
  "Payroll", "Nomina", "RolesDePago", "Facturas", "Cotizaciones", "Schedule", "Planificador",
  "Superadmin", "Settings", "Reports", "Incidents", "RadioDispatch", "OperationsMap",
  "PostSiteDetailsPage", "GuardsPage", "SecurityGuards", "Sucursales", "TiendaDeModulos",
];

const recorrer = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);

    return statSync(f).isDirectory() ? recorrer(f) : [f];
  });
const ficheros = recorrer(P);
const colados = ficheros
  .map((f) => f.slice(P.length + 1))
  .filter((n) => /\.js$/.test(n) && DEL_PANEL.some((x) => n.includes(`/${x}`) || n.startsWith(x)));

if (colados.length) fallar(`la parte pública lleva código del panel: ${colados.slice(0, 10).join(", ")}`);

const bytes = ficheros.reduce((s, f) => s + statSync(f).size, 0);

console.log(`[publico] ✓ dist/p: ${ficheros.length} ficheros, ${(bytes / 1048576).toFixed(1)} MB, sin páginas del panel`);
