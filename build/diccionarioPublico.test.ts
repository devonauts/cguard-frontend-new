import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { clavesDeFuente, filtrar, grafoPublico } from "./diccionarioPublico";

const D = {
  auth: { login: { title: "Entrar", button: "Entrar" }, items_one: "{{count}} cosa", items_other: "{{count}} cosas" },
  invite: { rule: { len: "8+", upper: "A-Z" } },
  admin: { secret: "panel" },
  loading: "Cargando",
};

describe("diccionarioPublico", () => {
  it("finds keys in t() calls and in key tables, with plurals and subtrees", () => {
    const fuente = `
      t("auth.login.title");
      const R = [{ label: "invite.rule.len" }];
      t('auth.items', { count: 2 });
      useTranslation("translation", { keyPrefix: "invite.rule" });
      const word = "auth"; const other = "no.such.key"; const x = \`loading\`;
    `;
    const k = clavesDeFuente(fuente, D);

    expect([...k].sort()).toEqual(["auth.items", "auth.login.title", "invite.rule", "invite.rule.len", "loading"]);
  });

  it("keeps only those keys", () => {
    const f = filtrar(D, ["auth.login.title", "auth.items", "invite.rule", "loading"]);

    expect(f).toEqual({
      auth: { login: { title: "Entrar" }, items_one: "{{count}} cosa", items_other: "{{count}} cosas" },
      invite: { rule: { len: "8+", upper: "A-Z" } },
      loading: "Cargando",
    });
    expect(JSON.stringify(f)).not.toContain("panel");
  });

  it("the real public app: reaches its screens, and none of the panel", () => {
    const raiz = path.resolve(__dirname, "..");
    const archivos = [...grafoPublico(path.join(raiz, "src"), path.join(raiz, "src/publico/main.tsx"))].map((f) =>
      path.relative(raiz, f),
    );

    expect(archivos).toContain("src/pages/auth/login.tsx");
    expect(archivos).toContain("src/pages/auth/accept-invitation.tsx");
    expect(archivos).toContain("src/pages/auth/reset-password.tsx");
    expect(archivos.filter((f) => f.startsWith("src/pages/admin/") && !f.includes("/video/"))).toEqual([]);

    const es = JSON.parse(fs.readFileSync(path.join(raiz, "src/locales/es.json"), "utf8"));
    const claves = new Set<string>();

    for (const f of archivos) for (const k of clavesDeFuente(fs.readFileSync(path.join(raiz, f), "utf8"), es)) claves.add(k);
    const publico = JSON.stringify(filtrar(es, claves)).length;

    // The whole dictionary is ~1 MB; the public part a few dozen kB.
    expect(publico).toBeLessThan(JSON.stringify(es).length / 10);
  });
});
