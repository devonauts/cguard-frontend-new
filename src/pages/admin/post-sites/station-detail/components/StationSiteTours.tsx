import type { Station } from "@/types";

import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Settings,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MapPin,
  QrCode,
  Crosshair,
  Route,
  CalendarClock,
  Copy,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import RondaWizard from "./RondaWizard";
import RondaHorario, {
  resumenDeHorario,
  resumenDeDias,
  modoDe,
} from "./RondaHorario";

import { confirmDialog } from "@/components/ui/confirmDialog";
import { ApiService } from "@/services/api/apiService";
import { apartarDelWidget } from "@/lib/apartarDelWidget";
import RondaSettingsForm from "@/pages/admin/Configuration/rondas-settings/RondaSettingsForm";
import CheckpointLocationPicker from "@/components/maps/CheckpointLocationPicker";
import {
  Section,
  EmptyState,
  SkeletonCards,
  StatusBadge,
  Modal,
} from "@/components/kit";
import { FIELD_CLS_LG } from "@/pages/admin/clientes/components/_shared/tab-kit";
import { Button } from "@/components/ui/button";

interface StationDetail extends Station {
  latitude?: number | string | null;
  longitude?: number | string | null;
  geofenceRadius?: number | string | null;
}

type Props = { station: StationDetail; stationId: string; postSiteId: string };

interface Checkpoint {
  id: string;
  name: string;
  tagIdentifier: string;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
}

// A site-tour (ronda) row from `/site-tour`.
interface SiteTourRow {
  id: string | number;
  name?: string;
  tourName?: string;
  description?: string;
  active?: boolean;
  // El horario. Sin estos campos en el tipo, la tarjeta no puede resumir
  // cuándo corre la ronda y el editor nacería siempre en blanco.
  scheduleMode?: string | null;
  everyMinutes?: number | null;
  timesPerShift?: number | null;
  fixedTimes?: string[] | string | null;
  graceMinutes?: number | null;
  reminderMinutes?: number | null;
  scheduledDays?: unknown;
}
// A raw checkpoint/tag row from `/site-tour/:id/tags`.
interface TagRow {
  id: string | number;
  name?: string;
  tagIdentifier?: string;
  latitude?: number | string | null;
  latitud?: number | string | null;
  longitude?: number | string | null;
  longitud?: number | string | null;
  geofenceRadius?: number | string | null;
}

const num = (v: any): number | null => {
  const n = Number(v);

  return Number.isFinite(n) ? n : null;
};

/* Una fila de punto, venga del listado de rondas (`withTags=1`) o del endpoint
   de puntos de una ronda. Estaba escrito dos veces y las dos copias tenían que
   coincidir; ahora es una. */
const aPunto = (r: TagRow) => ({
  id: String(r.id),
  name: r.name || r.tagIdentifier || "—",
  tagIdentifier: r.tagIdentifier || String(r.id),
  latitude: num(r.latitude ?? r.latitud),
  longitude: num(r.longitude ?? r.longitud),
  radius: num(r.geofenceRadius),
});
/* ── EL CÓDIGO DEL PUNTO LO EMITE EL SERVIDOR ─────────────────────────────
   Aquí se generaba: `QR-` + cuatro caracteres de `Math.random()` + cuatro
   derivados de `Date.now()`. Tres cosas mal, y el QR es LA PRUEBA de que el
   vigilante estuvo físicamente en el punto:

     · cuatro caracteres base36 son ~1,7 millones de combinaciones, y la mitad
       del código no era aleatoria sino la hora — los puntos de una estación se
       crean en la misma sesión, así que compartían sufijo. Con UNO se acotaba
       el resto a un puñado;
     · `Math.random()` no es un generador criptográfico y nunca prometió serlo;
     · y lo decidía el CLIENTE: quien manipulara la petición elegía la identidad
       del punto.

   Ahora no se manda nada y lo emite el servidor, opaco y de 130 bits
   (`backend/src/lib/checkpointCode.ts`). Es también la única forma de que el
   código sea único de verdad: sólo el servidor ve todos los puntos. */

export default function StationSiteTours({
  station,
  stationId,
  postSiteId,
}: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const tenantId = (station?.tenantId ||
    localStorage.getItem("tenantId") ||
    "") as string;
  const stationLat = num(station?.latitud ?? station?.latitude);
  const stationLng = num(station?.longitud ?? station?.longitude);

  const [tours, setTours] = useState<SiteTourRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Create-ronda modal
  const [showNewTour, setShowNewTour] = useState(false);

  // Per-tour checkpoint state
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Qué ronda se está renombrando, y el borrador de su nombre/descripción. */
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editName, setEditName] = useState<Record<string, string>>({});
  const [editDesc, setEditDesc] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<string | null>(null);
  const [cps, setCps] = useState<Record<string, Checkpoint[]>>({});
  const [cpLoading, setCpLoading] = useState<string | null>(null);
  // inline "add checkpoint" form (per tour)
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [cpName, setCpName] = useState("");
  const [cpLat, setCpLat] = useState<number | null>(null);
  const [cpLng, setCpLng] = useState<number | null>(null);
  const stationRadius = num(station?.geofenceRadius) ?? 75;
  const [cpRadius, setCpRadius] = useState<number>(stationRadius);
  const [savingCp, setSavingCp] = useState(false);

  const loadTours = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setError(null);
    try {
      // `withTags=1`: el listado ya sabía devolver los puntos de cada ronda y
      // nadie se los pedía. Sin esto, el contador de la fila plegada sólo
      // aparecía DESPUÉS de desplegarla una vez —al recargar desaparecía— y una
      // ronda recién duplicada decía «sin puntos» hasta recargar la página.
      // Son dos consultas más en total, no una por ronda.
      const res: any = await ApiService.get(
        `/tenant/${tenantId}/site-tour?stationId=${encodeURIComponent(stationId)}&withTags=1&limit=999&_=${Date.now()}`,
      );
      const filas = Array.isArray(res) ? res : (res?.rows ?? []);

      setTours(filas);

      // Se siembran los puntos que vinieron con el listado. `toggleExpand` ya
      // sólo pide los que falten, así que desplegar deja de costar una vuelta.
      setCps((m) => {
        const out = { ...m };

        for (const f of filas) {
          if (Array.isArray(f?.tags)) out[String(f.id)] = f.tags.map(aPunto);
        }

        return out;
      });
    } catch (e: any) {
      setError(
        e?.message ||
          t("station.siteTours.loadError", "Error al cargar rondas"),
      );
    } finally {
      setLoading(false);
    }
  }, [stationId, tenantId, t]);

  useEffect(() => {
    loadTours();
  }, [loadTours]);

  const loadCheckpoints = useCallback(
    async (tourId: string) => {
      setCpLoading(tourId);
      try {
        const res: any = await ApiService.get(
          `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tags?_=${Date.now()}`,
        );
        const rows = Array.isArray(res) ? res : (res?.rows ?? []);

        setCps((m) => ({ ...m, [tourId]: rows.map(aPunto) }));
      } catch {
        setCps((m) => ({ ...m, [tourId]: [] }));
      } finally {
        setCpLoading(null);
      }
    },
    [tenantId],
  );

  const toggleExpand = (tourId: string) => {
    if (expanded === tourId) {
      setExpanded(null);

      return;
    }
    setExpanded(tourId);
    setAddingFor(null);
    if (!cps[tourId]) loadCheckpoints(tourId);
  };

  const deleteTour = async (tourId: string) => {
    if (
      !(await confirmDialog({
        title: t("ui.StationSiteTours.eliminarRonda", "Eliminar ronda"),
        message: t(
          "station.siteTours.confirmDelete",
          "¿Eliminar esta ronda y sus puntos de control?",
        ),
        confirmText: t("common.delete", "Eliminar"),
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}`,
      );
      toast.success(t("station.siteTours.deleted", "Ronda eliminada"));
      setTours((ts) => ts.filter((x) => String(x.id) !== tourId));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("station.siteTours.deleteFailed", "No se pudo eliminar"),
      );
    }
  };

  /**
   * Duplicar una ronda para darle otro horario.
   *
   * La copia apunta a LOS MISMOS puntos de control: mismas etiquetas, mismos
   * códigos, ninguna que reimprimir. Es la razón de que los puntos se
   * compartan — antes duplicar obligaba a crear puntos nuevos y a repegar toda
   * la señalética del puesto.
   */
  /**
   * RENOMBRAR UNA RONDA.
   *
   * No se podía. Una ronda nacía con su nombre y se quedaba con él para
   * siempre: para corregir una errata había que borrarla —perdiendo sus puntos
   * y su historial— y volver a crearla. Con los puntos compartidos eso ya sería
   * absurdo, porque los QR sobreviven a la ronda.
   */
  const renameTour = async (tour: SiteTourRow) => {
    const id = String(tour.id);
    const nombre = (editName[id] ?? (tour.name || tour.tourName || "")).trim();

    if (!nombre) {
      toast.error(
        t("station.siteTours.nameRequired", "La ronda necesita un nombre"),
      );

      return;
    }
    setSavingName(id);
    try {
      const res: any = await ApiService.patch(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(id)}`,
        { name: nombre, description: editDesc[id] ?? tour.description ?? "" },
      );
      const actualizada = res?.data ?? res ?? {};

      setTours((ts) =>
        ts.map((x) =>
          String(x.id) === id
            ? {
                ...x,
                name: nombre,
                description:
                  actualizada.description ?? editDesc[id] ?? x.description,
              }
            : x,
        ),
      );
      setEditingName(null);
      toast.success(t("station.siteTours.renamed", "Ronda actualizada"));
    } catch (e: any) {
      toast.error(
        e?.message || t("station.siteTours.renameFailed", "No se pudo guardar"),
      );
    } finally {
      setSavingName(null);
    }
  };

  const duplicateTour = async (tour: SiteTourRow) => {
    const nombre = (tour.name || tour.tourName || "").trim();

    if (
      !(await confirmDialog({
        title: t("station.siteTours.duplicate", "Duplicar ronda"),
        message: t("ui.StationSiteTours.confirmDuplicate", {
          defaultValue:
            "Se creará una copia de «{{nombre}}» con los MISMOS puntos de control. No hay que reimprimir ningún QR: sólo tendrás que ponerle su horario.",
          nombre,
        }),
        confirmText: t("ui.StationSiteTours.duplicar", "Duplicar"),
      }))
    )
      return;
    try {
      const res: any = await ApiService.post(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(String(tour.id))}/duplicate`,
        {},
      );
      const copia = res?.data ?? res;

      toast.success(
        t("ui.StationSiteTours.duplicated", {
          defaultValue: "Ronda duplicada con {{count}} puntos",
          count: copia?.puntosHeredados ?? 0,
        }),
      );
      await loadTours();
      // Se abre la copia: duplicar sin cambiarle la hora no sirve de nada, y
      // dejarla cerrada esconde justo el paso que falta.
      if (copia?.id) setExpanded(String(copia.id));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("station.siteTours.duplicateFailed", "No se pudo duplicar"),
      );
    }
  };

  const openAddCheckpoint = (tourId: string) => {
    setAddingFor(tourId);
    setCpName("");
    setCpLat(stationLat);
    setCpLng(stationLng);
    setCpRadius(stationRadius);
  };

  const createCheckpoint = async (tourId: string) => {
    if (!cpName.trim()) {
      toast.error(
        t(
          "station.siteTours.cpNameRequired",
          "Escribe un nombre para el punto",
        ),
      );

      return;
    }
    if (cpLat == null || cpLng == null) {
      toast.error(
        t(
          "station.siteTours.cpLocRequired",
          "Marca la ubicación del punto en el mapa",
        ),
      );

      return;
    }
    setSavingCp(true);
    try {
      await ApiService.post(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tag`,
        {
          name: cpName.trim(),
          tagType: "qr",
          latitude: cpLat,
          longitude: cpLng,
          geofenceRadius: cpRadius,
          stationId,
          showGeoFence: true,
        },
      );
      toast.success(
        t("station.siteTours.cpCreated", "Punto de control creado"),
      );
      setAddingFor(null);
      setCpName("");
      loadCheckpoints(tourId);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("station.siteTours.cpCreateFailed", "No se pudo crear el punto"),
      );
    } finally {
      setSavingCp(false);
    }
  };

  // El ORDEN del recorrido por fin se edita. La posición en la lista es el
  // orderIndex: subir/bajar intercambia y manda la lista entera de ids — el
  // servidor asigna 0..n-1 y devuelve el orden vigente. Con
  // «exigir orden de puntos» activo en /setting/rondas, esto ES la ruta.
  const moveCheckpoint = async (tourId: string, tagId: string, dir: -1 | 1) => {
    const list = cps[tourId] || [];
    const i = list.findIndex((c: Checkpoint) => c.id === tagId);
    const j = i + dir;

    if (i < 0 || j < 0 || j >= list.length) return;
    const nuevo = [...list];

    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    setCps((prev: Record<string, Checkpoint[]>) => ({
      ...prev,
      [tourId]: nuevo,
    }));
    try {
      await ApiService.put(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tags/reorder`,
        { ids: nuevo.map((c: Checkpoint) => c.id) },
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("station.siteTours.reorderFailed", "No se pudo guardar el orden"),
      );
      loadCheckpoints(tourId);
    }
  };

  const deleteCheckpoint = async (tourId: string, tagId: string) => {
    if (
      !(await confirmDialog({
        title: t(
          "station.siteTours.deleteCpTitle",
          "Eliminar punto de control",
        ),
        message: t(
          "station.siteTours.confirmDeleteCp",
          "¿Eliminar este punto de control?",
        ),
        confirmText: t("common.delete", "Eliminar"),
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tag/${encodeURIComponent(tagId)}`,
      );
      setCps((m) => ({
        ...m,
        [tourId]: (m[tourId] || []).filter((c) => c.id !== tagId),
      }));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("station.siteTours.deleteFailed", "No se pudo eliminar"),
      );
    }
  };

  return (
    <>
      <Section
        action={
          /* Los dos botones rozan los 300 px: se envuelven en pantallas estrechas. */
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              className="gap-1.5 rounded-full"
              size="sm"
              variant="brand"
              onClick={() => setShowNewTour(true)}
            >
              <Plus size={16} /> {t("station.siteTours.new", "Nueva ronda")}
            </Button>
            <Button
              className="gap-1.5 rounded-full"
              size="sm"
              variant="outline"
              onClick={() => setShowSettings(true)}
            >
              <Settings size={15} />{" "}
              {t("station.siteTours.settings", "Configuraciones")}
            </Button>
          </div>
        }
        contentClassName="-mx-5 -mb-5"
        icon={<Route />}
        title={
          <span>
            {t("station.siteTours.title", "Rondas de Seguridad")}
            {tours.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({tours.length})
              </span>
            )}
          </span>
        }
      >
        <p className="px-6 -mt-2 mb-3 text-xs text-muted-foreground">
          {t("station.siteTours.hint", {
            defaultValue:
              'Crea rondas y sus puntos de control. Luego genera los QR en la pestaña «{{tab}}».',
            tab: t("station.details.patrolQr", "QR de Rondas"),
          })}
        </p>

        {loading ? (
          <div className="px-5 pb-5">
            <SkeletonCards count={3} />
          </div>
        ) : error ? (
          <div
            className="px-6 pb-6 text-sm"
            style={{ color: "var(--bad-text)" }}
          >
            {error}
          </div>
        ) : tours.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<QrCode />}
              title={t(
                "station.siteTours.empty",
                'Aún no hay rondas. Crea la primera con "Nueva ronda".',
              )}
            />
          </div>
        ) : (
          <ul className="divide-y border-t">
            {tours.map((r: SiteTourRow) => {
              const id = String(r.id);
              const name = r.name || r.tourName || r.description || "—";
              const active = r.active !== false;
              const list = cps[id] || [];
              const isOpen = expanded === id;

              return (
                <li key={id}>
                  <div className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40">
                    <button
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left"
                      onClick={() => toggleExpand(id)}
                    >
                      {isOpen ? (
                        <ChevronDown
                          className="shrink-0 text-muted-foreground"
                          size={18}
                        />
                      ) : (
                        <ChevronRight
                          className="shrink-0 text-muted-foreground"
                          size={18}
                        />
                      )}
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {name}
                      </span>
                      <StatusBadge tone={active ? "green" : "slate"}>
                        {active
                          ? t("station.siteTours.active", "Activa")
                          : t("station.siteTours.inactive", "Inactiva")}
                      </StatusBadge>
                      {cps[id] && (
                        <span className="text-xs text-muted-foreground">
                          {t("ui.RondaWizard.nPuntos", {
                            defaultValue: "{{count}} puntos",
                            count: list.length,
                          })}
                        </span>
                      )}
                      {/* CUÁNDO corre, sin tener que desplegar. Una ronda sin
                          horario se ve igual que antes: «Una vez por turno». */}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock className="shrink-0" size={13} />
                        {resumenDeHorario(r, t)}
                        {modoDe(r) !== "once" && (
                          <span className="opacity-70">
                            · {resumenDeDias(r, t)}
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      className="cg-focus rounded p-1.5 text-muted-foreground"
                      title={t("station.siteTours.duplicate", "Duplicar ronda")}
                      onClick={() => duplicateTour(r)}
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      className="cg-focus rounded p-1.5"
                      style={{ color: "var(--bad-text)" }}
                      title={t("common.delete", "Eliminar")}
                      onClick={() => deleteTour(id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t bg-muted/10 px-6 py-4">
                      {/* ── NOMBRE Y DESCRIPCIÓN ───────────────────────────
                          Renombrar no existía: para corregir una errata había
                          que borrar la ronda —con sus puntos y su historial— y
                          rehacerla. */}
                      <div className="mb-5 rounded-lg border bg-background p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <p className="cg-eyebrow flex items-center gap-1.5">
                            <Pencil size={14} />
                            {t(
                              "station.siteTours.identity",
                              "Nombre y descripción",
                            )}
                          </p>
                          {editingName !== id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingName(id);
                                setEditName((m) => ({ ...m, [id]: name }));
                                setEditDesc((m) => ({
                                  ...m,
                                  [id]: r.description || "",
                                }));
                              }}
                            >
                              {t("common.edit", "Editar")}
                            </Button>
                          )}
                        </div>
                        {editingName === id ? (
                          <div className="space-y-2">
                            <input
                              className={FIELD_CLS_LG}
                              maxLength={200}
                              placeholder={t(
                                "station.siteTours.namePh",
                                "Nombre de la ronda",
                              )}
                              value={editName[id] ?? name}
                              onChange={(e) =>
                                setEditName((m) => ({
                                  ...m,
                                  [id]: e.target.value,
                                }))
                              }
                            />
                            <input
                              className={FIELD_CLS_LG}
                              placeholder={t(
                                "station.siteTours.descPh",
                                "Descripción (opcional)",
                              )}
                              value={editDesc[id] ?? r.description ?? ""}
                              onChange={(e) =>
                                setEditDesc((m) => ({
                                  ...m,
                                  [id]: e.target.value,
                                }))
                              }
                            />
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingName(null)}
                              >
                                {t("common.cancel", "Cancelar")}
                              </Button>
                              <Button
                                disabled={savingName === id}
                                size="sm"
                                onClick={() => renameTour(r)}
                              >
                                {savingName === id && (
                                  <Loader2
                                    className="mr-2 animate-spin"
                                    size={14}
                                  />
                                )}
                                {t("common.save", "Guardar")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {r.description ||
                                t(
                                  "station.siteTours.noDesc",
                                  "Sin descripción",
                                )}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* ── CUÁNDO ─────────────────────────────────────────
                          Va ARRIBA de los puntos a propósito: el recorrido ya
                          existe cuando se llega aquí; lo que falta por decidir
                          —y lo que hay que cambiar en una ronda duplicada— es
                          la hora. */}
                      <div className="mb-5 rounded-lg border bg-background p-4">
                        <p className="cg-eyebrow mb-3 flex items-center gap-1.5">
                          <CalendarClock size={14} />
                          {t("station.siteTours.schedule", "Cuándo se hace")}
                        </p>
                        <RondaHorario
                          inicial={r}
                          tenantId={tenantId}
                          tourId={id}
                          onGuardado={(actualizada) =>
                            setTours((ts) =>
                              ts.map((x) =>
                                String(x.id) === id
                                  ? { ...x, ...(actualizada || {}) }
                                  : x,
                              ),
                            )
                          }
                        />
                      </div>

                      {cpLoading === id ? (
                        <div className="flex justify-center py-4">
                          <Loader2
                            className="animate-spin brand-text"
                            size={18}
                          />
                        </div>
                      ) : (
                        <>
                          {list.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {t(
                                "station.siteTours.noPoints",
                                "Sin puntos de control todavía.",
                              )}
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {list.map((c, ci) => (
                                <li
                                  key={c.id}
                                  className="glass-sunken flex items-center justify-between px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                                      <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">
                                        {ci + 1}.
                                      </span>
                                      <span className="min-w-0 truncate font-medium text-foreground">
                                        {c.name}
                                      </span>
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {c.tagIdentifier}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 text-xs">
                                      {c.latitude != null &&
                                      c.longitude != null ? (
                                        <span
                                          className="inline-flex items-center gap-1"
                                          style={{ color: "var(--ok-text)" }}
                                        >
                                          <MapPin size={12} />
                                          {c.latitude.toFixed(5)},{" "}
                                          {c.longitude.toFixed(5)}
                                          <span className="ml-1 text-muted-foreground">
                                            · ±{c.radius ?? stationRadius} m
                                          </span>
                                        </span>
                                      ) : (
                                        <span
                                          style={{ color: "var(--warn-text)" }}
                                        >
                                          {t(
                                            "station.siteTours.cpNoLoc",
                                            "Sin ubicación — la verificación no funcionará",
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    <button
                                      className="cg-focus rounded p-1.5 text-muted-foreground disabled:opacity-30"
                                      disabled={ci === 0}
                                      title={t(
                                        "station.siteTours.moveUp",
                                        "Subir",
                                      )}
                                      onClick={() =>
                                        moveCheckpoint(id, c.id, -1)
                                      }
                                    >
                                      <ChevronUp size={15} />
                                    </button>
                                    <button
                                      className="cg-focus rounded p-1.5 text-muted-foreground disabled:opacity-30"
                                      disabled={ci === list.length - 1}
                                      title={t(
                                        "station.siteTours.moveDown",
                                        "Bajar",
                                      )}
                                      onClick={() =>
                                        moveCheckpoint(id, c.id, 1)
                                      }
                                    >
                                      <ChevronDown size={15} />
                                    </button>
                                    <button
                                      className="cg-focus rounded p-1.5"
                                      style={{ color: "var(--bad-text)" }}
                                      onClick={() => deleteCheckpoint(id, c.id)}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}

                          {addingFor === id ? (
                            /* `ref` y no un efecto: el empujón tiene que
                              ocurrir cuando este formulario existe, y aquí es
                              donde nace. Sin esto su «Guardar» queda debajo de
                              la burbuja de VigIA al final de una lista larga y
                              el clic abre el chat en vez de guardar. */
                            <div
                              ref={apartarDelWidget}
                              className="glass-sunken mt-3 space-y-3 p-3"
                            >
                              <div>
                                <label className="cg-eyebrow mb-1 block">
                                  {t(
                                    "station.siteTours.cpName",
                                    "Nombre del punto",
                                  )}
                                </label>
                                {/* El servidor corta en 200 y responde 400.
                                  Sin tope, pegar un texto largo devolvía
                                  «Internal server error» en inglés: un fallo
                                  del cliente disfrazado de avería nuestra. */}
                                <input
                                  autoFocus
                                  className={FIELD_CLS_LG}
                                  maxLength={200}
                                  placeholder={
                                    t(
                                      "station.siteTours.cpPlaceholder",
                                      "Ej. Entrada principal",
                                    ) as string
                                  }
                                  value={cpName}
                                  onChange={(e) => setCpName(e.target.value)}
                                />
                              </div>
                              <CheckpointLocationPicker
                                lat={cpLat}
                                lng={cpLng}
                                radius={cpRadius}
                                onChange={(la, ln, r) => {
                                  setCpLat(la);
                                  setCpLng(ln);
                                  setCpRadius(r);
                                }}
                                // Con el puesto como referencia, el mapa dice «a
                                // 34 m del puesto»: la comprobación que importa
                                // aquí, porque una dirección postal no distingue
                                // el vestíbulo de la azotea y una distancia sí.
                                reference={
                                  stationLat != null && stationLng != null
                                    ? {
                                        lat: stationLat,
                                        lng: stationLng,
                                        label: t("ui.StationSiteTours.elPuesto", "la estación"),
                                      }
                                    : null
                                }
                              />
                              {stationLat != null && stationLng != null && (
                                <button
                                  className="inline-flex items-center gap-1.5 text-xs brand-text hover:underline"
                                  onClick={() => {
                                    setCpLat(stationLat);
                                    setCpLng(stationLng);
                                  }}
                                >
                                  <Crosshair size={13} />{" "}
                                  {t(
                                    "station.siteTours.useStationLoc",
                                    "Usar ubicación de la estación",
                                  )}
                                </button>
                              )}
                              <div className="flex justify-end gap-2 pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setAddingFor(null)}
                                >
                                  {t("common.cancel", "Cancelar")}
                                </Button>
                                <Button
                                  className="gap-1.5"
                                  disabled={savingCp || !cpName.trim()}
                                  size="sm"
                                  variant="brand"
                                  onClick={() => createCheckpoint(id)}
                                >
                                  {savingCp && (
                                    <Loader2
                                      className="animate-spin"
                                      size={14}
                                    />
                                  )}{" "}
                                  {t("common.save", "Guardar")}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/50 px-3 py-1.5 text-sm font-medium brand-text hover:bg-primary/5"
                              onClick={() => openAddCheckpoint(id)}
                            >
                              <Plus size={15} />{" "}
                              {t(
                                "station.siteTours.addPoint",
                                "Agregar punto de control",
                              )}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ── EL MODAL SUELTO SE QUEDABA A MEDIAS ────────────────────────────
           Este modal creaba la ronda VACÍA y ahí terminaba: después había que
           desplegarla y añadir cada punto de uno en uno. Montar una ronda de
           ocho puntos eran diecisiete idas y venidas, y el resultado corriente
           era una ronda creada «para después» que nunca llegó a tener puntos —
           y una ronda sin puntos no avisa de nada.
           El asistente la crea entera, con plantillas, y termina ofreciendo
           imprimir los códigos, que es el trabajo que de verdad queda. */}
      <RondaWizard
        open={showNewTour}
        postSiteId={postSiteId}
        stationId={stationId}
        stationLat={stationLat}
        stationLng={stationLng}
        stationName={station?.nickname || station?.stationName || null}
        stationRadius={stationRadius}
        tenantId={tenantId}
        onCreated={() => loadTours()}
        onOpenChange={setShowNewTour}
        onPrint={() => {
          /* La pestaña va en la RUTA, no en la cadena de consulta:
             /post-sites/:postSiteId/stations/:stationId/:tab
             Se reemplaza el último segmento, que es el de la pestaña actual. */
          const partes = window.location.pathname
            .replace(/\/+$/, "")
            .split("/");
          const i = partes.indexOf("stations");

          if (i >= 0 && partes.length > i + 1) {
            const base = partes.slice(0, i + 2).join("/");

            navigate(`${base}/etiquetas`);
          }
        }}
      />

      {/* Settings modal */}
      <Modal
        icon={<Settings className="h-5 w-5" />}
        open={showSettings}
        size="lg"
        title={t(
          "station.siteTours.settingsTitle",
          "Configuraciones de Rondas",
        )}
        onOpenChange={(o) => {
          if (!o) setShowSettings(false);
        }}
      >
        <RondaSettingsForm
          postSiteId={postSiteId}
          onSaved={() => setShowSettings(false)}
        />
      </Modal>
    </>
  );
}
