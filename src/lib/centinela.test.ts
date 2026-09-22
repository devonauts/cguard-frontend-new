import { describe, expect, it } from "vitest";

import { esOrigenPropio } from "./centinela";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ¿ESTE PAQUETE ESTÁ DONDE DEBE? — lo que estas pruebas fijan
 *
 * Es la decisión que dispara `origen-ajeno`, la ÚNICA señal del plan anti-copia
 * que significa «nuestro paquete corriendo en un dominio que no es el nuestro».
 * Equivocarse hacia un lado deja pasar una copia; hacia el otro ACUSA A UN
 * CLIENTE, que es mucho peor y es lo que estuvo a punto de pasar: el CRM de
 * escritorio sirve el paquete en `app://crm`, y sin contemplar ese esquema cada
 * usuario de escritorio se anotaba como copia.
 *
 * La lista de esquemas es la MISMA que el backend ya usa en su filtro de CORS.
 * Si allí se añade uno, aquí también — y esta prueba no lo caza, así que queda
 * dicho en el código de los dos sitios.
 * ════════════════════════════════════════════════════════════════════════════
 */

const donde = (hostname: string, protocol = "https:") => ({ hostname, protocol });

describe("el centinela sabe dónde está", () => {
  it("nuestros anfitriones son nuestros", () => {
    for (const h of [
      "app.cguardpro.com",
      "partners.cguardpro.com",
      "cguardpro.com",
      "www.cguardpro.com",
      "client.cguardpro.com",
      "cualquier-socio.cguardpro.com",
    ]) {
      expect(esOrigenPropio(donde(h)), h).toBe(true);
    }
  });

  /* EL FALLO QUE ESTUVO A PUNTO DE ACUSAR A CLIENTES. Electron sirve el CRM en
     `app://crm`: el anfitrión es «crm», que no se parece a nada nuestro. */
  it("el CRM de escritorio (app://) NO es una copia", () => {
    expect(esOrigenPropio({ hostname: "crm", protocol: "app:" })).toBe(true);
  });

  it("ni las vistas web de las apps móviles", () => {
    expect(esOrigenPropio({ hostname: "localhost", protocol: "capacitor:" })).toBe(true);
    expect(esOrigenPropio({ hostname: "", protocol: "ionic:" })).toBe(true);
  });

  it("desarrollo tampoco", () => {
    expect(esOrigenPropio(donde("localhost", "http:"))).toBe(true);
    expect(esOrigenPropio(donde("127.0.0.1", "http:"))).toBe(true);
  });

  /* Y lo que sí tiene que saltar, o la señal no sirve para nada. */
  it("un dominio ajeno SÍ es una copia", () => {
    for (const h of [
      "clon-descarado.example",
      "cguardpro.com.copia.example",
      "midominio.net",
      "cguardpro-falso.com",
    ]) {
      expect(esOrigenPropio(donde(h)), h).toBe(false);
    }
  });

  /* El error clásico al comprobar sufijos: `evilcguardpro.com` acaba en
     «cguardpro.com» si se compara sin el punto. */
  it("no se deja engañar por un sufijo parecido", () => {
    expect(esOrigenPropio(donde("evilcguardpro.com"))).toBe(false);
    expect(esOrigenPropio(donde("notcguardpro.com"))).toBe(false);
  });
});
