import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * WHITE-LABEL LEAKS IN THE CRM (2026-10-22 sweep)
 *
 * One SPA serves every host. On a partner's host (portal.entecdigital.mx…)
 * its companies must not see CGuard Pro in any form: name, shield, our site,
 * our support, our assistant's name, our icon in system notifications. Each
 * block below pins one of the leaks found on origin/main so it cannot return.
 *
 * No jsdom (like the rest of the suite): pure logic, server rendering with the
 * real Spanish catalog, and source checks.
 * ════════════════════════════════════════════════════════════════════════════
 */

const raiz = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");
const soloCodigo = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

let WL: typeof import("../contexts/WhiteLabelContext");
let AG: typeof import("./agenteDeMarca");

beforeAll(async () => {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  WL = await import("../contexts/WhiteLabelContext");
  // Loaded once without `window`; each test then sets only the hostname the
  // module reads at paint time.
  AG = await import("./agenteDeMarca");
});

afterEach(() => {
  delete (globalThis as any).window;
});

/** The provider value a screen receives, for a platform or a partner host. */
function valor(
  deSocio: boolean,
  extra: Partial<import("../contexts/WhiteLabelContext").ContextoDeMarca> = {},
) {
  const base = deSocio
    ? WL.normalizarContexto({ scope: "reseller", resellerPublicId: "abc", platformName: "Entec Digital", ...extra })
    : WL.MARCA_DE_PLATAFORMA;
  const permitido = WL.puedeUsarArteDePlataforma(base);

  return {
    ...base,
    logo: base.logoUrl || (permitido ? "/assets/logo/c-guard-logo.png" : null),
    puedeUsarArteDePlataforma: permitido,
    cargando: false,
    degradado: false,
  };
}

describe("1 · the /guard header", () => {
  it("prints the host's name, never «CGuard Pro» hardcoded", () => {
    const src = soloCodigo(leer("src/layouts/GuardAppLayout.tsx"));

    expect(src).not.toMatch(/CGuard/i);
    expect(src).toContain("useWhiteLabel()");
    expect(src).toContain("{platformName ? (");
  });
});

describe("2 · «Revisa tu correo» (forgot password, sign-up)", () => {
  async function pintar(v: ReturnType<typeof valor>) {
    const { default: RevisaTuCorreo } = await import("../pages/auth/RevisaTuCorreo");

    return renderToStaticMarkup(
      <WL.ContextoDeMarcaReact.Provider value={v}>
        <RevisaTuCorreo texto="x" textoBoton="ok" titulo="t" onContinuar={() => {}} />
      </WL.ContextoDeMarcaReact.Provider>,
    );
  }

  it("our shield on our hosts", async () => {
    expect(await pintar(valor(false))).toContain("/assets/logo/escudo.png");
  });

  it("the partner's logo on its host, never our shield", async () => {
    const html = await pintar(valor(true, { logoUrl: "https://cdn.socio.mx/logo.png" }));

    expect(html).toContain("https://cdn.socio.mx/logo.png");
    expect(html).not.toContain("/assets/logo/");
  });

  it("a partner without a logo: no image at all", async () => {
    const html = await pintar(valor(true));

    expect(html).not.toContain("<img");
    expect(html).not.toContain("/assets/logo/");
  });
});

describe("3 · system notifications carry the host's icon", () => {
  it("ours on our hosts, the partner's on theirs, none without art", async () => {
    const { iconoDeAvisos } = await import("./iconoDeAvisos");

    WL.aplicarMarca(WL.MARCA_DE_PLATAFORMA);
    expect(iconoDeAvisos()).toBe("/assets/logo/c-guard-app-logo.png");

    WL.aplicarMarca(WL.normalizarContexto({ scope: "reseller", platformName: "Entec", logoUrl: "https://x/l.png" }));
    expect(iconoDeAvisos()).toBe("/api/platform/icon/192");

    WL.aplicarMarca(WL.normalizarContexto({ scope: "reseller", platformName: "Entec" }));
    expect(iconoDeAvisos()).toBeUndefined();
  });

  it("`notifyNative` reads it instead of hardcoding our logo", () => {
    const src = soloCodigo(leer("src/lib/desktop.ts"));

    expect(src).not.toContain("/assets/logo/");
    expect(src).toContain("icon: iconoDeAvisos()");
  });
});

describe("4 · privacy and terms on the sign-up form", () => {
  it("our site on our hosts", async () => {
    const { enlaceLegalDelAnfitrion } = await import("./enlacesLegales");

    expect(enlaceLegalDelAnfitrion("privacy", "es", { deSocio: false, urlDeSoporte: null }))
      .toBe("https://cguardpro.com/privacy/");
    expect(enlaceLegalDelAnfitrion("terms", "en", { deSocio: false, urlDeSoporte: "https://x.mx" }))
      .toBe("https://cguardpro.com/en/terms/");
  });

  it("a partner's host: its support URL for both, or no link", async () => {
    const { enlaceLegalDelAnfitrion } = await import("./enlacesLegales");
    const socio = (u: string | null) => ({ deSocio: true, urlDeSoporte: u });

    expect(enlaceLegalDelAnfitrion("privacy", "es", socio("https://entec.mx/ayuda"))).toBe("https://entec.mx/ayuda");
    expect(enlaceLegalDelAnfitrion("terms", "es", socio("entec.mx/ayuda"))).toBe("https://entec.mx/ayuda");
    expect(enlaceLegalDelAnfitrion("terms", "es", socio(null))).toBeNull();
    expect(enlaceLegalDelAnfitrion("terms", "es", socio("javascript:alert(1)"))).toBeNull();
  });

  it("the form uses the host-aware link and keeps the text when there is none", () => {
    const src = soloCodigo(leer("src/pages/auth/register.tsx"));

    expect(src).not.toMatch(/\benlaceLegal\(/);
    expect(src).toContain("enlaceLegalDelAnfitrion(");
    expect(src).toContain("deSocio: esMarcaDeSocio(marca)");
    expect(src).toContain("{enlacePrivacidad ? (");
    expect(src).toContain("{enlaceTerminos ? (");
    expect(src).toContain('id="acepta"');
  });
});

describe("5 · app download screens after an invitation", () => {
  it("customer: our app's logo and name only where our art may show", () => {
    const src = soloCodigo(leer("src/pages/client/registration.tsx"));

    expect(src).not.toContain('src="/assets/logo/miseguridad.png"');
    expect(src).not.toContain('alt="Mi Seguridad"');
    expect(src).toMatch(/appLogo = marca\.puedeUsarArteDePlataforma\s*\?\s*"\/assets\/logo\/miseguridad\.png"\s*:\s*marca\.logo/);
    expect(src).toMatch(/appNombre = marca\.puedeUsarArteDePlataforma\s*\?\s*"Mi Seguridad"\s*:\s*marca\.platformName/);
    expect(src).toContain('"ui.registration.cuentaListaDescargaLaApp"');
    // The store links stay (owner's decision until partners publish their own apps).
    expect(src).toContain("href={MISEGURIDAD_PLAY_URL}");
    expect(src).toContain("href={MISEGURIDAD_IOS_URL}");
  });

  it("supervisor: store links kept, no logo or brand text of ours on screen", () => {
    const src = soloCodigo(leer("src/pages/supervisor/registration.tsx"))
      // The store URLs themselves are allowed (they are ours on purpose).
      .replace(/"https:\/\/[^"]*"/g, '""');

    expect(src).not.toContain("/assets/logo/");
    expect(src).not.toMatch(/CGuard|Mi Seguridad/i);
    expect(src).toContain("href={SUPERVISOR_PLAY_URL}");
  });
});

describe("6 · the assistant's name before `/assistant/identity` answers", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("a partner's host: a neutral localized word, not ours", () => {
    /* `esAnfitrionDePlataforma` treats every host as ours when VITE_API_URL is
       unset (a relative base is same-origin). Production builds set it; a git
       worktree has no .env, so pin it here instead of depending on that file. */
    vi.stubEnv("VITE_API_URL", "https://api.mainconnector.com/api");
    (globalThis as any).window = { location: { hostname: "portal.entecdigital.mx" } };
    const { AGENTE_POR_DEFECTO, NOMBRE_GLOBAL, NOMBRE_HISPANO } = AG;

    expect(AGENTE_POR_DEFECTO.nombre).toBe("Asistente");
    expect([NOMBRE_HISPANO, NOMBRE_GLOBAL]).not.toContain(AGENTE_POR_DEFECTO.nombre);
  });

  it("our hosts keep VigIA / Vigia AI", () => {
    (globalThis as any).window = { location: { hostname: "app.cguardpro.com" } };
    const { AGENTE_POR_DEFECTO, NOMBRE_GLOBAL, NOMBRE_HISPANO } = AG;

    expect([NOMBRE_HISPANO, NOMBRE_GLOBAL]).toContain(AGENTE_POR_DEFECTO.nombre);
  });

  it("the neutral word exists in all eight catalogs", () => {
    for (const l of ["es", "en", "pt", "fr", "de", "it", "nl", "pl"]) {
      const c = JSON.parse(leer(`src/locales/${l}.json`));

      expect(typeof c.vigia?.nombreNeutro, l).toBe("string");
      expect(c.vigia.nombreNeutro).not.toMatch(/vigia/i);
    }
  });
});

describe("8 · the service worker does not precache our brand art", () => {
  it("logo, e-mail and icon images are left to the network", () => {
    const src = leer("vite.config.ts");

    for (const g of ['"assets/logo/**"', '"email/**"', '"icons/**"']) expect(src).toContain(g);
  });
});

describe("9 · trial under review: support goes to the partner, never to us", () => {
  it("our mailbox only when the host is ours", () => {
    const src = soloCodigo(leer("src/components/PruebaEnRevisionScreen.tsx"));

    expect(src).toContain("esMarcaDeSocio(marca) ? null : CORREO_DE_SOPORTE");
    expect(src).toContain("href={`mailto:${correoDeSoporte}`}");
    expect(src).not.toContain("mailto:${CORREO_DE_SOPORTE}");
  });
});

describe("10 · the customer app's name follows the host", () => {
  it("«Mi Seguridad» on our hosts, the partner's name on theirs", async () => {
    const { nombreDeLaAppDelCliente } = await import("./appDelCliente");

    expect(nombreDeLaAppDelCliente(valor(false))).toBe("Mi Seguridad");
    expect(nombreDeLaAppDelCliente(valor(true))).toBe("Entec Digital");
    expect(nombreDeLaAppDelCliente(valor(true, { platformName: "" }))).toBe("");
  });

  it("the field app's deep link is opened by a button, never shown as a link", () => {
    const src = soloCodigo(leer("src/pages/auth/reset-password.tsx"));

    expect(src).not.toMatch(/href=["{`]*cguardpro:/);
    expect(src).toContain("window.location.href = ESQUEMA_DE_LA_APP_DE_CAMPO");
  });

  it("the style guide (our design system) sends a partner's host home", () => {
    const src = soloCodigo(leer("src/pages/StyleGuide.tsx"));

    expect(src).toContain('if (esMarcaDeSocio(marca)) return <Navigate replace to="/" />;');
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 11 · NO NEW SOURCE FILE PRINTS OUR BRAND (2026-10-30)
 *
 * Owner's rule after ENTEC asked for it: «ellos no quieren que salga el nombre
 * de cguardpro en su entorno en ningún motivo». The catalogs are guarded by
 * `locales/marcaEnLosTextos.test.ts`; this guards the code: every string
 * literal and JSX text in src/ that carries our name, our domain, our logo
 * files or our customer app's name. The files below are the only ones allowed
 * to, each because its use is gated to OUR hosts (or never rendered). A new
 * file on this list needs the same kind of reason — and usually the answer is
 * `useWhiteLabel()` instead.
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("11 · our brand in the code only where it is gated to our hosts", () => {
  const MARCA_EN_CODIGO =
    /CGuard|Cguard|C-Guard|CGUARD|C-GUARD|cguardpro\.com|cguardpro:\/\/|\/assets\/logo\/|Mi Seguridad/;
  /** An i18n key (`ui.Foo.bar`) names a string; it is never printed. */
  const CLAVE_I18N = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/;

  const PERMITIDOS = new Map<string, string>([
    ["src/contexts/WhiteLabelContext.tsx", "the platform's own identity; the one file that decides the scope"],
    ["src/contexts/IdentidadEfectiva.tsx", "our logo only when `puedeUsarArteDePlataforma`"],
    ["src/components/BrandLockup.tsx", "our lockup only when `puedeUsarArteDePlataforma`"],
    ["src/components/onboarding/OnboardingWizard.tsx", "our shield only when `puedeUsarArteDePlataforma`"],
    ["src/pages/auth/CortinaDescifrado.tsx", "our art only when `puedeUsarArteDePlataforma`"],
    ["src/pages/auth/RevisaTuCorreo.tsx", "our shield only on our hosts (block 2)"],
    ["src/pages/auth/AuthShell.tsx", "our copyright only when the host is not a partner's"],
    ["src/pages/auth/Boveda.tsx", "our copyright only when the host is not a partner's"],
    ["src/pages/auth/AccesoBloqueado.tsx", "our support mailbox only on our hosts"],
    ["src/components/PruebaEnRevisionScreen.tsx", "our support mailbox only on our hosts (block 9)"],
    ["src/lib/enlacesLegales.ts", "our legal pages only on our hosts (block 4)"],
    ["src/lib/appDelCliente.ts", "our customer app's name, only when `puedeUsarArteDePlataforma`"],
    ["src/pages/client/registration.tsx", "our app art gated (block 5); store links kept by owner's decision"],
    ["src/pages/supervisor/registration.tsx", "store search URLs, kept by owner's decision (block 5)"],
    ["src/pages/StyleGuide.tsx", "our design system; partner hosts are redirected (block 10)"],
    ["src/pages/auth/reset-password.tsx", "the app's URL scheme, opened by a button and never displayed"],
    ["src/lib/centinela.ts", "host allow-list; never rendered"],
    ["src/components/auth/marcoDeCaptcha.ts", "captcha frame URL and host test; never rendered as text"],
  ]);

  function fuentes(dir: string): string[] {
    return fs.readdirSync(path.join(raiz, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === "locales" ? [] : fuentes(rel);
      return /\.(ts|tsx)$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name) ? [rel] : [];
    });
  }

  /** Each source file → the literals and JSX texts in it that carry our brand. */
  const conMarca = new Map<string, string[]>();

  beforeAll(() => {
    for (const rel of fuentes("src")) {
      const src = soloCodigo(leer(rel));
      const hits: string[] = [];
      const literal = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

      for (const m of src.matchAll(literal)) {
        if (MARCA_EN_CODIGO.test(m[2]) && !CLAVE_I18N.test(m[2])) hits.push(m[2]);
      }
      for (const m of src.replace(literal, '""').matchAll(/>([^<>{}]+)</g)) {
        if (MARCA_EN_CODIGO.test(m[1])) hits.push(m[1].trim());
      }
      if (hits.length) conMarca.set(rel, hits);
    }
  });

  it("no file outside the gated list writes our brand", () => {
    const fugas = [...conMarca].filter(([rel]) => !PERMITIDOS.has(rel)).map(([rel, h]) => `${rel}: ${h.join(" · ")}`);

    expect(
      fugas,
      "Read the brand from useWhiteLabel() (platformName / logo) or useAppDelCliente().",
    ).toEqual([]);
  });

  it("and every exemption is still needed: a dead one hides the next leak", () => {
    const muertas = [...PERMITIDOS.keys()].filter((rel) => !conMarca.has(rel));

    expect(muertas).toEqual([]);
  });
});

describe("12 · live support from the platform, seen on a partner's host", () => {
  it("never prints the server's support name (ours) where our art may not show", () => {
    const src = soloCodigo(leer("src/components/soporte/SoporteEnVivo.tsx"));

    expect(src).toContain("const plataformaSinNombre = !!soporte?.viaSocio && !arteDePlataforma;");
    expect(src).toContain('t("soporte.enVivoPlataforma")');
    for (const l of ["es", "en", "pt", "fr", "de", "it", "nl", "pl"]) {
      const c = JSON.parse(leer(`src/locales/${l}.json`));

      expect(c.soporte.enVivoPlataforma, l).toBeTruthy();
      expect(c.soporte.enVivoTicketPlataforma, l).toContain("{{ticket}}");
    }
  });
});
