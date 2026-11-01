import { useEffect, useMemo, useState } from "react";
import { recargarSinCache } from "@/lib/offline/recargarSinCache";
import { useQuery } from "@tanstack/react-query";

import { useEntitlement } from "@/hooks/useEntitlement";
import { clientService } from "@/lib/api/clientService";
import {
  espacioDeMarcaService,
  marcasService,
  type Marca,
} from "@/lib/api/marcasService";
import {
  ADDON_REQUIRED_EVENT,
  ADDONS_CHANGED_EVENT,
  type AddonRequiredDetail,
} from "@/lib/addonRequired";
import {
  TODAS_LAS_MARCAS,
  elegirMarca,
  marcaElegida,
} from "@/lib/marcaElegida";

export const MULTIMARCA = "multimarca";

const tenantActual = () =>
  typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;

/**
 * Whether the company has the Multimarca module ON. The session's
 * entitlement says so up front (fails closed: it is paid for), and a 402
 * `addon_required` for this key (a session older than a pause) switches it
 * off until the company's modules change again — the same rule as
 * `useHasModule` in `components/modulos/ModuleGate`.
 */
export function useModuloMultimarca(): boolean {
  const entitled = useEntitlement(MULTIMARCA);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const onRefusal = (ev: Event) => {
      if ((ev as CustomEvent<AddonRequiredDetail>).detail?.addonKey === MULTIMARCA)
        setRefused(true);
    };
    const onChange = () => setRefused(false);

    window.addEventListener(ADDON_REQUIRED_EVENT, onRefusal);
    window.addEventListener(ADDONS_CHANGED_EVENT, onChange);

    return () => {
      window.removeEventListener(ADDON_REQUIRED_EVENT, onRefusal);
      window.removeEventListener(ADDONS_CHANGED_EVENT, onChange);
    };
  }, []);

  return entitled && !refused;
}

/**
 * The company's BRANDS (Multimarca module). Without the module nothing is
 * asked (`activo` is false) and every screen stays exactly as today.
 */
export function useMarcas(opts: { archivadas?: boolean } = {}) {
  const activo = useModuloMultimarca();
  const tenant = tenantActual();
  const lista = useQuery({
    queryKey: ["marcas", "lista", tenant, !!opts.archivadas],
    queryFn: () => marcasService.listar({ archivadas: !!opts.archivadas }),
    enabled: activo && Boolean(tenant),
    staleTime: 60_000,
    retry: false,
  });
  const todas = lista.data?.brands ?? [];
  const marcas = todas.filter((b) => !b.archivedAt);
  const principal =
    marcas.find((b) => b.id === lista.data?.principalId) ??
    marcas.find((b) => b.isPrincipal) ??
    null;

  return {
    activo,
    lista,
    /** Every brand in use (not archived), principal first, then by order. */
    marcas: ordenarMarcas(marcas),
    /** Including archived ones (only when asked for). */
    todas: ordenarMarcas(todas),
    principal,
    cupos: lista.data?.slots ?? null,
    precioExtra: lista.data?.extraBrandPrice ?? null,
  };
}

export function ordenarMarcas(l: Marca[]): Marca[] {
  return [...l].sort(
    (a, b) =>
      Number(b.isPrincipal) - Number(a.isPrincipal) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      String(a.name).localeCompare(String(b.name)),
  );
}

/**
 * The brand a new record gets when the form does not say: the brand chosen
 * in the top bar when it is a real one, else the principal (the server rule).
 */
export function marcaPorDefecto(
  marcas: Marca[],
  principal: Marca | null,
): string {
  const elegida = marcaElegida();

  if (elegida && marcas.some((b) => b.id === elegida)) return elegida;

  return principal?.id ?? marcas[0]?.id ?? "";
}

export interface OpcionDeMarca {
  id: string; // 'all' or the brand id
  nombre: string;
  codigo: string | null;
  color: string | null;
  logoUrl: string | null;
  principal: boolean;
  todas: boolean;
}

/**
 * THE BRAND WORKSPACE: which brands the person can pick in the top bar and
 * which one they are in. One source for the bar, the phone pill, the colour
 * line and the chooser shown after signing in (mirrors `useEspacio`).
 *
 *   · «Todas las marcas» is offered only with more than one brand.
 *   · Changing brand RELOADS on the same route: half the app keeps its lists
 *     in local state, and without a reload it would show a mix.
 */
export function useEspacioDeMarca() {
  const { activo, lista, marcas } = useMarcas();
  const tenant = tenantActual();
  const guardado = useQuery({
    queryKey: ["marcas", "espacio", tenant],
    queryFn: () => espacioDeMarcaService.leer(),
    enabled: activo && Boolean(tenant),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const opciones: OpcionDeMarca[] = [
    ...(marcas.length > 1
      ? [
          {
            id: TODAS_LAS_MARCAS,
            nombre: "",
            codigo: null,
            color: null,
            logoUrl: null,
            principal: false,
            todas: true,
          },
        ]
      : []),
    ...marcas.map((b) => ({
      id: b.id,
      nombre: b.name,
      codigo: b.code,
      color: b.color,
      logoUrl: b.logoUrl,
      principal: !!b.isPrincipal,
      todas: false,
    })),
  ];
  const elegida = marcaElegida();
  const actual =
    opciones.find((o) => !o.todas && o.id === elegida) ??
    opciones.find((o) => o.todas) ??
    opciones[0] ??
    null;

  // A brand chosen here that no longer exists (archived, other device): back
  // to «all», and reload so nothing on screen stays narrowed by it.
  const invalida =
    activo &&
    lista.isSuccess &&
    !!elegida &&
    !marcas.some((b) => b.id === elegida);

  useEffect(() => {
    if (!invalida) return;
    elegirMarca(null);
    void recargarSinCache();
  }, [invalida]);

  /** Enter a brand: saved here and in the account; reloads when it changed. */
  const entrar = async (id: string) => {
    const antes = marcaElegida();
    const nueva = id === TODAS_LAS_MARCAS ? null : id;

    elegirMarca(nueva);
    try {
      await espacioDeMarcaService.fijar(id);
    } catch {
      /* the browser copy rules; the account copy is for next time */
    }
    if ((antes || null) !== nueva) await recargarSinCache();
  };

  return {
    activo,
    cargado: lista.isSuccess,
    opciones,
    actual,
    guardado: guardado.data?.marca ?? null,
    entrar,
  };
}

/** A brand as a row label (badge, table cell, export). */
export interface MarcaEtiqueta {
  id: string;
  nombre: string;
  codigo: string | null;
  color: string;
  logoUrl: string | null;
  principal: boolean;
}

/**
 * THE BRAND OF EACH ROW (mirrors `useEtiquetasDeSucursal`). Shown only in
 * «Todas las marcas» with two or more brands: inside one brand every row is
 * that brand and the label is noise. People's registration brand comes from
 * `GET /brands/people`, asked only when the screen needs it.
 */
export function useEtiquetasDeMarca(
  opts: { personas?: boolean; clientes?: boolean } = {},
) {
  const { activo: modulo, marcas, todas, lista } = useMarcas();
  const activo = modulo && marcas.length >= 2 && !marcaElegida();
  const tenant = tenantActual();
  const personas = useQuery({
    queryKey: ["marcas", "personas", tenant],
    queryFn: () => marcasService.personas(),
    enabled: activo && !!opts.personas && !!tenant,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Sites and stations inherit the brand of their client: one light client
  // list (cached app-wide) gives the map, asked only when a screen needs it.
  const clientes = useQuery({
    queryKey: ["marcas", "clientes", tenant],
    queryFn: async () => {
      const r = await clientService.getClients({} as any, {
        limit: 1000,
        offset: 0,
      } as any);
      const m: Record<string, string | null> = {};

      for (const c of r.rows ?? []) m[String(c.id)] = c.brandId ?? null;

      return m;
    },
    enabled: activo && !!opts.clientes && !!tenant,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return useMemo(() => {
    const porId = new Map<string, MarcaEtiqueta>();

    for (const b of todas.length ? todas : marcas) {
      porId.set(b.id, {
        id: b.id,
        nombre: b.name,
        codigo: b.code,
        color: b.color || "var(--brand)",
        logoUrl: b.logoUrl,
        principal: !!b.isPrincipal,
      });
    }
    const marca = (id: unknown) =>
      activo && id ? (porId.get(String(id)) ?? null) : null;
    const dePersona = (userId: unknown) =>
      userId ? marca(personas.data?.[String(userId)]) : null;
    /** A site or station: the brand of its client. */
    const deCliente = (clientId: unknown) =>
      clientId ? marca(clientes.data?.[String(clientId)]) : null;
    /** For tables and exports: «AND · Andina Seguridad». */
    const texto = (b: MarcaEtiqueta | null) =>
      b ? (b.codigo ? `${b.codigo} · ${b.nombre}` : b.nombre) : "";

    return { activo, marca, dePersona, deCliente, texto };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, lista.data, personas.data, clientes.data]);
}
