/**
 * Hero de la estación (puesto de vigilancia) — visible en todas las pestañas.
 * Identidad + contexto (cliente y sitio con enlaces de regreso), horario y
 * geocerca como chips, RENOMBRAR inline (no existía forma de renombrar una
 * estación en el CRM), vigilantes asignados y quién está de turno AHORA.
 */
import type { Station } from "@/types";
import type { RecentShiftRow } from "../stationDetailTypes";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Shield,
  Smartphone,
  Clock,
  MapPin,
  Pencil,
  Check,
  X,
  Users,
  Route as RouteIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, FadeIn, IconTile } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import { invalidateEntity } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/usePermissions";

interface StationDetail extends Station {
  name?: string;
  nickname?: string;
  isMobile?: boolean;
  geofencePolygon?: unknown[] | null;
  geofenceRadius?: number | string | null;
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
}

// Cada vigilante recibe un tinte estable derivado del acento del usuario: el
// mismo tono rotado. Así dos iniciales se distinguen sin escribir un color, y
// todo el corrillo se repinta si se cambia el acento.
const HUE_STEPS = [0, 200, 45, 250, 100, 310, 155, 25];

function hueStepFor(name: string): number {
  let h = 0;

  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;

  return HUE_STEPS[h % HUE_STEPS.length];
}

// Constante de módulo: guarda la CLAVE, nunca llama a t() (se evaluaría al
// cargar el fichero y congelaría el idioma). Las claves son las mismas que usa
// StationCardsGrid: es el mismo dato pintado en dos sitios.
const SCHEDULE_LABEL: Record<string, { label: string; labelKey: string }> = {
  "24h": { label: "24 horas", labelKey: "station.schedule.24h" },
  "12h-day": { label: "12h diurno", labelKey: "station.schedule.12h-day" },
  "12h-night": {
    label: "12h nocturno",
    labelKey: "station.schedule.12h-night",
  },
  custom: { label: "Personalizado", labelKey: "station.schedule.custom" },
};

export default function StationHero({
  station,
  stationId,
  postSiteId,
  onRenamed,
  onNicknameChanged,
  recentShifts,
}: {
  station: StationDetail;
  stationId: string;
  postSiteId: string;
  onRenamed: (name: string) => void;
  onNicknameChanged: (nickname: string | null) => void;
  /* Marcaciones recientes del puesto, leídas UNA vez por `StationDetailPage`.
     Antes las pedía esta cabecera por su cuenta con exactamente la misma url
     que el resumen de debajo, así que abrir el puesto sacaba dos
     `GET /guard-shift` idénticas. `null` = todavía cargando. */
  recentShifts: RecentShiftRow[] | null;
}) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("stationEdit");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState("");
  const [savingNick, setSavingNick] = useState(false);

  const name = station?.stationName || station?.name || "Puesto";
  const guards: { id: string; name: string }[] = useMemo(
    () =>
      (station?.assignedGuards || []).map((u: any) => ({
        id: u.id,
        name:
          u.fullName ||
          [u.firstName, u.lastName].filter(Boolean).join(" ") ||
          "—",
      })),
    [station],
  );

  // Quién está de turno AHORA: las marcaciones de este puesto que no tienen
  // salida. Sale de las filas que ya trae la página, sin pedir nada.
  const onDuty = useMemo(
    () =>
      recentShifts === null
        ? null
        : recentShifts
            .filter((r) => !r.punchOutTime)
            .map((r) => ({
              id: r.id || "",
              name: r.guardName?.fullName || "Vigilante",
              since: r.punchInTime || undefined,
            })),
    [recentShifts],
  );

  const saveRename = async () => {
    const newName = draft.trim();

    if (!newName || newName === name) {
      setEditing(false);

      return;
    }
    setSaving(true);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";

      await ApiService.put(`/tenant/${tenantId}/station/${stationId}`, {
        data: { stationName: newName },
      });
      invalidateEntity("stations");
      onRenamed(newName);
      toast.success(t("ui.StationHero.puestoRenombrado"));
      setEditing(false);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("ui.StationHero.errorRenombrar", "No se pudo renombrar"),
      );
    } finally {
      setSaving(false);
    }
  };

  /* El nominativo se guarda aparte del nombre del puesto: son dos datos que el
     operador cambia por separado. Vacío guarda `null` a propósito, para poder
     QUITAR un nominativo puesto por error. */
  const saveNickname = async () => {
    const nuevo = nickDraft.trim();

    if (nuevo === (station?.nickname || "")) {
      setEditingNick(false);

      return;
    }
    setSavingNick(true);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";

      await ApiService.put(`/tenant/${tenantId}/station/${stationId}`, {
        data: { nickname: nuevo || null },
      });
      invalidateEntity("stations");
      onNicknameChanged(nuevo || null);
      toast.success(t("ui.StationHero.nominativoGuardado"));
      setEditingNick(false);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "ui.StationHero.errorNominativo",
            "No se pudo guardar el nominativo",
          ),
      );
    } finally {
      setSavingNick(false);
    }
  };

  return (
    <FadeIn>
      <div className="glass relative mb-4 overflow-hidden p-4 md:p-5">
        {/* El halo del acento va DETRÁS del cristal: es lo que el desenfoque
                    difumina para que la cabecera tenga profundidad. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, var(--brand) 0%, transparent 70%)",
            opacity: 0.16,
          }}
        />
        {/* El contexto cliente → sede vive ahora en el breadcrumb del layout. */}
        <div className="relative flex flex-wrap items-start gap-4">
          <IconTile size="lg">
            {station?.isMobile ? <Smartphone /> : <Shield />}
          </IconTile>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {editing ? (
                <div className="flex w-full min-w-0 items-center gap-1.5">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename();
                      if (e.key === "Escape") setEditing(false);
                    }}
                    autoFocus
                    /* En un teléfono el campo se queda con lo que
                                           sobra tras los dos botones; los 256 px fijos
                                           sacaban la fila fuera de la pantalla. */
                    className="h-9 w-full min-w-0 font-semibold sm:w-64 sm:flex-none"
                  />
                  <Button
                    className="h-9 w-9"
                    disabled={saving}
                    size="icon"
                    variant="brand"
                    onClick={saveRename}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-9 w-9"
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  {/* `min-w-0`: sin él un hijo flex no baja de su
                                        contenido y el `truncate` no llega a actuar. */}
                  <h2 className="font-display min-w-0 truncate text-xl font-bold leading-tight">
                    {name}
                  </h2>
                  {canEdit && (
                    <button
                      aria-label={t("ui.StationHero.renombrarPuesto")}
                      className="cg-btn-ghost cg-focus rounded-md p-1"
                      onClick={() => {
                        setDraft(name);
                        setEditing(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
              {editingNick ? (
                <div className="flex w-full min-w-0 items-center gap-1.5">
                  <Input
                    value={nickDraft}
                    onChange={(e) => setNickDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveNickname();
                      if (e.key === "Escape") setEditingNick(false);
                    }}
                    autoFocus
                    aria-label={t(
                      "postSites.stations.form.nickname",
                      "Nominativo",
                    )}
                    placeholder={t(
                      "postSites.stations.form.nickname",
                      "Nominativo",
                    )}
                    className="h-9 w-full min-w-0 sm:w-44 sm:flex-none"
                  />
                  <Button
                    className="h-9 w-9"
                    disabled={savingNick}
                    size="icon"
                    variant="brand"
                    onClick={saveNickname}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    className="h-9 w-9"
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditingNick(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  {station?.nickname && (
                    <StatusBadge tone="neutral">{station.nickname}</StatusBadge>
                  )}
                  {/* Sin nominativo la etiqueta no se pintaba, así que no había
                      ni pista de que el dato existiera: de ahí el «+». */}
                  {canEdit &&
                    (station?.nickname ? (
                      <button
                        aria-label={t("ui.StationHero.editarNominativo")}
                        className="cg-btn-ghost cg-focus rounded-md p-1"
                        onClick={() => {
                          setNickDraft(station.nickname || "");
                          setEditingNick(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        className="cg-btn-ghost cg-focus text-muted rounded-md px-2 py-1 text-xs"
                        onClick={() => {
                          setNickDraft("");
                          setEditingNick(true);
                        }}
                      >
                        {"+ "}
                        {t("postSites.stations.form.nickname", "Nominativo")}
                      </button>
                    ))}
                </>
              )}
              {station?.isMobile && (
                <StatusBadge tone="warn">
                  {t("ui.StationHero.puestoMovil", "Puesto móvil")}
                </StatusBadge>
              )}
            </div>

            <div
              className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {station?.startingTimeInDay || station?.finishTimeInDay
                  ? `${station?.startingTimeInDay || "?"} – ${station?.finishTimeInDay || "?"}`
                  : (() => {
                      const h = SCHEDULE_LABEL[station?.scheduleType || ""];

                      return h
                        ? t(h.labelKey, h.label)
                        : t(
                            "station.schedule.undefined",
                            "Horario sin definir",
                          );
                    })()}
              </span>
              {!station?.isMobile && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Geocerca:{" "}
                  {Array.isArray(station?.geofencePolygon) &&
                  station.geofencePolygon.length >= 3
                    ? "polígono"
                    : `${station?.geofenceRadius || 100} m`}
                </span>
              )}
            </div>

            {/* De turno AHORA */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              {onDuty === null ? null : onDuty.length ? (
                <span
                  className="flex items-center gap-1.5 font-medium"
                  style={{ color: "var(--ok-text)" }}
                >
                  <span
                    className="cc-dot"
                    style={{ background: "var(--ok)" }}
                  />
                  De turno ahora: {onDuty.map((g) => g.name).join(", ")}
                </span>
              ) : (
                <span
                  className="flex items-center gap-1.5"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ background: "var(--ink-faint)" }}
                  />
                  {t(
                    "ui.StationHero.nadieDeTurnoEnEsteMomento",
                    "Nadie de turno en este momento",
                  )}
                </span>
              )}

              {guards.length > 0 && (
                <span
                  className="flex items-center gap-2"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <span className="flex -space-x-1.5">
                    {guards.slice(0, 6).map((g) => {
                      const paso = hueStepFor(g.name);

                      return (
                        <span
                          key={g.id}
                          className="flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                          style={{
                            borderColor: "var(--glass-solid)",
                            backgroundColor: `color-mix(in oklab, oklch(from var(--brand) l c calc(h + ${paso})) 22%, transparent)`,
                            color: `oklch(from var(--brand-text) l c calc(h + ${paso}))`,
                          }}
                          title={g.name}
                        >
                          {g.name.charAt(0).toUpperCase()}
                        </span>
                      );
                    })}
                  </span>
                  {guards.length} asignado(s)
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                to={`/post-sites/${postSiteId}/stations/${stationId}/site-tours`}
              >
                <RouteIcon className="mr-1.5 h-4 w-4" />
                Rondas
              </Link>
            </Button>
            <Button asChild size="sm" variant="brand">
              <Link
                to={`/post-sites/${postSiteId}/stations/${stationId}/guards`}
              >
                <Users className="mr-1.5 h-4 w-4" />
                Vigilantes
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </FadeIn>
  );
}
