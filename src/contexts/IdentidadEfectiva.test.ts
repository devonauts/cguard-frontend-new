import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compatibilidad } from "./compatibilidadDeAnfitrion";
import { MARCA_DE_PLATAFORMA } from "./WhiteLabelContext";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ETAPA E.1 · EL CABLEADO, NO SÓLO LA REGLA
 *
 * `compatibilidadDeAnfitrion` ya se prueba sola. Lo que se fija aquí es lo que
 * de verdad podía fallar: que la decisión llegue hasta la pantalla.
 *
 * El hueco que cerró este cambio era exactamente ése — la política estaba
 * escrita, probada y desplegada, y NADIE la consumía, así que una empresa
 * directa entrando por el anfitrión de un socio seguía viendo la marca del
 * socio. Una regla que nadie llama es documentación, no comportamiento.
 *
 * El proyecto no monta DOM en las pruebas, así que la integración se comprueba
 * por dos vías: la máquina de estados como función pura, y la FUENTE del
 * proveedor para lo que sólo se puede afirmar estructuralmente (que no se
 * duplica la regla, que existe el estado neutro, que se repinta al cambiar).
 * ════════════════════════════════════════════════════════════════════════════
 */

const FUENTE = fs.readFileSync(
  path.resolve(__dirname, "./IdentidadEfectiva.tsx"), "utf8",
);
const WL = fs.readFileSync(
  path.resolve(__dirname, "./WhiteLabelContext.tsx"), "utf8",
);

const ANF_A = { resellerPublicId: "RSL-AAAA" };
const ANF_B = { resellerPublicId: "RSL-BBBB" };
const PLATAFORMA = { resellerPublicId: null };

const directa = { billingOwnership: "direct", resellerPublicId: null };
const deA = { billingOwnership: "reseller", resellerPublicId: "RSL-AAAA" };
const deB = { billingOwnership: "reseller", resellerPublicId: "RSL-BBBB" };

/** La misma decisión que toma el proveedor, aislada para poder recorrerla. */
function identidadEfectiva(opts: {
  anfitrion: { resellerPublicId: string | null };
  haySesion: boolean;
  cargando: boolean;
  empresa: any;
}): "plataforma" | "socio" | "neutro" {
  const anfitrionEsDeSocio = !!opts.anfitrion.resellerPublicId;

  if (!anfitrionEsDeSocio) return "plataforma";
  if (!opts.haySesion) return "socio";
  if (opts.cargando) return "neutro";

  return compatibilidad(opts.empresa, opts.anfitrion).identidad;
}

describe("Etapa E.1 · identidad efectiva del turno autenticado", () => {
  it("empresa DIRECTA en el anfitrión de plataforma → plataforma", () => {
    expect(identidadEfectiva({
      anfitrion: PLATAFORMA, haySesion: true, cargando: false, empresa: directa,
    })).toBe("plataforma");
  });

  it("LA QUE CERRÓ EL HUECO · empresa DIRECTA en el anfitrión de un socio → plataforma", () => {
    expect(identidadEfectiva({
      anfitrion: ANF_A, haySesion: true, cargando: false, empresa: directa,
    })).toBe("plataforma");
  });

  it("empresa del socio A en SU anfitrión → la marca de A", () => {
    expect(identidadEfectiva({
      anfitrion: ANF_A, haySesion: true, cargando: false, empresa: deA,
    })).toBe("socio");
  });

  it("empresa del socio A en el anfitrión de plataforma → plataforma, y se entra igual", () => {
    expect(identidadEfectiva({
      anfitrion: PLATAFORMA, haySesion: true, cargando: false, empresa: deA,
    })).toBe("plataforma");
  });

  it("LA QUE MÁS IMPORTA · empresa de A en el anfitrión de B → plataforma, nunca la de B", () => {
    expect(identidadEfectiva({
      anfitrion: ANF_B, haySesion: true, cargando: false, empresa: deA,
    })).toBe("plataforma");
    expect(identidadEfectiva({
      anfitrion: ANF_A, haySesion: true, cargando: false, empresa: deB,
    })).toBe("plataforma");
  });

  it("sin `resellerPublicId` comprobable → cierra en falso, a plataforma", () => {
    expect(identidadEfectiva({
      anfitrion: ANF_A, haySesion: true, cargando: false,
      empresa: { billingOwnership: "reseller", resellerPublicId: null },
    })).toBe("plataforma");
  });

  it("SIN sesión en el anfitrión de un socio → su marca (es su puerta de entrada)", () => {
    expect(identidadEfectiva({
      anfitrion: ANF_A, haySesion: false, cargando: false, empresa: null,
    })).toBe("socio");
  });
});

describe("Etapa E.1 · el parpadeo", () => {
  it("con sesión a medio cargar en anfitrión de socio → NEUTRO, nunca la marca del socio", () => {
    /* Enseñarla y quitarla después es la fuga con forma de parpadeo: al cliente
       de una empresa directa le habríamos enseñado quién es un distribuidor. */
    expect(identidadEfectiva({
      anfitrion: ANF_A, haySesion: true, cargando: true, empresa: null,
    })).toBe("neutro");
  });

  it("y tampoco plataforma, que parpadearía hasta la del socio en el caso bueno", () => {
    const enCarga = identidadEfectiva({
      anfitrion: ANF_A, haySesion: true, cargando: true, empresa: deA,
    });
    expect(enCarga).not.toBe("plataforma");
    expect(enCarga).toBe("neutro");
  });

  it("un anfitrión de PLATAFORMA no hace esperar a nadie", () => {
    /* No hay dos respuestas posibles, así que las 33 empresas directas no pagan
       una espera cuyo resultado ya se conoce. */
    expect(identidadEfectiva({
      anfitrion: PLATAFORMA, haySesion: true, cargando: true, empresa: null,
    })).toBe("plataforma");
  });

  it("el proveedor pinta el esqueleto neutro mientras no sabe", () => {
    expect(FUENTE).toMatch(/if \(!efectiva\) return <EsqueletoNeutro \/>;/);
  });
});

describe("Etapa E.1 · al cambiar de identidad no queda nada del socio", () => {
  it("se repinta el documento cada vez que cambia la identidad", () => {
    expect(FUENTE).toMatch(/useEffect\(\(\) => \{\s*if \(efectiva\) aplicarMarca\(efectiva\);/);
  });

  it("el TÍTULO se repone: sin nombre se borra la marca del <html>", () => {
    expect(WL).toMatch(/delete document\.documentElement\.dataset\.nombreDeMarca/);
  });

  it("el TONO y el CROMA se quitan, no se dejan pegados", () => {
    expect(WL).toMatch(/removeProperty\("--brand-h"\)/);
    expect(WL).toMatch(/removeProperty\("--brand-c"\)/);
  });

  it("y se retira la marca de anfitrión, para que el acento de fábrica vuelva", () => {
    expect(WL).toMatch(/delete document\.documentElement\.dataset\.marcaDeAnfitrion/);
  });

  it("el FAVICON se repone al de plataforma cuando la identidad vuelve a ser nuestra", () => {
    /* `aplicarMarca` recibe la marca de plataforma entera, y su favicon es el
       de plataforma: reponerlo es la misma rama que ponerlo. */
    expect(WL).toMatch(/const respaldo = puedeUsarArteDePlataforma\(ctx\)/);
    expect(MARCA_DE_PLATAFORMA.faviconUrl).toBeNull();
    expect(MARCA_DE_PLATAFORMA.platformName).toBe("CGuard Pro");
  });

  it("la marca de plataforma no arrastra NADA de un socio", () => {
    expect(MARCA_DE_PLATAFORMA.logoUrl).toBeNull();
    expect(MARCA_DE_PLATAFORMA.brandHue).toBeNull();
    expect(MARCA_DE_PLATAFORMA.brandChroma).toBeNull();
    expect(MARCA_DE_PLATAFORMA.resellerPublicId).toBeNull();
    expect(MARCA_DE_PLATAFORMA.loginTagline).toBeNull();
    expect(MARCA_DE_PLATAFORMA.support).toEqual({ email: null, url: null, phone: null });
    expect(MARCA_DE_PLATAFORMA.showPlatformAttribution).toBe(true);
  });
});

describe("Etapa E.1 · autoridad y disciplina del cableado", () => {
  it("la regla NO se reescribe en el proveedor: se llama a la de siempre", () => {
    expect(FUENTE).toMatch(/import \{ compatibilidad \}/);
    /* Si alguien volviera a comparar identificadores aquí, habría dos reglas
       que divergen en silencio. */
    expect(FUENTE).not.toMatch(/resellerPublicId\s*===\s*.*resellerPublicId/);
  });

  it("se vuelve a proveer el MISMO contexto: no hay un segundo hook que olvidar", () => {
    expect(FUENTE).toMatch(/ContextoDeMarcaReact\.Provider/);
  });

  it("el `tenantId` del navegador sólo ELIGE entre membresías del servidor", () => {
    /* Es la única entrada que el cliente controla. No aporta el
       `resellerPublicId`: ése sale del perfil, y como mucho se selecciona otra
       empresa que ya es suya. */
    expect(FUENTE).toMatch(/ts\.find\(\(x: any\) => \(x\?\.tenantId \|\| x\?\.tenant\?\.id\) === tenantId\)/);
    expect(FUENTE).toMatch(/resellerPublicId: t\.resellerPublicId \?\? null/);
  });

  it("NINGUNA rama niega el acceso — el anfitrión elige rótulo, no credencial", () => {
    for (const prohibido of ["signOut", "navigate(", "redirect", "403", "throw new"]) {
      expect(FUENTE).not.toContain(prohibido);
    }
  });

  it("no lee identidad de sitios que el navegador pueda falsificar", () => {
    for (const prohibido of [
      "location.search", "URLSearchParams", "document.cookie",
      "x-reseller", "resellerId=",
    ]) {
      expect(FUENTE.toLowerCase()).not.toContain(prohibido.toLowerCase());
    }
    /* De `localStorage` sólo sale el token (¿hay sesión?) y la empresa activa
       (¿cuál de las suyas?). Nunca la identidad del socio. */
    expect(FUENTE).toMatch(/localStorage\.getItem\("authToken"\)/);
    expect(FUENTE).not.toMatch(/localStorage[\s\S]{0,40}resellerPublicId/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ETAPA E.1 · LAS FRASES DE LA PUERTA DE ENTRADA
 *
 * El subtítulo del acceso decía «…la plataforma de gestión de seguridad física
 * C-GUARD» en el anfitrión de un socio: le nombraba al cliente de un socio a su
 * proveedor, en la primera pantalla que ve.
 *
 * La frase ya traía un hueco `{{product}}` en los OCHO idiomas, con la
 * estructura de cada lengua intacta. Lo que estaba mal era el relleno, escrito
 * a mano. Se arregla el relleno; no se tocan las traducciones.
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("Etapa E.1 · el subtítulo y la atribución del acceso", () => {
  const SHELL = fs.readFileSync(
    path.resolve(__dirname, "../pages/auth/AuthShell.tsx"), "utf8",
  );
  const IDIOMAS = ["en", "es", "de", "fr", "it", "nl", "pl", "pt"];

  it("los ocho idiomas conservan su frase, con el hueco del producto", () => {
    for (const l of IDIOMAS) {
      const d = JSON.parse(fs.readFileSync(
        path.resolve(__dirname, `../locales/${l}.json`), "utf8",
      ));
      const frase = d?.auth?.landing?.desc;

      expect(frase, `${l} perdió la frase`).toBeTruthy();
      expect(frase, `${l} perdió el hueco {{product}}`).toContain("{{product}}");
      /* Y NO se ha sustituido por inglés: cada idioma sigue siendo el suyo. */
      expect(frase).not.toBe(d?.auth?.landing?.desc?.toUpperCase());
    }
  });

  it("ninguna de las ocho lleva ya el nombre del producto incrustado en esa frase", () => {
    for (const l of IDIOMAS) {
      const d = JSON.parse(fs.readFileSync(
        path.resolve(__dirname, `../locales/${l}.json`), "utf8",
      ));
      expect(d.auth.landing.desc.toUpperCase()).not.toContain("C-GUARD");
      expect(d.auth.landing.desc.toUpperCase()).not.toContain("CGUARD");
    }
  });

  it("LA QUE IMPORTA · el relleno ya no es «C-GUARD» a mano", () => {
    expect(SHELL).not.toMatch(/product:\s*"C-GUARD"/);
    expect(SHELL).toMatch(/product: nombreDeMarca/);
  });

  it("sin nombre de marca no se pinta la frase, en vez de poner el nuestro", () => {
    expect(SHELL).toMatch(/nombreDeMarca\s*\?\s*t\("auth\.landing\.desc"/);
  });

  it("la atribución del pie la gobierna `showPlatformAttribution`", () => {
    /* Con atribución puesta se deja tal cual: el socio la acepta y quitarla
       sería cambiarle su configuración. Sin ella, el pie es suyo. */
    // Platform: its own line. Partner WITH attribution: "© year Partner · authorized
    // reseller of CGuard Pro". Partner WITHOUT it: only the partner's name.
    expect(SHELL).toMatch(/\? t\("auth\.landing\.copyright"/);
    expect(SHELL).toMatch(/showPlatformAttribution && nombreDeMarca/);
    expect(SHELL).toMatch(/t\("auth\.landing\.copyright_partner"/);
  });

  it("la marca se lee del contexto ya resuelto, no se recalcula", () => {
    expect(SHELL).toMatch(/useWhiteLabel\(\)/);
    expect(SHELL).not.toMatch(/compatibilidad\(/);
  });
});


describe("2026-10-22 · la empresa PROPIA de un socio lleva su marca en su anfitrión", () => {
  const ENTEC = { resellerPublicId: "RSL-F6LK" };
  const casa = { billingOwnership: "direct", resellerPublicId: null, brandResellerPublicId: "RSL-F6LK" };

  it("LA QUE IMPORTA · directa pero ligada a ENTEC, en el anfitrión de ENTEC → ENTEC", () => {
    expect(compatibilidad(casa, ENTEC).identidad).toBe("socio");
  });

  it("en el anfitrión de OTRO socio sigue cerrando en falso", () => {
    expect(compatibilidad(casa, { resellerPublicId: "RSL-OTRO" }).identidad).toBe("plataforma");
  });

  it("en nuestro anfitrión sigue siendo plataforma", () => {
    expect(compatibilidad(casa, { resellerPublicId: null }).identidad).toBe("plataforma");
  });

  it("una directa SIN ligar sigue siendo plataforma en el anfitrión de un socio", () => {
    expect(compatibilidad({ billingOwnership: "direct" }, ENTEC).identidad).toBe("plataforma");
  });

  it("la identidad efectiva pasa el dato del servidor a la regla", () => {
    const src = fs.readFileSync(path.join(__dirname, "IdentidadEfectiva.tsx"), "utf8");
    expect(src).toMatch(/brandResellerPublicId: t\.brandResellerPublicId \?\? null/);
  });
});
