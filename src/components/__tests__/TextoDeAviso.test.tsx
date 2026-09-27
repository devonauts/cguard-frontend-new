import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TextoDeAviso from "../TextoDeAviso";
import { conMarca } from "../../lib/anuncios/marca";

const html = (t: string) => renderToStaticMarkup(<TextoDeAviso texto={t} />);

describe("El texto de un aviso", () => {
  it("negrita, párrafos y viñetas", () => {
    const h = html("Hola **equipo**\n\n- uno\n- dos");
    expect(h).toContain("<strong>equipo</strong>");
    expect(h).toContain("<ul");
    expect(h).toContain("<li>uno</li>");
  });
  it("enlaces https y rutas del CRM, sí", () => {
    expect(html("[ayuda](https://ayuda.com/x)")).toContain('href="https://ayuda.com/x"');
    expect(html("[horario](/programador)")).toContain('href="/programador"');
  });
  it("javascript: y HTML crudo, jamás", () => {
    const h = html("[malo](javascript:alert(1)) <img src=x onerror=alert(1)>");
    expect(h).not.toContain("href=\"javascript");
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img");
  });
  it("{{marca}} se cambia por la del anfitrión", () => {
    expect(conMarca("Novedades de {{marca}} y {{ marca }}", "Andina")).toBe("Novedades de Andina y Andina");
  });
});
