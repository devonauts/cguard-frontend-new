/**
 * El identificador fiscal y el teléfono del alta de empresa, medidos con la vara
 * del país. Espejo de `backend/tests/unit/tenants/taxIdTenantGlobal.test.ts`: si
 * las dos reglas se separan, el formulario deja enviar y el servidor rechaza.
 *
 * EL FALLO QUE CIERRAN: el país se detectaba con `country.includes('ec')`,
 * `includes('co')`, `includes('es')` sobre el NOMBRE largo que devuelve el
 * geocodificador. Eso no es una comprobación, es una lotería — y el alta de
 * media docena de países caía en la casilla equivocada.
 */
import { describe, it, expect } from "vitest";

import {
  resolveCountryCode,
  validateTaxNumberForCountry,
  validatePhoneForCountry,
  validatePersonIdForCountry,
  personIdLabelFor,
  taxIdLabelFor,
} from "./id";

describe("resolveCountryCode — la lotería de subcadenas", () => {
  it("no confunde a Grecia con Ecuador", () => {
    // «Greece» contiene «ec».
    expect(resolveCountryCode("Greece")).toBeNull();
    expect(resolveCountryCode("Czech Republic")).toBeNull();
    expect(resolveCountryCode("Liechtenstein")).toBeNull();
  });

  it("no confunde a México ni a Costa Rica con Colombia", () => {
    // Ambos contienen «co»: lo que importa es que NO caigan en CO.
    expect(resolveCountryCode("Costa Rica")).toBe("CR");
    expect(resolveCountryCode("México")).toBe("MX");
  });

  it("no confunde a Estados Unidos con España", () => {
    // «United States» contiene «es»: lo que importa es que NO caiga en ES.
    expect(resolveCountryCode("United States")).toBe("US");
  });

  it("reconoce el país en el idioma en que lo devuelve el geocodificador", () => {
    // El mismo país escrito como lo ve cada mercado. Si esto falla, el
    // formulario le pone a un alemán la etiqueta de otro país.
    expect(resolveCountryCode("Deutschland")).toBe("DE");
    expect(resolveCountryCode("Germany")).toBe("DE");
    expect(resolveCountryCode("Alemania")).toBe("DE");
    expect(resolveCountryCode("Polska")).toBe("PL");
    expect(resolveCountryCode("Pays-Bas")).toBe("NL");
    expect(resolveCountryCode("Brasile")).toBe("BR");
  });

  it("un código ISO de dos letras se toma tal cual", () => {
    expect(resolveCountryCode("EC")).toBe("EC");
    expect(resolveCountryCode("pl")).toBe("PL");
    expect(resolveCountryCode("  us  ")).toBe("US");
  });

  it("sigue reconociendo a los que sí modelamos", () => {
    expect(resolveCountryCode("Ecuador")).toBe("EC");
    expect(resolveCountryCode("Colombia")).toBe("CO");
    expect(resolveCountryCode("Perú")).toBe("PE");
    expect(resolveCountryCode("")).toBeNull();
  });
});

describe("identificador fiscal — el alta es global", () => {
  it("acepta las longitudes que existen ahí fuera", () => {
    expect(validateTaxNumberForCountry("1234567", "Malta")).toBe(true);
    expect(validateTaxNumberForCountry("123456789", "United States")).toBe(
      true,
    ); // EIN
    expect(validateTaxNumberForCountry("12345678000195", "Brasil")).toBe(true); // CNPJ
    expect(validateTaxNumberForCountry("22AAAAA0000A1Z5", "India")).toBe(true); // GSTIN
    expect(
      validateTaxNumberForCountry("12345678901234567890", "Kazajistán"),
    ).toBe(true);
  });

  it("deja escribir letras: media docena de países las usan", () => {
    expect(validateTaxNumberForCountry("B12345674", "España")).toBe(true); // CIF
    expect(validateTaxNumberForCountry("ABC123456T1A", "México")).toBe(true); // RFC
  });

  it("cuenta alfanuméricos, no caracteres tecleados", () => {
    expect(
      validateTaxNumberForCountry("12 345 678 901 234 567 890", "Kazajistán"),
    ).toBe(true);
    expect(validateTaxNumberForCountry("12.345.678/0001-95", "Brasil")).toBe(
      true,
    );
  });

  it("sigue atrapando la errata", () => {
    expect(validateTaxNumberForCountry("12", "United States")).toBe(false);
    expect(
      validateTaxNumberForCountry("123456789012345678901", "Portugal"),
    ).toBe(false);
    expect(
      validateTaxNumberForCountry(
        "esto es claramente un texto pegado por error",
        "Portugal",
      ),
    ).toBe(false);
    expect(validateTaxNumberForCountry("", "Portugal")).toBe(false);
  });

  it("el precio de ser permisivo: una frase corta pasa, y está bien", () => {
    // Quitar los separadores es lo que deja entrar un identificador de 20 dígitos
    // escrito con espacios; el efecto secundario es que una palabra pegada de 18
    // letras también entra. Se acepta a propósito: esto atrapa erratas, no es una
    // credencial, y el coste de rechazar de más es que un país entero no se registra.
    expect(
      validateTaxNumberForCountry("esto se pegó por error", "Kazajistán"),
    ).toBe(true);
  });

  it("los países que modelamos conservan su regla", () => {
    expect(validateTaxNumberForCountry("1792146739001", "Ecuador")).toBe(true);
    // Los MISMOS nueve dígitos: válidos en Houston, no en Quito.
    expect(validateTaxNumberForCountry("123456789", "Ecuador")).toBe(false);
  });
});

describe("teléfono — el mismo fallo, y era obligatorio para registrarse", () => {
  it("un móvil griego ya no se mide con la regla ecuatoriana", () => {
    expect(validatePhoneForCountry("+30 210 1234567", "Greece")).toBe(true);
  });

  it("un móvil mexicano ya no se mide con la colombiana", () => {
    // «Mexico» contiene «co»: se le exigían 10 dígitos empezando por 3.
    expect(validatePhoneForCountry("+52 55 1234 5678", "México")).toBe(true);
  });

  it("Ecuador conserva su regla", () => {
    expect(validatePhoneForCountry("+593 99 123 4567", "Ecuador")).toBe(true);
    expect(validatePhoneForCountry("0991234567", "Ecuador")).toBe(true);
    expect(validatePhoneForCountry("12345", "Ecuador")).toBe(false);
  });

  it("sin país, sensatez y nada más", () => {
    expect(validatePhoneForCountry("+1 512 555 0134", undefined)).toBe(true);
    expect(validatePhoneForCountry("123", undefined)).toBe(false);
  });
});

/**
 * El alta de CLIENTE era el último formulario que medía a todo el mundo con la
 * vara ecuatoriana: exigía 13 dígitos terminados en 001 debajo de una etiqueta
 * que ya decía «NIP firmy» o «Steuernummer». Era imposible de enviar fuera de
 * Ecuador. Estas pruebas son las que impiden que vuelva.
 */
describe("el alta de cliente, país por país", () => {
  it("acepta el identificador de la empresa tal como se escribe en su país", () => {
    expect(validateTaxNumberForCountry("1234567890", "Polska")).toBe(true); // NIP
    expect(validateTaxNumberForCountry("DE123456789", "Deutschland")).toBe(
      true,
    ); // USt-IdNr
    expect(validateTaxNumberForCountry("12345678901", "Italia")).toBe(true); // partita IVA
    expect(validateTaxNumberForCountry("NL123456789B01", "Nederland")).toBe(
      true,
    ); // btw
    expect(validateTaxNumberForCountry("123456789", "France")).toBe(true); // SIREN
    expect(validateTaxNumberForCountry("12-3456789", "United States")).toBe(
      true,
    ); // EIN
    expect(validateTaxNumberForCountry("76123456-7", "Chile")).toBe(true); // RUT
    expect(validateTaxNumberForCountry("30-12345678-9", "Argentina")).toBe(
      true,
    ); // CUIT
  });

  it("ninguno de ellos tiene que parecerse a un RUC ecuatoriano", () => {
    // Exactamente lo que fallaba: el NIP polaco medido con la regla de Quito.
    expect(validateTaxNumberForCountry("1234567890", "Ecuador")).toBe(false);
    expect(validateTaxNumberForCountry("1792146739001", "Polska")).toBe(false);
  });

  it("sigue atrapando la errata en el país modelado", () => {
    expect(validateTaxNumberForCountry("123", "Polska")).toBe(false);
    expect(validateTaxNumberForCountry("abc", "Deutschland")).toBe(false);
  });

  it("la etiqueta lleva el nombre que el documento tiene ahí", () => {
    expect(taxIdLabelFor("Polska")).toBe("NIP");
    expect(taxIdLabelFor("México")).toBe("RFC");
    expect(taxIdLabelFor("United States")).toBe("EIN");
    expect(taxIdLabelFor("Brasil")).toBe("CNPJ");
    // País que no modelamos: sin etiqueta propia, y quien pinta pone la
    // genérica traducida. Nunca «RUC» por descarte.
    expect(taxIdLabelFor("Kazajistán")).toBeNull();
    expect(taxIdLabelFor(undefined)).toBeNull();
  });
});

describe("documento de una persona — ni cédula para todos ni nada para nadie", () => {
  it("acepta el documento propio de cada país", () => {
    expect(validatePersonIdForCountry("1710034065", "Ecuador")).toBe(true); // cédula válida
    expect(validatePersonIdForCountry("12345678", "Perú")).toBe(true); // DNI
    expect(validatePersonIdForCountry("12345678Z", "España")).toBe(true); // DNI
    expect(validatePersonIdForCountry("90010112345", "Polska")).toBe(true); // PESEL
    expect(validatePersonIdForCountry("RSSMRA85T10A562S", "Italia")).toBe(true); // codice fiscale
  });

  it("acepta al extranjero, que en este sector es media plantilla", () => {
    // Un pasaporte no sigue la forma local, y aun así es el documento real.
    expect(validatePersonIdForCountry("AB1234567", "Polska")).toBe(true);
    expect(validatePersonIdForCountry("X1234567Y", "Ecuador")).toBe(true);
  });

  it("sigue rechazando el campo pegado por error", () => {
    expect(validatePersonIdForCountry("ab", "España")).toBe(false);
    expect(validatePersonIdForCountry("", "España")).toBe(false);
  });

  it("la etiqueta no le dice «cédula» a un italiano", () => {
    expect(personIdLabelFor("Italia")).toBe("Codice Fiscale");
    expect(personIdLabelFor("Polska")).toBe("PESEL");
    expect(personIdLabelFor("Ecuador")).toBe("Cédula");
    expect(personIdLabelFor("Kazajistán")).toBeNull();
  });
});
