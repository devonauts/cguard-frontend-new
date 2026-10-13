/**
 * Vista de tarjetas de vigilantes (conmutador Tarjetas ⇄ Lista en
 * SecurityGuardsPage), al mismo estilo que las tarjetas de clientes. Cada
 * tarjeta: avatar de cristal, nombre → detalle, estado, correo/teléfono y su
 * asignación (estación). El menú de acciones se inyecta desde la página (mismos
 * handlers que la tabla) para no duplicar la lógica.
 *
 * Las tarjetas se repiten: llevan `glass-flat` (mismo aspecto, sin desenfoque),
 * nunca `glass` — una rejilla con desenfoque por tarjeta tumba el desplazamiento.
 */
import {
  EllipsisVertical,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import GuardRatingLevel from "./GuardRatingLevel";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StatusBadge,
  SkeletonCards,
  EmptyState,
  SmartImage,
} from "@/components/kit";

/**
 * Dónde está asignado un vigilante. Sale de `guardAssignment` —la fuente única
 * de la asignación— y no de los turnos que esa asignación genera.
 */
export type AsignacionVigilante = {
  stationId: string;
  stationName: string;
  /** El «nominativo» de la estación. Manda como etiqueta, igual que en la
   *  vista de estaciones (ver `stations/StationCardsGrid`). */
  nickname: string;
  postSiteId?: string | null;
  postSiteName?: string;
  isTemporary?: boolean;
  /** Cuántas estaciones MÁS tiene asignadas (relevos, coberturas). */
  extra?: number;
  /** No es su plaza: es dónde está CUBRIENDO hoy. El relevo no tiene
   *  asignación —cubre los puestos según hagan falta—, así que su puesto sale
   *  del turno del día. Se marca para no confundirlo con un fijo. */
  esCobertura?: boolean;
};

export type GuardCardAction = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
};

/** A stored image descriptor (avatar/profile photo). */
interface ImgFile {
  downloadUrl?: string;
  publicUrl?: string;
}

/** Raw API securityGuard record carried on the normalized row for detail lookups. */
interface GuardCardRaw {
  id?: string;
  guard?: { id?: string };
  guardId?: string;
  userId?: string;
  // Dynamic: may be a string URL, a single {downloadUrl,publicUrl} object, or an array of them.
  profileImage?: string | ImgFile | ImgFile[];
  photoUrl?: string;
  /** Archivado AL TERMINAR UN EVENTO (no una baja): de cuál. */
  archivadoTrasEvento?: { id: string; nombre: string } | null;
  [key: string]: unknown;
}

/** Normalized display row produced by SecurityGuardsPage.normalizeGuard. */
export interface GuardRow {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  raw?: GuardCardRaw;
}

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = {
  Activo: "ok",
  Pendiente: "warn",
  Archivado: "neutral",
};

export default function GuardCardsGrid({
  guards,
  stationByUserId,
  ratings,
  onOpenReviews,
  loading,
  selectedIds,
  onSelect,
  onOpen,
  actions,
}: {
  guards: GuardRow[];
  stationByUserId: Record<string, AsignacionVigilante>;
  ratings?: Record<string, { average: number; count: number }>;
  onOpenReviews?: (guardId: string) => void;
  loading: boolean;
  selectedIds: string[];
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (guard: GuardRow) => void;
  actions: (guard: GuardRow) => GuardCardAction[];
}) {
  const { t } = useTranslation();

  if (loading)
    return (
      <SkeletonCards
        className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        count={8}
      />
    );
  if (!guards.length) {
    return (
      <EmptyState
        description={t("ui.GuardCardsGrid.creaTuPrimerVigilanteCon")}
        icon={<ShieldCheck />}
        title={t("ui.GuardCardsGrid.sinVigilantes")}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {guards.map((g, i) => {
        const name = g.name || "—";
        const userId =
          g.raw?.guard?.id || g.raw?.guardId || g.raw?.userId || "";
        const asignacion = stationByUserId[userId] || null;
        const pi = g.raw?.profileImage;
        const photoFromPi = Array.isArray(pi)
          ? pi[0]?.downloadUrl || pi[0]?.publicUrl || null
          : typeof pi === "string"
            ? pi
            : pi?.downloadUrl || pi?.publicUrl || null;
        const photo = photoFromPi || g.raw?.photoUrl || null;
        const acts = actions(g);
        const tone = STATUS_TONE[g.status ?? ""] || "neutral";
        const realId = g.raw?.id || g.id;
        const rating = ratings?.[realId];

        return (
          <div
            key={g.id}
            className="glass-flat glass-hover cg-focus group relative flex cursor-pointer flex-col p-4 animate-in fade-in slide-in-from-bottom-2"
            role="button"
            style={{
              animationDelay: `${Math.min(i, 12) * 30}ms`,
              animationFillMode: "backwards",
            }}
            tabIndex={0}
            onClick={() => onOpen(g)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(g);
            }}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  aria-label={t("guards.list.selectAria", { defaultValue: "Seleccionar {{name}}", name })}
                  checked={selectedIds.includes(g.id)}
                  onCheckedChange={(v) => onSelect(g.id, Boolean(v))}
                />
              </div>
              <SmartImage
                alt={name}
                className="h-12 w-12 shrink-0 border"
                fallback={
                  <span
                    className="grid h-full w-full place-items-center text-lg font-bold"
                    style={{
                      background: "var(--brand-wash)",
                      color: "var(--brand-text)",
                    }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>
                }
                rounded="rounded-full"
                src={photo}
                style={{ borderColor: "var(--hairline)" }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight transition-colors group-hover:[color:var(--brand-text)]">
                  {name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={tone}>
                    {g.status === "Activo"
                      ? t("common.active", "Activo")
                      : g.status === "Archivado"
                        ? t("adminOfficeUsers.statuses.archived", "Archivado")
                        : g.status === "Pendiente" || g.status === "Invitado"
                          ? t("comun.pendiente", "Pendiente")
                          : g.status}
                  </StatusBadge>
                  {g.status === "Archivado" &&
                    g.raw?.archivadoTrasEvento && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("guards.list.archivadoTras", {
                          defaultValue: "Archivado tras {{evento}}",
                          evento: g.raw.archivadoTrasEvento.nombre,
                        })}
                      </span>
                    )}
                  {rating && (
                    <GuardRatingLevel
                      average={rating.average}
                      count={rating.count}
                      onClick={
                        onOpenReviews ? () => onOpenReviews(realId) : undefined
                      }
                    />
                  )}
                </div>
              </div>
              {acts.length > 0 && (
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="h-8 w-8 shrink-0"
                        size="icon"
                        variant="ghost"
                      >
                        <EllipsisVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {acts.map((a) => (
                        <DropdownMenuItem
                          key={a.label}
                          className={
                            a.destructive
                              ? "text-destructive focus:text-destructive"
                              : undefined
                          }
                          onClick={a.onClick}
                        >
                          {a.icon}
                          <span className={a.icon ? "ml-2" : undefined}>
                            {a.label}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            <div
              className="mt-3 space-y-1 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              {g.email && (
                <p className="flex items-center gap-1.5 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{g.email}</span>
                </p>
              )}
              {g.phone && (
                <p className="flex items-center gap-1.5 truncate">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{g.phone}</span>
                </p>
              )}
            </div>

            <div
              className="mt-3 flex items-center gap-1.5 border-t pt-3 text-sm"
              style={{
                borderColor: "var(--hairline)",
                color: "var(--ink-soft)",
              }}
            >
              <MapPin className="brand-text h-4 w-4 shrink-0" />
              {asignacion ? (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  {/* El nominativo manda; el nombre del puesto va detrás
                                        en tinta suave, como en la vista de estaciones. */}
                  <span
                    className="truncate font-medium"
                    style={{ color: "var(--ink)" }}
                  >
                    {asignacion.nickname || asignacion.stationName}
                  </span>
                  {asignacion.nickname && asignacion.stationName && (
                    <span className="truncate text-xs">
                      {asignacion.stationName}
                    </span>
                  )}
                  {asignacion.esCobertura && (
                    /* No es su plaza: hoy está cubriendo ahí. Sin decirlo, la
                       tarjeta de un relevo se leería igual que la de un fijo
                       de ese puesto. */
                    <span
                      className="shrink-0 text-xs"
                      style={{ color: "var(--ink-faint)" }}
                      title={t(
                        "ui.GuardCardsGrid.cubriendoHoy",
                        "Cubriendo hoy — no es su puesto fijo",
                      )}
                    >
                      · {t("comun.cobertura", "cobertura")}
                    </span>
                  )}
                  {!!asignacion.extra && (
                    <span
                      className="shrink-0 text-xs"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      +{asignacion.extra}
                    </span>
                  )}
                </span>
              ) : (
                <span>
                  {t("ui.GuardCardsGrid.sinAsignacion", "Sin asignación")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
