import { describe, expect, it } from "vitest";

import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import it_ from "./it.json";
import nl from "./nl.json";
import pl from "./pl.json";
import pt from "./pt.json";

/** Every catalog the CRM ships. `es` is the source of truth for placeholders. */
const LOCALES: Record<string, unknown> = { es, en, pt, fr, de, it: it_, nl, pl };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EN EL ANFITRIÓN DE UN SOCIO NO SE ESCRIBE NUESTRO NOMBRE
 *
 * El CRM se sirve también desde `<socio>.cguardpro.com` con la marca del socio:
 * su logotipo, sus colores, su nombre. Pero treinta cadenas del catálogo
 * llevaban «CGuardPro» ESCRITO A MANO —el buscador, la bienvenida del alta, los
 * ajustes, el aviso de acceso de soporte—, así que el cliente de un socio veía
 * la marca de su proveedor dentro de un producto que se le vende como propio.
 *
 * Ahora esas cadenas llevan `{{marca}}` y cada pantalla le pasa el nombre del
 * anfitrión (`useWhiteLabel().platformName`, o `nombreDelProducto()` donde no
 * hay React). En el anfitrión de la plataforma sale «C-Guard Pro» y no cambia
 * nada; en el de un socio, el suyo.
 *
 * ── LA ÚNICA EXCEPCIÓN ─────────────────────────────────────────────────────
 * `landing.copyright` es nuestro pie, y `AuthShell`/`Boveda` sólo lo pintan en
 * NUESTROS anfitriones; en el de un socio ponen el suyo. Los `*_title` ya no
 * llevan sufijo «| Cguard» (2026-10-30): `tituloConMarca` le pega el nombre del
 * anfitrión, y un catálogo sin nuestro nombre no puede filtrarlo por ningún
 * otro camino.
 *
 * ── TAMPOCO EL NOMBRE DE NUESTRA APP ───────────────────────────────────────
 * «Mi Seguridad» es nuestra app del cliente. Las cadenas que hablan de ella
 * llevan `{{app}}` y la pantalla pasa `useAppDelCliente()`: «Mi Seguridad» en
 * nuestros anfitriones, el nombre del socio en el suyo.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Claves donde nombrarnos es correcto, con el motivo al lado. */
const PERMITIDAS = new Map<string, string>([
  ["auth.landing.copyright", "our footer, painted only on our own hosts"],
  ["sidebar.auth.landing.copyright", "duplicate of the catalog"],
  ["ui.registration.tuCuentaConEstaListaDescarga", "rendered only when `puedeUsarArteDePlataforma`"],
]);

/**
 * Our brand and our customer app's name, in each language it was ever
 * translated into ("My Security Company" is a sample company name, not ours).
 */
const MARCA =
  /C-?GUARD|cguardpro|Mi Seguridad|Minha Seguran|My Security(?! Company)|Ma S[ée]curit[ée]|Meine Sicherheit\b|La Mia Sicurezza|Mijn Beveiliging\b|Moje Bezpiecze/i;

function cadenasConMarca(objeto: unknown, ruta = ""): string[] {
  if (typeof objeto === "string") {
    return MARCA.test(objeto) ? [ruta] : [];
  }
  if (objeto && typeof objeto === "object") {
    return Object.entries(objeto as Record<string, unknown>).flatMap(([k, v]) =>
      cadenasConMarca(v, ruta ? `${ruta}.${k}` : k),
    );
  }
  return [];
}

/**
 * The identity slots: the product name (`{{marca}}`), the assistant's name
 * (`{{agente}}`, which a partner can rename) and the customer app's name
 * (`{{app}}`, see `lib/appDelCliente`).
 */
const HUECOS = ["{{marca}}", "{{agente}}", "{{app}}"] as const;

/** Dotted paths of every string that contains `hueco`. */
function rutasConHueco(objeto: unknown, hueco: string, ruta = ""): string[] {
  if (typeof objeto === "string") return objeto.includes(hueco) ? [ruta] : [];
  if (objeto && typeof objeto === "object") {
    return Object.entries(objeto as Record<string, unknown>).flatMap(([k, v]) =>
      rutasConHueco(v, hueco, ruta ? `${ruta}.${k}` : k),
    );
  }
  return [];
}

function valorEn(objeto: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<any>((o, k) => (o == null ? undefined : o[k]), objeto);
}

describe.each(Object.entries(LOCALES))("la marca no se escribe a mano en los textos (%s)", (_idioma, catalogo) => {
  it("ninguna cadena nueva nombra a CGuardPro", () => {
    const culpables = cadenasConMarca(catalogo).filter((k) => !PERMITIDAS.has(k));

    expect(
      culpables,
      "Estas cadenas enseñarían nuestra marca en el anfitrión de un socio.\n"
        + "Usa {{marca}} y pásale `platformName` desde `useWhiteLabel()`.",
    ).toEqual([]);
  });

  it("y las permitidas siguen existiendo: una exención muerta engaña", () => {
    const presentes = new Set(cadenasConMarca(catalogo));
    const huerfanas = [...PERMITIDAS.keys()].filter((k) => !presentes.has(k));

    expect(huerfanas, "exenciones que ya no hacen falta").toEqual([]);
  });

  it.each(HUECOS)("pide %s en las mismas cadenas que es.json", (hueco) => {
    const sinHueco = rutasConHueco(es, hueco).filter((ruta) => {
      const v = valorEn(catalogo, ruta);
      return typeof v !== "string" || !v.includes(hueco);
    });

    expect(sinHueco, `cadenas donde es.json usa ${hueco} y este idioma no`).toEqual([]);
  });

  it("no escribe el nombre del asistente a mano", () => {
    // A partner can rename the assistant: the catalog must always ask for it.
    expect(rutasConHueco(catalogo, "VigIA"), "usa {{agente}}").toEqual([]);
  });

  it("las cadenas migradas piden el nombre por el hueco", () => {
    // Una muestra de cada superficie: acceso, cabecera, ajustes y alta.
    const conHueco = [
      (es as any).auth.landing.logo_alt,
      (es as any).header.searchPlaceholder,
      (es as any).settings.appearance.pageSubtitle,
      (es as any).ui.OnboardingWizard.teDamosLaBienvenidaA,
      (es as any).security.event.providerAccess,
    ];
    for (const texto of conHueco) expect(texto).toContain("{{marca}}");

    const conApp = [
      (es as any).ui.ClientPortal.invitarALaAppMi,
      (es as any).ui.ClientUserAccess.appMiSeguridad,
      (es as any).settings.mobil.guardVisDesc,
      (es as any).vigiaPro.demo.partes.app.portal,
    ];
    for (const texto of conApp) expect(texto).toContain("{{app}}");
  });
});
