import { describe, expect, it } from "vitest";

import es from "./es.json";

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
 * ── LAS TRES EXCEPCIONES, UNA A UNA ───────────────────────────────────────
 * Los `*_title` pasan por `tituloConMarca`, que se queda con lo de ANTES del
 * «|» y le pega el nombre del anfitrión: el sufijo del catálogo no se enseña
 * nunca. Y `landing.copyright` es la atribución, que sólo se pinta cuando el
 * socio la tiene ACTIVADA — con ella apagada, `AuthShell` pone su nombre.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Claves donde nombrarnos es correcto, con el motivo al lado. */
const PERMITIDAS = new Map<string, string>([
  ["auth.login_title", "sufijo que `tituloConMarca` descarta"],
  ["auth.register_title", "sufijo que `tituloConMarca` descarta"],
  ["auth.reset_title", "sufijo que `tituloConMarca` descarta"],
  ["invite.staff.doc_title", "sufijo que `tituloConMarca` descarta"],
  ["auth.landing.copyright", "la atribución, sólo con `showPlatformAttribution`"],
  ["sidebar.auth.login_title", "duplicado del catálogo"],
  ["sidebar.auth.register_title", "duplicado del catálogo"],
  ["sidebar.auth.reset_title", "duplicado del catálogo"],
  ["sidebar.auth.landing.copyright", "duplicado del catálogo"],
]);

const MARCA = /CGUARD|CGuard|C-Guard|cguardpro/i;

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

describe("la marca no se escribe a mano en los textos", () => {
  it("ninguna cadena nueva nombra a CGuardPro", () => {
    const culpables = cadenasConMarca(es).filter((k) => !PERMITIDAS.has(k));

    expect(
      culpables,
      "Estas cadenas enseñarían nuestra marca en el anfitrión de un socio.\n"
        + "Usa {{marca}} y pásale `platformName` desde `useWhiteLabel()`.",
    ).toEqual([]);
  });

  it("y las permitidas siguen existiendo: una exención muerta engaña", () => {
    const presentes = new Set(cadenasConMarca(es));
    const huerfanas = [...PERMITIDAS.keys()].filter((k) => !presentes.has(k));

    expect(huerfanas, "exenciones que ya no hacen falta").toEqual([]);
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
  });
});
