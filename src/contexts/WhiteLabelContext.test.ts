import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MARCA_DE_PLATAFORMA,
  normalizarContexto,
  pedirContexto,
} from "./WhiteLabelContext";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FASE 11 · P11-03 · LA MARCA DEL ANFITRIÓN EN EL CRM
 *
 * Dos cosas por encima del resto:
 *
 *   1. Que un fallo NUNCA deje la pantalla en blanco. Red caída, respuesta
 *      corrupta, 500: se pinta CGuardPro y se sigue. Quien entra a fichar tiene
 *      que poder entrar aunque el servicio de marca esté roto.
 *   2. Que no haya parpadeo. Nadie que entre por la URL de un socio puede ver el
 *      logotipo de CGuardPro ni un instante — es lo único que la marca blanca
 *      vende de verdad.
 *
 * El proyecto no tiene entorno DOM en las pruebas, así que aquí va la lógica
 * pura y la comprobación de la fuente. Montar jsdom para esta fase sería una
 * dependencia nueva y un cambio mayor que la propia fase.
 * ════════════════════════════════════════════════════════════════════════════
 */

const raiz = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

const soloCodigo = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const FUENTE = leer("src/contexts/WhiteLabelContext.tsx");
const CODIGO = soloCodigo(FUENTE);

const RESELLER = {
  scope: "reseller",
  resellerPublicId: "RSL-ALFA",
  platformName: "Sentinel Security Cloud",
  logoUrl: "/api/file/download?fileToken=abc",
  faviconUrl: "/api/file/download?fileToken=def",
  brandHue: 214,
  brandChroma: 0.14,
  loginTagline: "Operaciones bajo control.",
  support: { email: "a@b.c", url: "https://x.y", phone: "+593" },
  showPlatformAttribution: false,
};

afterEach(() => { vi.unstubAllGlobals(); });

describe("Fase 11 · 41-42 · el contexto se lee bien", () => {
  it("41 · `platform` devuelve la identidad de CGuardPro", () => {
    expect(normalizarContexto({ scope: "platform" })).toEqual(MARCA_DE_PLATAFORMA);
    expect(MARCA_DE_PLATAFORMA.platformName).toBe("CGuard Pro");
    expect(MARCA_DE_PLATAFORMA.showPlatformAttribution).toBe(true);
  });

  it("42 · `reseller` devuelve el nombre publicado y sus tonos", () => {
    const c = normalizarContexto(RESELLER);
    expect(c.scope).toBe("reseller");
    expect(c.platformName).toBe("Sentinel Security Cloud");
    expect(c.brandHue).toBe(214);
    expect(c.brandChroma).toBe(0.14);
    expect(c.loginTagline).toBe("Operaciones bajo control.");
    expect(c.support.email).toBe("a@b.c");
    expect(c.showPlatformAttribution).toBe(false);
  });
});

describe("Fase 11 · 48 · una respuesta malformada NO se pinta a medias", () => {
  it("cualquier cosa que no sea un objeto → plataforma", () => {
    for (const malo of [null, undefined, "", "texto", 42, true, []]) {
      expect(normalizarContexto(malo)).toEqual(MARCA_DE_PLATAFORMA);
    }
  });

  it("un `scope` desconocido → plataforma", () => {
    for (const s of ["Reseller", "RESELLER", "partner", "", null, 1, undefined]) {
      expect(normalizarContexto({ ...RESELLER, scope: s })).toEqual(MARCA_DE_PLATAFORMA);
    }
  });

  it("campos sueltos corruptos caen al valor de plataforma, uno a uno", () => {
    const c = normalizarContexto({
      scope: "reseller",
      platformName: "   ",
      logoUrl: 42,
      faviconUrl: {},
      brandHue: "no es un número",
      brandChroma: [],
      loginTagline: null,
      support: "tampoco es un objeto",
      showPlatformAttribution: "quizá",
    });

    expect(c.scope).toBe("reseller");
    /* ── CAMBIADO EN LA ETAPA E ────────────────────────────────────────────
       Decía «sin nombre utilizable se usa el de plataforma». Eso es una fuga:
       este socio puede tener la atribución desactivada, y entonces enseñarle
       «CGuard Pro» a su gente es exactamente lo que paga por evitar. El resto
       de la prueba —que un campo corrupto cae a un valor seguro— no cambia:
       un nombre inservible sigue sin pintarse, sólo que ahora se queda vacío
       en vez de convertirse en el nuestro. */
    expect(c.platformName).not.toBe(MARCA_DE_PLATAFORMA.platformName);
    expect(c.platformName).toBe("");
    expect(c.logoUrl).toBeNull();
    expect(c.faviconUrl).toBeNull();
    expect(c.brandHue).toBeNull();
    expect(c.brandChroma).toBeNull();
    expect(c.support).toEqual({ email: null, url: null, phone: null });
    // Sólo un `false` explícito quita la atribución.
    expect(c.showPlatformAttribution).toBe(true);
  });

  it("`brandChroma: []` NO entra como 0 — la forma se mira antes que el valor", () => {
    /* `Number([])` es 0 y `Number(true)` es 1. Sin comprobar el tipo primero,
       un array vacío de una respuesta corrupta sería un croma perfectamente
       válido y el CRM se pintaría en gris sin que nadie supiera por qué. */
    expect(normalizarContexto({ ...RESELLER, brandChroma: [] }).brandChroma).toBeNull();
    expect(normalizarContexto({ ...RESELLER, brandHue: [] }).brandHue).toBeNull();
    expect(normalizarContexto({ ...RESELLER, brandHue: true }).brandHue).toBeNull();
    expect(normalizarContexto({ ...RESELLER, brandHue: {} }).brandHue).toBeNull();
  });

  it("un tono o un croma fuera de rango se descartan", () => {
    for (const h of [-1, 361, 9999, NaN, Infinity]) {
      expect(normalizarContexto({ ...RESELLER, brandHue: h }).brandHue).toBeNull();
    }
    for (const c of [-0.1, 0.5, 1, NaN]) {
      expect(normalizarContexto({ ...RESELLER, brandChroma: c }).brandChroma).toBeNull();
    }
    // Los límites SÍ valen.
    expect(normalizarContexto({ ...RESELLER, brandHue: 0 }).brandHue).toBe(0);
    expect(normalizarContexto({ ...RESELLER, brandHue: 360 }).brandHue).toBe(360);
    expect(normalizarContexto({ ...RESELLER, brandChroma: 0.4 }).brandChroma).toBe(0.4);
  });

  it("los textos se acotan: una respuesta enorme no se pinta entera", () => {
    const c = normalizarContexto({
      ...RESELLER,
      platformName: "x".repeat(500),
      loginTagline: "y".repeat(500),
    });
    expect(c.platformName.length).toBe(60);
    expect(c.loginTagline!.length).toBe(140);
  });
});

describe("Fase 11 · 47 · un fallo de red NO rompe el arranque", () => {
  it("47 · `fetch` que revienta → plataforma, marcado como degradado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const r = await pedirContexto();
    expect(r.ctx).toEqual(MARCA_DE_PLATAFORMA);
    expect(r.degradado).toBe(true);
  });

  it("47b · un 500 → plataforma", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const r = await pedirContexto();
    expect(r.ctx).toEqual(MARCA_DE_PLATAFORMA);
    expect(r.degradado).toBe(true);
  });

  it("47c · un 429 del limitador → plataforma, no una pantalla rota", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    expect((await pedirContexto()).ctx).toEqual(MARCA_DE_PLATAFORMA);
  });

  it("48b · un cuerpo que no es JSON → plataforma", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token <")),
    }));
    const r = await pedirContexto();
    expect(r.ctx).toEqual(MARCA_DE_PLATAFORMA);
    expect(r.degradado).toBe(true);
  });

  it("nunca lanza, pase lo que pase", async () => {
    for (const f of [
      vi.fn().mockRejectedValue(new Error("x")),
      vi.fn().mockImplementation(() => { throw new Error("síncrono"); }),
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(undefined) }),
      vi.fn().mockResolvedValue(null),
    ]) {
      vi.stubGlobal("fetch", f);
      // eslint-disable-next-line no-await-in-loop
      await expect(pedirContexto()).resolves.toBeTruthy();
    }
  });

  it("una respuesta `platform` NO cuenta como degradada", () => {
    /* Distinción que importa: caer a plataforma porque este anfitrión ES de la
       plataforma es la respuesta correcta, no un fallo. Marcarlo como degradado
       haría que un aviso de «servicio de marca caído» saliera en el uso normal. */
    expect(CODIGO).toMatch(/degradado: false/);
  });

  it("la petición tiene tiempo máximo: un servicio lento no cuelga el arranque", () => {
    expect(CODIGO).toMatch(/AbortController/);
    expect(CODIGO).toMatch(/TIEMPO_MAXIMO_MS/);
    const m = /const TIEMPO_MAXIMO_MS = (\d+);/.exec(FUENTE);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThanOrEqual(5000);
  });

  it("no manda credenciales: es una ruta pública", () => {
    expect(CODIGO).toMatch(/credentials: "omit"/);
  });
});

describe("Fase 11 · 39-40 · la marca ANTES del primer pintado", () => {
  it("39 · el proveedor envuelve la aplicación en `main.tsx`", () => {
    const main = leer("src/main.tsx");
    expect(main).toMatch(/import \{ WhiteLabelProvider \}/);
    expect(main).toMatch(/<WhiteLabelProvider>[\s\S]*<App \/>[\s\S]*<\/WhiteLabelProvider>/);
  });

  it("40 · sin contexto todavía, se pinta un esqueleto NEUTRO", () => {
    expect(CODIGO).toMatch(/if \(!ctx\) return <EsqueletoNeutro \/>;/);

    /* El esqueleto no puede llevar marca de nadie: un cargador con el escudo de
       CGuardPro delataría al proveedor en el anfitrión de un socio, que es justo
       lo que toda esta fase existe para evitar. */
    const esqueleto = /function EsqueletoNeutro\(\)[\s\S]*?\n\}/.exec(FUENTE)![0];
    for (const p of [
      "c-guard", "CGuard", "C-Guard", "BrandLockup", "logo", "platformName",
    ]) {
      expect(esqueleto).not.toContain(p);
    }
    // Y se anuncia a quien no lo ve.
    expect(esqueleto).toMatch(/role="status"/);
    expect(esqueleto).toMatch(/aria-live="polite"/);
  });

  it("40b · el primer pintado del HTML tampoco lleva marca", () => {
    const html = leer("index.html");
    // Se mira el HTML SERVIDO, no los comentarios que explican por qué.
    const servido = html.replace(/<!--[\s\S]*?-->/g, " ");

    expect(servido).toMatch(/<title>Acceso<\/title>/);
    for (const p of ["CGuardPro", "C-Guard Pro", "og:site_name", "og:title", "twitter:title"]) {
      expect(servido).not.toContain(p);
    }
  });

  it("55 · el canónico sigue siendo el de la plataforma, y es deliberado", () => {
    const html = leer("index.html");
    /* La página lleva `noindex, follow`, así que ningún buscador la indexa bajo
       ninguna URL: el canónico sólo consolida la señal de marca de la PLATAFORMA
       en su propia web. Lo que sería un error es dejarlo apuntando a
       `app.cguardpro.com`, porque entonces el anfitrión de un socio reclamaría
       la identidad canónica de la plataforma. */
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/cguardpro\.com\/" \/>/);
    expect(html).toMatch(/name="robots" content="noindex, follow"/);
    expect(html).not.toMatch(/canonical[^>]*app\.cguardpro\.com/);
  });

  it("56 · el manifest de la PWA no lleva el nombre del producto", () => {
    const vite = leer("vite.config.ts");
    const manifest = /manifest: \{[\s\S]*?icons:/.exec(vite)![0];
    expect(manifest).not.toContain("C-Guard");
    expect(manifest).not.toContain("CGuard");
    expect(manifest).toMatch(/name: "Panel de seguridad"/);
    /* Un solo manifest para todos los anfitriones: el navegador lo lee antes de
       que corra nada nuestro, así que no puede ser dinámico sin servirlo por
       anfitrión — y eso es arquitectura, no una cadena distinta aquí. */
    expect(manifest).not.toMatch(/\$\{|reseller|brand/i);
  });
});

describe("Fase 11 · 49-50 · UNA sola condicional de ámbito", () => {
  it("49-50 · `scope === 'platform'`/`'reseller'` aparece UNA vez, y aquí dentro", () => {
    const dir = path.join(raiz, "src");
    const encontrados: string[] = [];

    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { recorrer(p); continue; }
        if (!/\.(tsx?|jsx?)$/.test(e.name)) continue;
        if (e.name.endsWith(".test.ts") || e.name.endsWith(".test.tsx")) continue;
        const src = soloCodigo(fs.readFileSync(p, "utf8"));
        if (/scope\s*[=!]==\s*["'](platform|reseller)["']/.test(src)) {
          encontrados.push(path.relative(raiz, p));
        }
      }
    };
    recorrer(dir);

    expect(encontrados).toEqual(["src/contexts/WhiteLabelContext.tsx"]);
  });

  it("50b · ningún componente ramifica por «es un socio»", () => {
    const dir = path.join(raiz, "src");
    const sospechosos: string[] = [];
    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { recorrer(p); continue; }
        if (!/\.tsx$/.test(e.name)) continue;
        if (p.includes("WhiteLabelContext")) continue;
        const src = soloCodigo(fs.readFileSync(p, "utf8"));
        /* Con límites de palabra: `isPlatformSuperadmin` existe desde antes y
           es otra cosa —privilegio de plataforma, no ámbito de marca—. Marcarlo
           en rojo denunciaría código correcto y ajeno a esta fase. */
        if (/\b(esSocio|isReseller|esPlataforma)\b|\bisPlatform\b(?!Superadmin)/.test(src)) {
          sospechosos.push(path.relative(raiz, p));
        }
      }
    };
    recorrer(dir);
    expect(sospechosos).toEqual([]);
  });
});

describe("Fase 11 · 51-54 · quién lee la marca, y quién no", () => {
  it("51 · el bloque de marca del acceso lee el proveedor", () => {
    const lockup = leer("src/components/BrandLockup.tsx");
    expect(lockup).toMatch(/useWhiteLabel\(\)/);
    /* La etapa E añade `puedeUsarArteDePlataforma`: sin él, el lockup prestaba
       el arte de CGuardPro a un socio sin logotipo. Se comprueba que lee los
       tres del proveedor, sin fijar el orden. */
    for (const campo of ["logoUrl", "platformName", "puedeUsarArteDePlataforma"]) {
      expect(lockup).toMatch(new RegExp(`const \\{[^}]*${campo}[^}]*\\} = useWhiteLabel\\(\\)`));
    }
    // Y NO pregunta por el ámbito: lee un dato ya resuelto.
    expect(soloCodigo(lockup)).not.toMatch(/scope/);
  });

  it("52 · el texto alternativo del logotipo ya no clava la marca", () => {
    const lockup = leer("src/components/BrandLockup.tsx");
    expect(lockup).not.toMatch(/defaultValue: "C-Guard Pro"/);
    expect(lockup).toMatch(/defaultValue: platformName/);
  });

  it("53 · la identidad del INQUILINO no se aplana en la del socio", () => {
    /* `AuthShell` ya pintaba el logotipo de la empresa que invita cuando lo
       hay, y esa precedencia no cambia: quien recibe una invitación tiene que
       reconocer a la empresa que le contrata, no a su proveedor de software.
       El bloque de plataforma —ahora de socio— es sólo el ÚLTIMO recurso. */
    const shell = leer("src/pages/auth/AuthShell.tsx");
    const marca = /\{logoUrl \? \([\s\S]*?<BrandLockup/.exec(shell);
    expect(marca).toBeTruthy();
    // El orden es: logo del inquilino → iniciales del inquilino → marca del host.
    expect(marca![0].indexOf("logoUrl")).toBeLessThan(marca![0].indexOf("BrandLockup"));
  });

  it("54 · la fase 11 no tocó avisos legales ni términos", () => {
    const cambiados = [
      "src/contexts/WhiteLabelContext.tsx",
      "src/components/BrandLockup.tsx",
      "src/main.tsx",
      "index.html",
      "vite.config.ts",
    ];
    for (const rel of cambiados) {
      const src = fs.readFileSync(path.join(raiz, rel), "utf8");
      for (const p of ["Términos", "Privacidad", "copyright", "Todos los derechos"]) {
        expect(src).not.toContain(p);
      }
    }
  });

  it("la atribución de plataforma no se puede quitar con una respuesta rara", () => {
    // Sólo un `false` explícito. Cualquier otra cosa la deja puesta.
    for (const v of [undefined, null, 0, "", "false", "no", {}, []]) {
      expect(
        normalizarContexto({ ...RESELLER, showPlatformAttribution: v }).showPlatformAttribution,
      ).toBe(true);
    }
    expect(
      normalizarContexto({ ...RESELLER, showPlatformAttribution: false }).showPlatformAttribution,
    ).toBe(false);
  });
});

describe("Fase 11 · 57-59 · un solo artefacto, y sin cruzar aplicaciones", () => {
  it("57 · no hay build ni variable de entorno por socio", () => {
    const vite = leer("vite.config.ts");
    for (const p of ["VITE_RESELLER", "RESELLER_ID", "perPartner", "brandBuild"]) {
      expect(vite).not.toContain(p);
    }
    // Una sola salida.
    expect((vite.match(/outDir/g) || []).length).toBeLessThanOrEqual(1);
  });

  it("58 · el CRM NO importa nada del panel de socio", () => {
    const dir = path.join(raiz, "src");
    const cruces: string[] = [];
    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { recorrer(p); continue; }
        if (!/\.(tsx?|jsx?)$/.test(e.name)) continue;
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
          if (/reseller-panel|\.\.\/\.\.\/\.\.\/reseller/.test(m[1])) {
            cruces.push(`${path.relative(raiz, p)} → ${m[1]}`);
          }
        }
      }
    };
    recorrer(dir);
    expect(cruces).toEqual([]);
  });

  it("59 · el CRM no ha ganado ninguna ruta `/partner/*`", () => {
    /* El backoffice del socio vive en su propia aplicación desde la fase 5. La
       fase 11 blanquea el CRM por anfitrión; no devuelve el panel al CRM. */
    const dir = path.join(raiz, "src");
    const rutas: string[] = [];
    const recorrer = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { recorrer(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const src = soloCodigo(fs.readFileSync(p, "utf8"));
        if (/path=["']\/partner|path=["']\/reseller/.test(src)) {
          rutas.push(path.relative(raiz, p));
        }
      }
    };
    recorrer(dir);
    expect(rutas).toEqual([]);
  });

  it("no se añadió CSS arbitrario desde los datos de marca", () => {
    /* La regla de la fase 6 sigue siendo absoluta: nada de CSS propio, nada de
       HTML, nada de estilos en crudo. Sólo dos variables numéricas. */
    for (const p of [
      "dangerouslySetInnerHTML", "innerHTML", "<style", "insertRule",
      "customCss", "styleOverride",
    ]) {
      expect(CODIGO).not.toContain(p);
    }
    // Lo único que se escribe en el documento.
    const props = [...CODIGO.matchAll(/setProperty\("([^"]+)"/g)].map((m) => m[1]);
    expect(props.sort()).toEqual(["--brand-c", "--brand-h"]);
  });

  it("44-45 · título y favicon se aplican desde el contexto", () => {
    expect(CODIGO).toMatch(/document\.title = ctx\.platformName/);
    expect(CODIGO).toMatch(/aplicarFavicon\(favicon\)/);
  });

  it("46 · sin logotipo propio se usa el de la plataforma SÓLO si se permite", () => {
    /* ── CAMBIADO EN LA ETAPA E ────────────────────────────────────────────
       Era `logo: ctx.logoUrl || LOGO_DE_PLATAFORMA`, incondicional. Un socio
       con `showPlatformAttribution = false` al que le faltara el logotipo
       acababa enseñando el nuestro. El respaldo sigue existiendo —para la
       plataforma y para quien conserva la atribución—, pero ahora pasa por el
       permiso. Ver el bloque «el respaldo de plataforma no se le presta a un
       socio». */
    expect(CODIGO).toMatch(/logo: ctx\.logoUrl \|\| \(permitido \? LOGO_DE_PLATAFORMA : null\)/);
    expect(CODIGO).toMatch(/const permitido = puedeUsarArteDePlataforma\(ctx\)/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ETAPA E · LA MARCA DE CGUARDPRO NO ES EL RESPALDO DE UN SOCIO
 *
 * El servidor ya no manda «CGuard Pro» cuando un socio publica su marca sin
 * nombre: cae a su nombre comercial y, si no hubiera ninguno, manda cadena
 * vacía A PROPÓSITO. Pero el CRM la volvía a rellenar con la nuestra, así que
 * la corrección del servidor no llegaba a verse: un socio con la atribución
 * desactivada —que paga precisamente por que su gente no nos vea— seguía
 * enseñando «CGuard Pro» en su pantalla de acceso.
 *
 * Lo mismo con el arte: el logotipo y el favicon de plataforma eran el respaldo
 * de TODOS, así que un hueco en la configuración de un socio se convertía en
 * una fuga de nuestra identidad.
 *
 * La regla: con `showPlatformAttribution = false` no se presta ni el nombre, ni
 * el logotipo, ni el favicon. Sin arte propio se enseña el NOMBRE, que es lo
 * que un producto de marca blanca hace cuando el cliente aún no ha subido el
 * suyo — decir de quién es, no de quién no.
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("Etapa E · el respaldo de plataforma no se le presta a un socio", () => {
  const socio = (extra: Record<string, unknown> = {}) => ({
    scope: "reseller",
    resellerPublicId: "RSL-TEST",
    platformName: "Seguridad Alfa",
    logoUrl: null,
    faviconUrl: null,
    brandHue: 250,
    brandChroma: 0.09,
    loginTagline: null,
    support: {},
    showPlatformAttribution: false,
    ...extra,
  });

  it("LA QUE IMPORTA · un nombre VACÍO no se convierte en «CGuard Pro»", () => {
    for (const vacio of ["", "   ", null, undefined]) {
      const ctx = normalizarContexto(socio({ platformName: vacio }));
      expect(ctx.scope).toBe("reseller");
      expect(ctx.platformName).not.toBe(MARCA_DE_PLATAFORMA.platformName);
      expect(ctx.platformName).toBe("");
    }
  });

  it("un nombre publicado sigue mandando", () => {
    expect(normalizarContexto(socio()).platformName).toBe("Seguridad Alfa");
  });

  it("la plataforma SIGUE llamándose CGuard Pro", () => {
    // La corrección no puede haberle quitado el nombre a la plataforma.
    expect(normalizarContexto({ scope: "platform" }).platformName)
      .toBe(MARCA_DE_PLATAFORMA.platformName);
    expect(normalizarContexto(null).platformName)
      .toBe(MARCA_DE_PLATAFORMA.platformName);
  });

  it("con atribución DESACTIVADA no se puede usar nuestro arte", async () => {
    const { puedeUsarArteDePlataforma } = await import("./WhiteLabelContext");
    expect(puedeUsarArteDePlataforma(normalizarContexto(socio()))).toBe(false);
  });

  it("con atribución ACTIVADA sí, que es lo que esa bandera significa", async () => {
    const { puedeUsarArteDePlataforma } = await import("./WhiteLabelContext");
    expect(puedeUsarArteDePlataforma(
      normalizarContexto(socio({ showPlatformAttribution: true })),
    )).toBe(true);
  });

  it("y la plataforma siempre puede usar el suyo", async () => {
    const { puedeUsarArteDePlataforma } = await import("./WhiteLabelContext");
    expect(puedeUsarArteDePlataforma(MARCA_DE_PLATAFORMA)).toBe(true);
  });

  it("el logotipo del socio, cuando lo hay, se respeta en los dos casos", () => {
    for (const atrib of [true, false]) {
      const ctx = normalizarContexto(socio({
        logoUrl: "/api/file/download?fileToken=abc", showPlatformAttribution: atrib,
      }));
      expect(ctx.logoUrl).toBe("/api/file/download?fileToken=abc");
    }
  });

  it("la FUENTE ya no presta el arte de plataforma sin comprobar el permiso", () => {
    const fuente = fs.readFileSync(
      path.resolve(__dirname, "./WhiteLabelContext.tsx"), "utf8",
    );
    /* El respaldo incondicional era `ctx.logoUrl || LOGO_DE_PLATAFORMA` y
       `ctx.faviconUrl || FAVICON_DE_PLATAFORMA`. Si vuelve cualquiera de los
       dos, vuelve la fuga. */
    expect(fuente).not.toMatch(/logoUrl\s*\|\|\s*LOGO_DE_PLATAFORMA/);
    expect(fuente).not.toMatch(/faviconUrl\s*\|\|\s*FAVICON_DE_PLATAFORMA/);
    expect(fuente).toMatch(/puedeUsarArteDePlataforma/);
  });

  it("y el lockup tampoco: sin permiso pinta el NOMBRE", () => {
    const fuente = fs.readFileSync(
      path.resolve(__dirname, "../components/BrandLockup.tsx"), "utf8",
    );
    expect(fuente).toMatch(/if \(!puedeUsarArteDePlataforma\)/);
    // Y el arte de CGuardPro sigue existiendo para la plataforma.
    expect(fuente).toMatch(/c-guard-lockup-light\.png/);
  });
});
