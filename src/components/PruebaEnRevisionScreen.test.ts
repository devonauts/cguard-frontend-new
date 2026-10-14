import { describe, expect, it } from "vitest";

import de from "../locales/de.json";
import en from "../locales/en.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import it_ from "../locales/it.json";
import nl from "../locales/nl.json";
import pl from "../locales/pl.json";
import pt from "../locales/pt.json";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA PANTALLA «TU PRUEBA ESTÁ EN REVISIÓN» HABLA LOS OCHO IDIOMAS
 *
 * Es lo PRIMERO que ve quien se registra (plan anti-copia: la prueba se
 * aprueba a mano). Una clave que falta en un idioma no rompe nada visible en
 * español y deja en inglés, polaco o neerlandés el texto por defecto en
 * español — justo a un cliente que todavía no ha visto nada del producto.
 *
 * Y la regla de la casa: sin jerga técnica ni «guardia» en lo que lee el
 * cliente. Sin jsdom, como el resto de pruebas del CRM: se miran los textos.
 * ════════════════════════════════════════════════════════════════════════════
 */

const IDIOMAS: Record<string, any> = { es, en, de, fr, it: it_, nl, pl, pt };
const CLAVES = [
  "pendingTitle",
  "pendingMsg",
  "pendingEmail",
  "stillPending",
  "check",
  "checking",
  "rejectedTitle",
  "rejectedMsg",
  "reasonLabel",
  "contact",
];

describe("Prueba en revisión · textos", () => {
  for (const [idioma, catalogo] of Object.entries(IDIOMAS)) {
    it(`«${idioma}» tiene todas las claves, con texto`, () => {
      const bloque = catalogo?.billing?.pruebaEnRevision;

      expect(bloque, idioma).toBeTruthy();
      for (const clave of CLAVES) {
        expect(typeof bloque[clave], `${idioma}.${clave}`).toBe("string");
        expect(bloque[clave].trim().length, `${idioma}.${clave}`).toBeGreaterThan(0);
      }
      // El correo se interpola: si la variable se traduce, sale «{{correo}}» literal.
      expect(bloque.pendingEmail).toContain("{{email}}");
    });
  }

  it("en español: sin jerga técnica ni «guardia»", () => {
    const todo = Object.values(es.billing.pruebaEnRevision).join(" ").toLowerCase();

    for (const prohibida of ["servidor", "backend", "endpoint", "tenant", "api", "guardia"]) {
      expect(todo, prohibida).not.toMatch(new RegExp(`\\b${prohibida}\\b`));
    }
  });
});
