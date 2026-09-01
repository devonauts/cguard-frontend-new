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
import { describe, it, expect } from 'vitest';
import {
  resolveCountryCode,
  validateTaxNumberForCountry,
  validatePhoneForCountry,
} from './id';

describe('resolveCountryCode — la lotería de subcadenas', () => {
  it('no confunde a Grecia con Ecuador', () => {
    // «Greece» contiene «ec».
    expect(resolveCountryCode('Greece')).toBeNull();
    expect(resolveCountryCode('Czech Republic')).toBeNull();
    expect(resolveCountryCode('Liechtenstein')).toBeNull();
  });

  it('no confunde a México ni a Costa Rica con Colombia', () => {
    // Ambos contienen «co».
    expect(resolveCountryCode('Costa Rica')).toBeNull();
    expect(resolveCountryCode('México')).toBe('MX');
  });

  it('no confunde a Estados Unidos con España', () => {
    // «United States» contiene «es».
    expect(resolveCountryCode('United States')).toBeNull();
  });

  it('sigue reconociendo a los que sí modelamos', () => {
    expect(resolveCountryCode('Ecuador')).toBe('EC');
    expect(resolveCountryCode('EC')).toBe('EC');
    expect(resolveCountryCode('Colombia')).toBe('CO');
    expect(resolveCountryCode('Perú')).toBe('PE');
    expect(resolveCountryCode('')).toBeNull();
  });
});

describe('identificador fiscal — el alta es global', () => {
  it('acepta las longitudes que existen ahí fuera', () => {
    expect(validateTaxNumberForCountry('1234567', 'Malta')).toBe(true);
    expect(validateTaxNumberForCountry('123456789', 'United States')).toBe(true); // EIN
    expect(validateTaxNumberForCountry('12345678000195', 'Brasil')).toBe(true); // CNPJ
    expect(validateTaxNumberForCountry('22AAAAA0000A1Z5', 'India')).toBe(true); // GSTIN
    expect(validateTaxNumberForCountry('12345678901234567890', 'Kazajistán')).toBe(true);
  });

  it('deja escribir letras: media docena de países las usan', () => {
    expect(validateTaxNumberForCountry('B12345674', 'España')).toBe(true); // CIF
    expect(validateTaxNumberForCountry('ABC123456T1A', 'México')).toBe(true); // RFC
  });

  it('cuenta alfanuméricos, no caracteres tecleados', () => {
    expect(validateTaxNumberForCountry('12 345 678 901 234 567 890', 'Kazajistán')).toBe(true);
    expect(validateTaxNumberForCountry('12.345.678/0001-95', 'Brasil')).toBe(true);
  });

  it('sigue atrapando la errata', () => {
    expect(validateTaxNumberForCountry('12', 'United States')).toBe(false);
    expect(validateTaxNumberForCountry('123456789012345678901', 'Portugal')).toBe(false);
    expect(
      validateTaxNumberForCountry('esto es claramente un texto pegado por error', 'Portugal'),
    ).toBe(false);
    expect(validateTaxNumberForCountry('', 'Portugal')).toBe(false);
  });

  it('el precio de ser permisivo: una frase corta pasa, y está bien', () => {
    // Quitar los separadores es lo que deja entrar un identificador de 20 dígitos
    // escrito con espacios; el efecto secundario es que una palabra pegada de 18
    // letras también entra. Se acepta a propósito: esto atrapa erratas, no es una
    // credencial, y el coste de rechazar de más es que un país entero no se registra.
    expect(validateTaxNumberForCountry('esto se pegó por error', 'Portugal')).toBe(true);
  });

  it('los países que modelamos conservan su regla', () => {
    expect(validateTaxNumberForCountry('1792146739001', 'Ecuador')).toBe(true);
    // Los MISMOS nueve dígitos: válidos en Houston, no en Quito.
    expect(validateTaxNumberForCountry('123456789', 'Ecuador')).toBe(false);
  });
});

describe('teléfono — el mismo fallo, y era obligatorio para registrarse', () => {
  it('un móvil griego ya no se mide con la regla ecuatoriana', () => {
    expect(validatePhoneForCountry('+30 210 1234567', 'Greece')).toBe(true);
  });

  it('un móvil mexicano ya no se mide con la colombiana', () => {
    // «Mexico» contiene «co»: se le exigían 10 dígitos empezando por 3.
    expect(validatePhoneForCountry('+52 55 1234 5678', 'México')).toBe(true);
  });

  it('Ecuador conserva su regla', () => {
    expect(validatePhoneForCountry('+593 99 123 4567', 'Ecuador')).toBe(true);
    expect(validatePhoneForCountry('0991234567', 'Ecuador')).toBe(true);
    expect(validatePhoneForCountry('12345', 'Ecuador')).toBe(false);
  });

  it('sin país, sensatez y nada más', () => {
    expect(validatePhoneForCountry('+1 512 555 0134', undefined)).toBe(true);
    expect(validatePhoneForCountry('123', undefined)).toBe(false);
  });
});
