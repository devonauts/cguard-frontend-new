/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CARRUSEL DE SUCURSALES — el panel de inicio de una empresa dividida
 *
 * Con el módulo Sucursales, el mapa general desaparece: cada sucursal es una
 * tarjeta con su mapa CENTRADO EN SU ZONA y sus cifras. Cada tarjeta se expande
 * por separado y entonces trae el mapa operativo completo de esa sucursal.
 *
 * ── LAS CIFRAS ────────────────────────────────────────────────────────────
 * Vienen de `GET /branch/summary`: la misma cobertura en vivo del panel,
 * agrupada por sucursal. Por eso las tarjetas suman el total de arriba.
 *
 * ── RENDIMIENTO ───────────────────────────────────────────────────────────
 * El panel ya se congeló una vez por exceso de nodos. Los mapas pequeños pintan
 * SÓLO sedes y estaciones y se montan cuando la tarjeta entra en pantalla; el
 * mapa completo, con vigilantes en vivo, sólo existe en la tarjeta expandida.
 *
 * ── ORGANIZAR ─────────────────────────────────────────────────────────────
 * Se administra desde aquí mismo: crear, editar, archivar y mover sedes. La
 * tarjeta «Sin sucursal» aparece mientras quede alguna sede sin asignar.
 * ════════════════════════════════════════════════════════════════════════════
 */
import type { MapEntity } from "../types";
import type { DashboardPrefs } from "../prefs";
import type { MapCenter } from "../defaultCenter";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pencil,
  Plus,
  Settings2,
  Siren,
  UserCog,
} from "lucide-react";

import { OperationsMap } from "../components/OperationsMap";
import { Panel } from "../components/Panel";

import { repartir, SIN_SUCURSAL } from "./repartir";
import { EditorDeSucursal } from "./EditorDeSucursal";
import { AccesoDelPersonal } from "./AccesoDelPersonal";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  coberturaDe,
  sucursalSugerida,
  sucursalesService,
  type CifrasDeSucursal,
  type ListaDeSucursales,
  type ResumenDeSucursales,
  type SedeDeSucursal,
  type Sucursal,
} from "@/lib/api/sucursalesService";

interface Tarjeta {
  clave: string; // id de la sucursal o SIN_SUCURSAL
  sucursal: Sucursal | null;
  sedes: SedeDeSucursal[];
  cifras?: CifrasDeSucursal;
  entidades: MapEntity[];
  emergencias: number;
  peso: number;
}

/** Centro y zoom de una tarjeta: el promedio de sus sedes con coordenadas. */
function centroDe(sedes: SedeDeSucursal[], fallback?: MapCenter) {
  const con = sedes.filter((s) => s.lat != null && s.lng != null);

  if (!con.length) return fallback;

  return {
    lat: con.reduce((a, s) => a + (s.lat as number), 0) / con.length,
    lng: con.reduce((a, s) => a + (s.lng as number), 0) / con.length,
    zoom: 11,
  };
}

/** Monta los hijos sólo cuando el elemento entra en pantalla. */
function AlVerse({
  children,
  alto,
}: {
  children: React.ReactNode;
  alto: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const el = ref.current;

    if (!el || visto) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisto(true);

      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setVisto(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );

    io.observe(el);

    return () => io.disconnect();
  }, [visto]);

  return (
    <div ref={ref} style={{ height: alto }}>
      {visto ? children : null}
    </div>
  );
}

export function CarruselDeSucursales({
  lista,
  resumen,
  entities,
  prefs,
  defaultCenter,
  live,
  className,
}: {
  lista: ListaDeSucursales;
  resumen?: ResumenDeSucursales;
  entities: MapEntity[];
  prefs: DashboardPrefs;
  defaultCenter?: MapCenter;
  live?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const riel = useRef<HTMLDivElement>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  // Organizar pide lo mismo que el servidor (`settingsEdit`): a quien no lo
  // tiene, el botón sólo le daría errores.
  const { hasPermission } = usePermissions();
  const puedeOrganizar = hasPermission("settingsEdit");
  const [organizando, setOrganizando] = useState(false);
  const [editor, setEditor] = useState<{
    abierto: boolean;
    sucursal: Sucursal | null;
  }>({
    abierto: false,
    sucursal: null,
  });
  const [accesos, setAccesos] = useState(false);

  const refrescar = () => qc.invalidateQueries({ queryKey: ["sucursales"] });

  const porSucursal = useMemo(
    () => repartir(entities, lista),
    [entities, lista],
  );

  const tarjetas: Tarjeta[] = useMemo(() => {
    const cifras = new Map(
      (resumen?.porSucursal || []).map((c) => [c.branchId ?? SIN_SUCURSAL, c]),
    );
    const armar = (
      clave: string,
      sucursal: Sucursal | null,
      sedes: SedeDeSucursal[],
    ): Tarjeta => {
      const ents = porSucursal.get(clave) || [];
      const c = cifras.get(clave);
      const emergencias = ents.filter(
        (e) => e.kind === "incident" && e.status === "emergency",
      ).length;

      return {
        clave,
        sucursal,
        sedes,
        cifras: c,
        entidades: ents,
        emergencias,
        // Primero lo que arde: pánico, puestos sin cubrir, en riesgo, incidentes.
        peso:
          emergencias * 1000 +
          (c?.uncovered || 0) * 100 +
          (c?.at_risk || 0) * 10 +
          (c?.incidentesAbiertos || 0),
      };
    };
    const lasDeVerdad = lista.sucursales
      .map((b) => armar(b.id, b, b.sedes))
      .sort(
        (a, b) =>
          b.peso - a.peso || a.sucursal!.sortOrder - b.sucursal!.sortOrder,
      );
    const sueltas = lista.sinSucursal.length
      ? [armar(SIN_SUCURSAL, null, lista.sinSucursal)]
      : [];

    return [...lasDeVerdad, ...sueltas];
  }, [lista, resumen, porSucursal]);

  // Quien ve una sola sucursal no necesita carrusel: su tarjeta, abierta.
  const unica = tarjetas.length === 1 ? tarjetas[0].clave : null;
  const abierta = expandida ?? unica;
  const tarjetaAbierta = tarjetas.find((x) => x.clave === abierta) || null;

  const desplazar = (dir: 1 | -1) =>
    riel.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <Panel
      action={
        <div className="flex items-center gap-1.5">
          {organizando && (
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setAccesos(true)}
            >
              <UserCog className="mr-1.5 size-3.5" />
              {t("sucursales.acceso.boton")}
            </Button>
          )}
          {puedeOrganizar && (
            <Button
              size="sm"
              type="button"
              variant={organizando ? "brand" : "outline"}
              onClick={() => setOrganizando((v) => !v)}
            >
              <Settings2 className="mr-1.5 size-3.5" />
              {organizando
                ? t("sucursales.organizar.listo")
                : t("sucursales.organizar.boton")}
            </Button>
          )}
          {tarjetas.length > 2 && (
            <>
              <button
                aria-label={t("sucursales.anterior")}
                className="cg-btn-glass cg-focus grid size-8 place-items-center rounded-full"
                type="button"
                onClick={() => desplazar(-1)}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                aria-label={t("sucursales.siguiente")}
                className="cg-btn-glass cg-focus grid size-8 place-items-center rounded-full"
                type="button"
                onClick={() => desplazar(1)}
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          )}
        </div>
      }
      className={className}
      icon={<Building2 />}
      live={live}
      subtitle={t("sucursales.subtitulo", { count: lista.sucursales.length })}
      title={t("sucursales.titulo")}
    >
      <div
        ref={riel}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 pt-3"
        style={{ scrollbarWidth: "thin" }}
      >
        {tarjetas.map((tj) => (
          <TarjetaDeSucursal
            key={tj.clave}
            abierta={abierta === tj.clave}
            defaultCenter={defaultCenter}
            organizando={organizando}
            prefs={prefs}
            tarjeta={tj}
            onEditar={() => setEditor({ abierto: true, sucursal: tj.sucursal })}
            onExpandir={() =>
              setExpandida(abierta === tj.clave && !unica ? null : tj.clave)
            }
          />
        ))}
        {organizando && (
          <button
            className="flex w-[260px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm"
            style={{ color: "var(--ink-soft)", minHeight: 250 }}
            type="button"
            onClick={() => setEditor({ abierto: true, sucursal: null })}
          >
            <Plus className="size-5" />
            {t("sucursales.organizar.nueva")}
          </button>
        )}
      </div>

      {tarjetaAbierta && (
        <DetalleDeSucursal
          key={tarjetaAbierta.clave}
          defaultCenter={defaultCenter}
          lista={lista}
          organizando={organizando}
          prefs={prefs}
          tarjeta={tarjetaAbierta}
          onCambio={refrescar}
        />
      )}

      <AccesoDelPersonal
        abierto={accesos}
        sucursales={lista.sucursales}
        onCerrar={() => setAccesos(false)}
      />

      <EditorDeSucursal
        abierto={editor.abierto}
        sucursal={editor.sucursal}
        onCerrar={() => setEditor({ abierto: false, sucursal: null })}
        onGuardado={refrescar}
      />
    </Panel>
  );
}

function Cifra({
  valor,
  etiqueta,
  tono,
}: {
  valor: React.ReactNode;
  etiqueta: string;
  tono?: string;
}) {
  return (
    <div className="min-w-0">
      <div
        className="text-lg font-semibold leading-tight"
        style={tono ? { color: tono } : undefined}
      >
        {valor}
      </div>
      <div
        className="truncate text-[11px]"
        style={{ color: "var(--ink-faint)" }}
      >
        {etiqueta}
      </div>
    </div>
  );
}

function TarjetaDeSucursal({
  tarjeta,
  abierta,
  organizando,
  prefs,
  defaultCenter,
  onExpandir,
  onEditar,
}: {
  tarjeta: Tarjeta;
  abierta: boolean;
  organizando: boolean;
  prefs: DashboardPrefs;
  defaultCenter?: MapCenter;
  onExpandir: () => void;
  onEditar: () => void;
}) {
  const { t } = useTranslation();
  const { sucursal, cifras, sedes, emergencias } = tarjeta;
  const cobertura = coberturaDe(cifras);
  const color = sucursal?.color || "var(--ink-faint)";
  // El mapa pequeño: sólo sedes y estaciones — lo que dibuja la zona.
  const mini = useMemo(
    () =>
      tarjeta.entidades.filter(
        (e) => e.kind === "station" || e.kind === "client",
      ),
    [tarjeta.entidades],
  );
  const centro = centroDe(sedes, defaultCenter);

  return (
    <div
      className="flex w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border"
      style={{
        borderColor: abierta
          ? color
          : emergencias
            ? "var(--bad, #dc2626)"
            : undefined,
        boxShadow: abierta ? `0 0 0 1px ${color}` : undefined,
      }}
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {sucursal ? sucursal.name : t("sucursales.sinSucursal")}
        </span>
        {sucursal?.isHeadquarters && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              background: "color-mix(in oklab, var(--brand) 16%, transparent)",
              color: "var(--brand-text, var(--brand))",
            }}
          >
            {t("sucursales.principal")}
          </span>
        )}
        {sucursal?.code && (
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--ink-faint)" }}
          >
            {sucursal.code}
          </span>
        )}
        {organizando && sucursal && (
          <button
            aria-label={t("sucursales.organizar.editar")}
            className="cg-focus grid size-7 place-items-center rounded-full"
            type="button"
            onClick={onEditar}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {sucursal ? (
        <AlVerse alto={150}>
          {mini.length || centro ? (
            <div className="pointer-events-none h-full [&>div]:!h-full">
              <OperationsMap
                area="sucursales"
                defaultCenter={centro}
                entities={mini}
                height={150}
                hud={false}
                prefs={prefs}
                vista={`sucursal:${sucursal.id}`}
              />
            </div>
          ) : (
            <div
              className="grid h-full place-items-center text-xs"
              style={{ color: "var(--ink-faint)" }}
            >
              {t("sucursales.sinSedesConUbicacion")}
            </div>
          )}
        </AlVerse>
      ) : (
        <div
          className="grid place-items-center px-4 text-center text-sm"
          style={{ height: 150, color: "var(--ink-soft)" }}
        >
          {t("sucursales.sedesSueltas", { count: sedes.length })}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 px-3 pt-3">
        <Cifra
          etiqueta={t("sucursales.cifras.cobertura")}
          tono={
            cobertura != null && cobertura < 90
              ? "var(--warn, #d97706)"
              : undefined
          }
          valor={cobertura == null ? "—" : `${cobertura}%`}
        />
        <Cifra
          etiqueta={t("sucursales.cifras.enTurno")}
          valor={cifras?.enTurno ?? 0}
        />
        <Cifra
          etiqueta={t("sucursales.cifras.estacionesCorto")}
          valor={cifras?.estaciones ?? 0}
        />
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-2 text-xs"
        style={{ color: "var(--ink-soft)" }}
      >
        {emergencias > 0 && (
          <span
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: "var(--bad, #dc2626)" }}
          >
            <Siren className="size-3.5" />{" "}
            {t("sucursales.cifras.panicos", { count: emergencias })}
          </span>
        )}
        {(cifras?.uncovered || 0) > 0 && (
          <span style={{ color: "var(--bad, #dc2626)" }}>
            {t("sucursales.cifras.sinCubrir", { count: cifras!.uncovered })}
          </span>
        )}
        <span>
          {t("sucursales.cifras.incidentes", {
            count: cifras?.incidentesAbiertos ?? 0,
          })}
        </span>
      </div>

      <div className="mt-auto px-3 pb-3 pt-3">
        <Button
          className="w-full"
          size="sm"
          type="button"
          variant="outline"
          onClick={onExpandir}
        >
          {abierta ? (
            <ChevronUp className="mr-1.5 size-4" />
          ) : (
            <ChevronDown className="mr-1.5 size-4" />
          )}
          {abierta
            ? t("sucursales.plegar")
            : sucursal
              ? t("sucursales.expandir")
              : t("sucursales.asignar")}
        </Button>
      </div>
    </div>
  );
}

function DetalleDeSucursal({
  tarjeta,
  lista,
  organizando,
  prefs,
  defaultCenter,
  onCambio,
}: {
  tarjeta: Tarjeta;
  lista: ListaDeSucursales;
  organizando: boolean;
  prefs: DashboardPrefs;
  defaultCenter?: MapCenter;
  onCambio: () => void;
}) {
  const { t } = useTranslation();
  const { sucursal, sedes } = tarjeta;
  const esSueltas = !sucursal;
  // Sin sucursal, lo que se hace es asignar: la lista va abierta siempre.
  const verSedes = organizando || esSueltas;
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [moviendo, setMoviendo] = useState(false);

  const mover = async (siteIds: string[], branchId: string | null) => {
    if (!siteIds.length) return;
    setMoviendo(true);
    try {
      await sucursalesService.asignarSedes(siteIds, branchId);
      toast.success(
        t("sucursales.organizar.movidas", { count: siteIds.length }),
      );
      setMarcadas(new Set());
      onCambio();
    } catch {
      toast.error(t("sucursales.errores.guardar"));
    } finally {
      setMoviendo(false);
    }
  };

  const sugeridas = esSueltas
    ? sedes
        .map((s) => ({ s, b: sucursalSugerida(s.ciudad, lista.sucursales) }))
        .filter((x) => x.b)
    : [];

  const asignarSugeridas = async () => {
    const porSucursal = new Map<string, string[]>();

    for (const { s, b } of sugeridas)
      porSucursal.set(b!, [...(porSucursal.get(b!) || []), s.id]);
    for (const [b, ids] of porSucursal) await mover(ids, b);
  };

  return (
    <div className="mt-3 grid gap-4 border-t pt-4 lg:grid-cols-5">
      <div className={verSedes ? "lg:col-span-3" : "lg:col-span-5"}>
        <div
          className="relative overflow-hidden rounded-xl [&>div]:!h-full"
          style={{ height: 460 }}
        >
          <OperationsMap
            defaultCenter={centroDe(sedes, defaultCenter)}
            entities={tarjeta.entidades}
            height={460}
            prefs={prefs}
          />
        </div>
      </div>

      {verSedes && (
        <div className="space-y-2 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {t("sucursales.organizar.susSedes", { count: sedes.length })}
            </p>
            {esSueltas && sugeridas.length > 0 && (
              <Button
                disabled={moviendo}
                size="sm"
                type="button"
                variant="brand"
                onClick={asignarSugeridas}
              >
                {t("sucursales.organizar.asignarSugeridas", {
                  count: sugeridas.length,
                })}
              </Button>
            )}
          </div>

          {marcadas.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs">
              <span className="flex-1">
                {t("sucursales.organizar.marcadas", { count: marcadas.size })}
              </span>
              <SelectorDeSucursal
                disabled={moviendo}
                excluir={sucursal?.id}
                lista={lista}
                onElegir={(b) => mover([...marcadas], b)}
              />
            </div>
          )}

          <div className="max-h-[400px] space-y-1.5 overflow-y-auto pr-1">
            {sedes.map((s) => {
              const sugerida = esSueltas
                ? sucursalSugerida(s.ciudad, lista.sucursales)
                : null;

              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
                >
                  <Checkbox
                    aria-label={s.nombre}
                    checked={marcadas.has(s.id)}
                    onCheckedChange={(v) =>
                      setMarcadas((m) => {
                        const n = new Set(m);

                        if (v) n.add(s.id);
                        else n.delete(s.id);

                        return n;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {s.nombre || t("sucursales.sedeSinNombre")}
                    </p>
                    <p
                      className="truncate text-[11px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {s.ciudad || t("sucursales.sinCiudad")}
                    </p>
                  </div>
                  <SelectorDeSucursal
                    disabled={moviendo}
                    excluir={sucursal?.id}
                    lista={lista}
                    sugerida={sugerida}
                    onElegir={(b) => mover([s.id], b)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SelectorDeSucursal({
  lista,
  excluir,
  sugerida,
  disabled,
  onElegir,
}: {
  lista: ListaDeSucursales;
  excluir?: string;
  sugerida?: string | null;
  disabled?: boolean;
  onElegir: (branchId: string | null) => void;
}) {
  const { t } = useTranslation();
  const nombre = sugerida
    ? lista.sucursales.find((b) => b.id === sugerida)?.name
    : null;

  return (
    <Select
      disabled={disabled}
      value=""
      onValueChange={(v) => onElegir(v === SIN_SUCURSAL ? null : v)}
    >
      <SelectTrigger className="h-8 w-[150px] text-xs">
        <SelectValue
          placeholder={
            nombre
              ? t("sucursales.organizar.aSugerida", { nombre })
              : t("sucursales.organizar.moverA")
          }
        />
      </SelectTrigger>
      <SelectContent>
        {lista.sucursales
          .filter((b) => b.id !== excluir)
          .map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        {excluir && (
          <SelectItem value={SIN_SUCURSAL}>
            {t("sucursales.sinSucursal")}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
