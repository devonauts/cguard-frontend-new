import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "./AuthContext";
import {
  ContextoDeMarcaReact,
  EsqueletoNeutro,
  MARCA_DE_PLATAFORMA,
  aplicarMarca,
  puedeUsarArteDePlataforma,
  useWhiteLabel,
  type ContextoDeMarca,
} from "./WhiteLabelContext";
import { compatibilidad } from "./compatibilidadDeAnfitrion";
import { getActiveTenantId, subscribeActiveTenant } from "@/lib/activeTenant";
import { marcaDeLaEmpresa, publicarMarcaDeLaSesion } from "@/lib/recarga/marcaDelAviso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUÉ MARCA LE TOCA A *ESTA SESIÓN* EN *ESTE ANFITRIÓN*
 *
 * `WhiteLabelProvider` resuelve de quién es el ANFITRIÓN. Eso basta mientras no
 * hay nadie dentro: la pantalla de acceso de un socio es suya y punto.
 *
 * En cuanto hay sesión ya no basta, porque el anfitrión y la empresa pueden no
 * pegar: una empresa DIRECTA entrando por el anfitrión de un socio, o la
 * empresa del socio A servida bajo el anfitrión del socio B. En los dos casos
 * pintar la marca del anfitrión le enseñaría a alguien la identidad de un
 * tercero que no tiene nada que ver con su empresa.
 *
 * Aquí se decide cuál manda, y se vuelve a proveer el MISMO contexto que ya
 * leen los componentes. No hay un segundo hook: pedirle a cada pantalla que
 * recuerde cuál de las dos fuentes mirar es exactamente como se cuela una que
 * se quedó con la otra.
 *
 * ── LA REGLA NO SE ESCRIBE AQUÍ ───────────────────────────────────────────
 * Los cinco casos viven en `compatibilidadDeAnfitrion`, que se prueba solo.
 * Esto es el cableado: de dónde salen los dos datos y qué se hace con el
 * veredicto.
 *
 * ── Y NO DECIDE NADA DE ACCESO ────────────────────────────────────────────
 * Ni una rama de este archivo niega el paso. Quien entra a una empresa lo
 * decide su membresía, en el servidor. Si el anfitrión pudiera negar, sería
 * una credencial — y un dato que escribe el cliente no puede serlo.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** ¿Hay una sesión que resolver, o esto es la puerta de entrada? */
function haySesion(): boolean {
  try {
    return !!localStorage.getItem("authToken");
  } catch {
    return false;
  }
}

type Estado = "sin-sesion" | "sin-resolver" | "resuelto";

/**
 * La empresa activa, tal y como la describe el SERVIDOR.
 *
 * `tenantId` sale de `localStorage` y lo puede tocar cualquiera, pero sólo
 * sirve para ELEGIR entre las membresías que el servidor devolvió en
 * `/auth/me`. Cambiarlo a mano, como mucho, selecciona otra empresa suya. El
 * `resellerPublicId` que se compara viene de esa respuesta, no del navegador.
 */
function empresaActiva(user: any, tenantId: string | null) {
  const ts = Array.isArray(user?.tenants) ? user.tenants : [];
  if (!ts.length) return null;

  const t =
    ts.find((x: any) => (x?.tenantId || x?.tenant?.id) === tenantId) ?? ts[0];
  if (!t) return null;

  return {
    billingOwnership: t.billingOwnership,
    resellerPublicId: t.resellerPublicId ?? null,
    resellerBrandName: t.resellerBrandName ?? null,
  };
}

export function IdentidadEfectivaProvider({ children }: { children: ReactNode }) {
  const anfitrion = useWhiteLabel();
  const { user, loading } = useAuth();

  const [tenantId, setTenantId] = useState<string | null>(() => getActiveTenantId());
  useEffect(() => subscribeActiveTenant(() => setTenantId(getActiveTenantId())), []);

  const estado: Estado = useMemo(() => {
    if (!haySesion()) return "sin-sesion";
    // El perfil llegó (o falló y nos dejó sin usuario, que también es resolver).
    return loading ? "sin-resolver" : "resuelto";
  }, [loading, user]);

  /**
   * ── POR QUÉ UN ANFITRIÓN DE PLATAFORMA NO ESPERA A NADIE ────────────────
   * Si el anfitrión es el nuestro, la respuesta es la misma sea cual sea la
   * empresa: plataforma. No hay ambigüedad que resolver, así que no se hace
   * esperar a las 33 empresas directas por una comprobación cuyo resultado ya
   * se conoce. La espera existe SÓLO donde de verdad hay dos respuestas
   * posibles: un anfitrión de socio con una sesión a medio cargar.
   */
  /* Sin preguntar por `scope`: esa pregunta se hace UNA vez en todo el CRM,
     dentro de `WhiteLabelProvider`, y hay una prueba de la fase 11 que lo fija.
     No hace falta duplicarla — `resellerPublicId` sólo tiene valor cuando el
     anfitrión es de un socio, así que `null` ya significa plataforma. */
  const anfitrionEsDeSocio = !!anfitrion.resellerPublicId;

  const efectiva: ContextoDeMarca | null = useMemo(() => {
    if (!anfitrionEsDeSocio) return MARCA_DE_PLATAFORMA;
    if (estado === "sin-sesion") return anfitrion;
    if (estado === "sin-resolver") return null; // neutro: no se arriesga marca ajena

    const v = compatibilidad(empresaActiva(user, tenantId), {
      resellerPublicId: anfitrion.resellerPublicId,
    });

    return v.identidad === "socio" ? anfitrion : MARCA_DE_PLATAFORMA;
  }, [anfitrionEsDeSocio, anfitrion, estado, user, tenantId]);

  /* El nombre que firma el aviso de recarga (vive fuera de la sesión, en
     `main.tsx`). Va por la EMPRESA y no por el anfitrión: la de un socio ve a su
     socio también en nuestro dominio. Ver `lib/recarga/marcaDelAviso`. */
  useEffect(() => {
    if (estado === "sin-sesion") publicarMarcaDeLaSesion(undefined);
    else if (estado === "sin-resolver") publicarMarcaDeLaSesion("");
    else
      publicarMarcaDeLaSesion(
        marcaDeLaEmpresa(empresaActiva(user, tenantId), MARCA_DE_PLATAFORMA.platformName),
      );
  }, [estado, user, tenantId]);

  /* Pintar el documento: título, favicon, tono y croma. `aplicarMarca` sabe
     deshacerse, así que pasar de socio a plataforma REPONE lo de plataforma en
     vez de dejar restos del socio. */
  useEffect(() => {
    if (efectiva) aplicarMarca(efectiva);
  }, [efectiva]);

  /* Mientras no se sabe, el mismo esqueleto SIN MARCA DE NADIE que usa el
     arranque. Ni la del socio (podría no ser suya) ni la nuestra (parpadearía
     hasta la del socio en el caso bueno, que es el habitual). */
  if (!efectiva) return <EsqueletoNeutro />;

  const permitido = puedeUsarArteDePlataforma(efectiva);
  const valor = {
    ...efectiva,
    logo: efectiva.logoUrl || (permitido ? "/assets/logo/c-guard-logo.png" : null),
    puedeUsarArteDePlataforma: permitido,
    cargando: false,
    degradado: anfitrion.degradado,
  };

  return (
    <ContextoDeMarcaReact.Provider value={valor}>
      {children}
    </ContextoDeMarcaReact.Provider>
  );
}

export default IdentidadEfectivaProvider;
