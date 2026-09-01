export function digitsOnly(value: string) {
  return (value || '').replace(/\D/g, '');
}

// Valida cédula ecuatoriana (10 dígitos)
export function validateEcuadorCedula(cedula: string) {
  const ced = digitsOnly(cedula);
  if (!/^[0-9]{10}$/.test(ced)) return false;

  const province = Number(ced.substring(0, 2));
  if (province < 1 || province > 24) return false;

  const digits = ced.split('').map((d) => Number(d));
  const verifier = digits[9];

  let acc = 0;
  for (let i = 0; i < 9; i++) {
    let val = digits[i];
    if (i % 2 === 0) {
      val = val * 2;
      if (val > 9) val -= 9;
    }
    acc += val;
  }
  const nextTen = Math.ceil(acc / 10) * 10;
  let check = nextTen - acc;
  if (check === 10) check = 0;
  return check === verifier;
}

// Valida RUC ecuatoriano que termina en 001 (13 dígitos)
// Persona natural usa cédula base, persona jurídica usa algoritmo especial con tercer dígito 9.
export function validateEcuadorRucJuridica(ruc: string) {
  const r = digitsOnly(ruc);
  if (!/^[0-9]{13}$/.test(r)) return false;
  if (r[2] !== '9') return false;
  if (!r.endsWith('001')) return false;

  const digits = r.split('').map((d) => Number(d));
  const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * coefficients[i];
  }

  const mod = sum % 11;
  let verifier = 11 - mod;
  if (verifier === 11) verifier = 0;
  if (verifier === 10) return false;

  return verifier === digits[9];
}

export function validateEcuadorRuc(ruc: string) {
  // Practical requirement: a RUC is 13 numeric digits. We deliberately do NOT
  // enforce the '001' establishment suffix, the 3rd-digit type, or the
  // check-digit — those reject legitimate RUCs: public-sector RUCs (3rd digit
  // 6), branch establishments ending in 002/003…, and valid numbers issued by
  // the SRI that don't pass the modulus check. 13 digits is the rule.
  return /^[0-9]{13}$/.test(digitsOnly(ruc));
}

// Valida que sea cédula (10) o RUC (13 con 001). Si es RUC, valida los primeros 10.
export function validateCedulaOrRuc(value: string) {
  const v = (value || '').toString().trim();
  const d = digitsOnly(v);
  if (d.length === 10) return validateEcuadorCedula(d);
  if (d.length === 13) return validateEcuadorRuc(d);
  return false;
}

export default validateCedulaOrRuc;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * IDENTIFICADOR FISCAL — POR PAÍS, Y PERMISIVO CUANDO NO SE SABE
 *
 * Espejo de `backend/src/lib/validators/taxId.ts`. Si cambias la regla aquí,
 * cámbiala allí: el frontend sólo adelanta el mensaje, quien decide es el
 * backend, y que discrepen produce el peor error de todos — un formulario que
 * te deja enviar y un servidor que te rechaza sin decirte por qué.
 *
 * EL FALLO QUE CIERRA (2026-09-01): esto medía a media humanidad con la vara
 * ecuatoriana. Y había dos capas de error:
 *
 *  1. El país se detectaba con `country.includes('ec')`, `includes('co')`,
 *     `includes('es')`… sobre el NOMBRE del país. Eso no es una comprobación,
 *     es una lotería: «Greece» contiene «ec», así que un griego se validaba
 *     como ecuatoriano; «Mexico» y «Costa Rica» contienen «co», así que se
 *     validaban como colombianos; «United States» contiene «es», así que un
 *     EIN estadounidense se medía contra el NIF español y se rechazaba.
 *  2. Aun acertando el país, el desconocido caía en un genérico que exigía
 *     dígitos, cuando media docena de países usan letras (RFC, GSTIN, CIF).
 *
 * LA REGLA DE DISEÑO: **ante la duda, se acepta.** Un identificador fiscal no
 * es una credencial; validarlo atrapa erratas, no cierra puertas. Rechazar un
 * formato que no conocemos convierte cada país nuevo en un bloqueo total.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Del país (nombre o código ISO) al código que usamos internamente. Lo usan
 *  tanto el identificador fiscal como el teléfono — ambos sufrían el `includes`.
 *  Comparación EXACTA o por prefijo — nunca `includes`, ver el comentario. */
export function resolveCountryCode(country?: string): string | null {
  const p = (country || '').toString().trim().toLowerCase();
  if (!p) return null;
  if (p === 'ec' || p.startsWith('ecuador')) return 'EC';
  if (p === 'mx' || p.startsWith('mexico') || p.startsWith('méxico')) return 'MX';
  if (p === 'co' || p.startsWith('colombia')) return 'CO';
  if (p === 'pe' || p.startsWith('peru') || p.startsWith('perú')) return 'PE';
  return null;
}

/** RFC mexicano: 3 letras (persona moral) o 4 (física), 6 de fecha, 3 de homoclave.
 *  Sin dígito verificador a propósito: el SAT ha cambiado su tabla y un RFC
 *  legítimo antiguo puede no cuadrar. Se valida la FORMA. */
function looksLikeMexicanRfc(value: string) {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(value.toUpperCase().replace(/[\s-]/g, ''));
}

/** NIT colombiano: 8 a 10 dígitos, con dígito de verificación opcional. */
function looksLikeColombianNit(value: string) {
  return /^[0-9]{8,10}(-?[0-9])?$/.test(value.replace(/[\s.]/g, ''));
}

/** RUC peruano: 11 dígitos que empiezan por 10, 15, 17 o 20. */
function looksLikePeruvianRuc(value: string) {
  return /^(10|15|17|20)[0-9]{9}$/.test(value.replace(/[\s-]/g, ''));
}

/**
 * País que no modelamos. Se quitan los separadores que la gente teclea y se
 * exige que queden entre 5 y 20 caracteres ALFANUMÉRICOS — letras incluidas.
 *
 * El rango no es decorativo, el mundo real vive dentro: NIF portugués 9, EIN
 * estadounidense 9, VAT británico 9, CUIT argentino 11, CNPJ brasileño 14,
 * GSTIN indio 15, y hasta 20 donde numeran largo. Se cuentan alfanuméricos y no
 * caracteres para que un identificador de 20 dígitos escrito con separadores no
 * se caiga por longitud.
 */
export function looksLikeReasonableTaxId(value: string) {
  const clean = (value || '').replace(/[\s.\-/]/g, '');
  return /^[A-Za-z0-9ÑñÁÉÍÓÚáéíóú&]{5,20}$/.test(clean);
}

/** ¿Es aceptable este identificador fiscal para una empresa de este país? */
export function validateTaxNumberForCountry(taxNumber: string | undefined, country?: string) {
  const v = (taxNumber || '').toString().trim();
  if (!v) return false;

  switch (resolveCountryCode(country)) {
    case 'EC':
      return validateEcuadorRuc(digitsOnly(v));
    case 'MX':
      return looksLikeMexicanRfc(v);
    case 'CO':
      return looksLikeColombianNit(v);
    case 'PE':
      return looksLikePeruvianRuc(v);
    default:
      return looksLikeReasonableTaxId(v);
  }
}

/** Cómo se llama el documento en ese país, para no decirle «RUC» a un alemán. */
export function taxIdLabelFor(country?: string) {
  switch (resolveCountryCode(country)) {
    case 'EC': return 'RUC';
    case 'MX': return 'RFC';
    case 'CO': return 'NIT';
    case 'PE': return 'RUC';
    default: return null;
  }
}

/**
 * Teléfono, con la regla del país cuando la conocemos.
 *
 * Arrastraba el MISMO fallo que el identificador fiscal: el país se detectaba
 * con `includes` sobre su nombre, así que «Mexico» contiene «co» y a un móvil
 * mexicano se le exigía el formato colombiano (10 dígitos empezando por 3), y
 * «Greece» contiene «ec», así que a un griego se le exigía el ecuatoriano. El
 * teléfono es obligatorio en el alta: eso no era un mensaje feo, era no poder
 * registrarse. Ahora el país se resuelve con `resolveCountryCode`.
 */
export function validatePhoneForCountry(phone: string | undefined, country?: string) {
  const p = (phone || '').toString().trim();
  if (!p) return false;
  const d = digitsOnly(p);

  // E.164 internacional sin país declarado: se acepta con manga ancha.
  if (p.startsWith('+') && !country) {
    return d.length >= 7 && d.length <= 15;
  }

  switch (resolveCountryCode(country)) {
    case 'EC': {
      // Móvil: 9 dígitos empezando por 9, o 10 empezando por 09.
      let local = d;
      if (local.startsWith('593')) local = local.slice(3);
      if (local.length === 9 && local.startsWith('9')) return true;
      if (local.length === 10 && local.startsWith('09')) return true;
      return false;
    }
    case 'PE': {
      // Móvil: 9 dígitos empezando por 9.
      let local = d;
      if (local.startsWith('51')) local = local.slice(2);
      if (local.startsWith('0')) local = local.slice(1);
      return local.length === 9 && local.startsWith('9');
    }
    case 'CO': {
      // Móvil: 10 dígitos empezando por 3.
      let local = d;
      if (local.startsWith('57')) local = local.slice(2);
      if (local.startsWith('0')) local = local.slice(1);
      return local.length === 10 && local.startsWith('3');
    }
    case 'MX': {
      // 10 dígitos nacionales; se tolera el 52 (y el viejo 1 de móvil) delante.
      let local = d;
      if (local.startsWith('52')) local = local.slice(2);
      if (local.startsWith('1') && local.length === 11) local = local.slice(1);
      return local.length === 10;
    }
    default:
      // País que no modelamos: sólo sensatez. La ITU tope el número nacional en
      // 15 dígitos, y los planes más cortos del mundo bajan a 7.
      return d.length >= 7 && d.length <= 15;
  }
}
