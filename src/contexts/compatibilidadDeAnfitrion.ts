/**
 * ════════════════════════════════════════════════════════════════════════════
 * ¿PEGA ESTA EMPRESA CON ESTE ANFITRIÓN?
 *
 * El anfitrión decide QUÉ MARCA se pinta. La empresa decide A QUÉ DATOS se
 * entra. Son dos preguntas distintas y esta función responde SÓLO la primera:
 * devuelve qué identidad es legítimo enseñar alrededor de una empresa concreta.
 *
 * ── NO DECIDE NADA DE AUTORIZACIÓN ────────────────────────────────────────
 * Ni un caso de aquí niega el acceso. Quien puede entrar a una empresa lo
 * decide su membresía, en el servidor, y eso no cambia porque alguien escriba
 * otro anfitrión en la barra de direcciones. Si esto negara el paso, el
 * anfitrión se convertiría en una credencial — y un dato que escribe el cliente
 * nunca puede serlo.
 *
 * ── LOS CUATRO CASOS ──────────────────────────────────────────────────────
 *
 *   empresa DIRECTA  + anfitrión de plataforma → PLATAFORMA. Lo normal.
 *
 *   empresa DIRECTA  + anfitrión de un socio   → PLATAFORMA, no la del socio.
 *       Un cliente nuestro no se pinta con la marca de un distribuidor que no
 *       tiene nada que ver con él. Se entra igual: sólo cambia el rótulo.
 *
 *   empresa de un SOCIO + su propio anfitrión  → la del SOCIO. El caso bueno.
 *
 *   empresa de un SOCIO + anfitrión de plataforma → PLATAFORMA.
 *       Decisión de producto, escrita a propósito: se permite entrar y se
 *       enseña CGuardPro. No se redirige al anfitrión del socio porque eso
 *       movería a la persona a otro origen —otra sesión, otro almacenamiento—
 *       por un motivo puramente cosmético. Y no se niega, porque su membresía
 *       es válida: negar convertiría el anfitrión en autorización.
 *
 *   empresa del socio A + anfitrión del socio B → PLATAFORMA. Cierra en falso.
 *       Jamás la de B. Enseñarle a un cliente de A la marca de B le diría quién
 *       es otro distribuidor, y a B le pondría su marca sobre datos ajenos.
 *       Ante la duda, la nuestra: es la única que no engaña a nadie.
 *
 * La comparación se hace entre DOS DATOS DEL SERVIDOR: el `resellerPublicId`
 * que viene en `/auth/me` con la empresa, y el que resolvió el anfitrión en
 * `/platform/context`. El navegador no aporta ninguno de los dos y no hay forma
 * de falsificarlos desde aquí: lo que sí puede tocar —la URL, lo guardado en el
 * navegador, una cabecera— no entra en esta función.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type IdentidadAPintar = "plataforma" | "socio";

export interface EmpresaParaComparar {
  /** `direct` | `reseller`, tal y como lo manda el servidor. */
  billingOwnership?: string | null;
  /** La referencia pública del socio dueño (RSL-XXXX), o `null` si es directa. */
  resellerPublicId?: string | null;
  /**
   * Whose BRAND the company wears, from `/auth/me` (`brandResellerPublicId`):
   * the billing partner, or the brand-only tie the platform set for a
   * partner's own house company (direct, but theirs). Server data, like the
   * field above.
   */
  brandResellerPublicId?: string | null;
}

/**
 * El anfitrión ya resuelto, reducido a lo ÚNICO que hace falta aquí: de qué
 * socio es, o `null` si es de la plataforma.
 *
 * A propósito NO recibe `scope`. La pregunta por el ámbito se hace UNA sola vez
 * en todo el CRM —dentro de `WhiteLabelProvider`— y hay una prueba de la fase 11
 * que lo fija; repetirla aquí la habría convertido en dos. Y no hace falta:
 * `resellerPublicId` sólo tiene valor cuando el anfitrión es de un socio, así
 * que `null` ya significa «plataforma».
 */
export interface AnfitrionResuelto {
  resellerPublicId: string | null;
}

export interface Veredicto {
  identidad: IdentidadAPintar;
  /** `true` sólo cuando la empresa y el anfitrión son de socios DISTINTOS. */
  desajuste: boolean;
  motivo:
    | "plataforma"
    | "empresa-directa-en-anfitrion-de-socio"
    | "coinciden"
    | "empresa-de-socio-en-anfitrion-de-plataforma"
    | "socios-distintos";
}

const esDeSocio = (e: EmpresaParaComparar): boolean =>
  String(e?.billingOwnership || "direct").toLowerCase() === "reseller";

export function compatibilidad(
  empresa: EmpresaParaComparar | null | undefined,
  anfitrion: AnfitrionResuelto,
): Veredicto {
  const e = empresa || {};
  const anfitrionEsDeSocio = !!anfitrion?.resellerPublicId;

  if (!anfitrionEsDeSocio) {
    return esDeSocio(e)
      ? { identidad: "plataforma", desajuste: false, motivo: "empresa-de-socio-en-anfitrion-de-plataforma" }
      : { identidad: "plataforma", desajuste: false, motivo: "plataforma" };
  }

  // A partir de aquí el anfitrión es de un socio.
  /* A partner's own house company (direct for billing, tied to its brand by
     the platform) on THAT partner's host wears the partner's brand. ENTEC,
     2026-10-22: their own company flipped the CRM to our brand. */
  const deMarca = e.brandResellerPublicId ? String(e.brandResellerPublicId) : null;
  if (!esDeSocio(e) && deMarca && deMarca === anfitrion.resellerPublicId) {
    return { identidad: "socio", desajuste: false, motivo: "coinciden" };
  }
  if (!esDeSocio(e)) {
    return { identidad: "plataforma", desajuste: false, motivo: "empresa-directa-en-anfitrion-de-socio" };
  }

  /* Una empresa de socio SIN referencia pública no se da por buena: no poder
     comprobar que coinciden no es lo mismo que haber comprobado que coinciden. */
  const suya = e.resellerPublicId ? String(e.resellerPublicId) : null;
  if (suya && suya === anfitrion.resellerPublicId) {
    return { identidad: "socio", desajuste: false, motivo: "coinciden" };
  }

  return { identidad: "plataforma", desajuste: true, motivo: "socios-distintos" };
}

export default compatibilidad;
