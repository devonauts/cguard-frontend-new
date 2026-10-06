import type { Client } from "@/types/client";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  AvisoDePuesta,
  type PasoDePuesta,
} from "@/components/onboarding/PuestaEnMarcha";
import { Link, useNavigate } from "react-router-dom";
import {
  MapPin,
  Building2,
  Shield,
  AlertTriangle,
  Route as RouteIcon,
  UserRound,
  Phone,
  Mail,
  ChevronRight,
  Bell,
  Activity,
  FileCheck,
  ShieldCheck,
  LogIn,
  LogOut,
  UserCheck,
  UserX,
  CheckCircle2,
  Repeat,
} from "lucide-react";

import { TabTable, THead, Th, Tr } from "../_shared/tab-kit";

import { clientDisplayName } from "@/lib/clientName";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import SitesMap from "@/components/maps/SitesMap";
import { clientService } from "@/lib/api/clientService";
import { Section, EmptyState, StatusBadge, IconTile } from "@/components/kit";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

// ── Shapes from the overview / operation / activity / contacts endpoints ──
interface StationLite {
  id: string;
  guards?: Array<{ id: string }>;
}
// Unified-activity event (clientAccountActivity.ts).
interface ActivityEvent {
  id: string;
  type: string;
  at: string;
  title: string;
  subtitle: string | null;
  actor: string | null;
  tone: string;
}
// A client contact row (contacts endpoint) — many optional label fields.
interface ContactLite {
  id?: string;
  name?: string;
  fullName?: string;
  description?: string;
  role?: string;
  position?: string;
  mobile?: string;
  phone?: string;
  email?: string;
}

// Icono + tono del sistema por tipo de evento de la actividad unificada.
type Tono = "brand" | "neutral" | "ok" | "warn" | "bad" | "info";
const ACT_META: Record<string, { icon: LucideIcon; tone: Tono }> = {
  clock_in: { icon: LogIn, tone: "ok" },
  clock_out: { icon: LogOut, tone: "neutral" },
  incident: { icon: AlertTriangle, tone: "warn" },
  visitor_in: { icon: UserCheck, tone: "info" },
  visitor_out: { icon: UserX, tone: "neutral" },
  task_done: { icon: CheckCircle2, tone: "ok" },
  ronda_done: { icon: RouteIcon, tone: "brand" },
  passdown: { icon: Repeat, tone: "info" },
};

type Overview = {
  postSitesCount: number;
  stationsCount: number;
  projectsCount: number;
  assignedCount: number;
  onsiteCount: number;
  toursLast7Days: number;
  tasksLast7Days: number;
  incidentsLast7Days: number;
  hoursLoggedSeconds: number;
  incidentsBySite?: Record<string, number>;
};
type Site = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  active?: boolean;
  latitud?: number | string | null;
  longitud?: number | string | null;
  stations: StationLite[];
};

const fmtTime = (d: string | number | Date) => {
  const dt = new Date(d);

  return Number.isNaN(dt.getTime())
    ? ""
    : dt.toLocaleTimeString(localeActual(), {
        timeZone: zonaDeLaEmpresa(),
        hour: "2-digit",
        minute: "2-digit",
      });
};
const fmtDateTime = (d: string | number | Date) => {
  const dt = new Date(d);

  return Number.isNaN(dt.getTime())
    ? ""
    : dt.toLocaleString(localeActual(), {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export default function ClientOverview({
  client,
}: {
  client: Client & {
    lat?: number | string;
    lng?: number | string;
    latitude?: number | string;
    longitude?: number | string;
  };
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  const [ov, setOv] = useState<Overview>({
    postSitesCount: 0,
    stationsCount: 0,
    projectsCount: 0,
    assignedCount: 0,
    onsiteCount: 0,
    toursLast7Days: 0,
    tasksLast7Days: 0,
    incidentsLast7Days: 0,
    hoursLoggedSeconds: 0,
  });
  const [sites, setSites] = useState<Site[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!client?.id) return;
      const [o, op, c, act] = await Promise.all([
        clientService.getClientOverview(client.id).catch(() => null),
        clientService
          .getOperation(client.id)
          .catch(() => ({ sites: [], looseStations: [] })),
        clientService
          .getClientContacts(client.id, { limit: 50, offset: 0 })
          .catch(() => null),
        clientService
          .getClientActivity(client.id, { limit: 12 })
          .catch(() => ({ rows: [] })),
      ]);

      if (!mounted) return;
      if (o) setOv((prev) => ({ ...prev, ...o }));
      const allSites: Site[] = [...(op?.sites || [])];

      if (op?.looseStations?.length) {
        allSites.push({
          id: "__loose__",
          name: t("clients.overview.otherStations", "Estaciones sin sede"),
          stations: op.looseStations,
        });
      }
      setSites(allSites);
      setContacts(Array.isArray(c) ? c : (c?.rows ?? []));
      setActivity(Array.isArray(act?.rows) ? act.rows : []);
    })();

    return () => {
      mounted = false;
    };
  }, [client?.id]);

  const lat = Number(client?.latitude ?? client?.lat);
  const lng = Number(client?.longitude ?? client?.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const base = `/clients/${client?.id}`;
  const isPJ = client?.personType === "PJ";
  const primary = contacts[0] || null;

  // Per-site rollups for the "Estado de sedes" table. Incident counts come
  // from the overview endpoint's REAL 7-day aggregate keyed by postSiteId —
  // the old logic counted inside the last-8 feed matched by NAME, so a busy
  // sede systematically showed 0.
  const incidentsBySite: Record<string, number> = ov.incidentsBySite || {};
  const siteRows = sites.map((s) => {
    const guards = new Set<string>();

    (s.stations || []).forEach((st) =>
      (st.guards || []).forEach((g) => guards.add(String(g.id))),
    );
    const incCount = incidentsBySite[String(s.id)] ?? 0;

    return {
      id: s.id,
      name: s.name,
      address: s.address || s.city || "",
      stations: (s.stations || []).length,
      guards: guards.size,
      incidents: incCount,
      estado: guards.size > 0 ? "operativa" : "sin-operacion",
    };
  });

  // Las sedes que el mapa puede pintar. Se arma sobre `sites` (que trae las
  // coordenadas) y se le pegan los recuentos ya calculados arriba, para que la
  // chincheta y la fila de la tabla digan exactamente lo mismo.
  const sedesEnMapa = sites
    .filter((s) => s.id !== "__loose__")
    .map((s) => {
      const fila = siteRows.find((r) => r.id === s.id);

      return {
        id: String(s.id),
        name: s.name,
        address: s.address ?? null,
        city: s.city ?? null,
        lat: s.latitud ?? null,
        lng: s.longitud ?? null,
        stations: fila?.stations ?? 0,
        guards: fila?.guards ?? 0,
      };
    });
  // Cuántas de ellas tienen de verdad coordenadas: es el número honesto para la
  // cabecera del mapa. Contar todas las sedes prometería chinchetas que no hay.
  const sedesUbicadas = sedesEnMapa.filter(
    (s) =>
      Number.isFinite(Number(s.lat)) &&
      Number.isFinite(Number(s.lng)) &&
      Number(s.lat) !== 0 &&
      Number(s.lng) !== 0,
  ).length;

  // Real, derived alerts (no fabricated numbers).
  const alerts: {
    icon: ReactNode;
    label: string;
    sub: string;
    tone: string;
  }[] = [];
  const uncovered = siteRows.filter(
    (s) => s.estado === "sin-operacion" && s.id !== "__loose__",
  );

  if (uncovered.length)
    alerts.push({
      icon: <Shield />,
      label: t("clients.overview.alerts.uncovered", "Sedes sin cobertura"),
      sub:
        uncovered
          .map((s) => s.name)
          .slice(0, 2)
          .join(", ") + (uncovered.length > 2 ? "…" : ""),
      tone: "crit",
    });
  if (ov.incidentsLast7Days > 0)
    alerts.push({
      icon: <AlertTriangle />,
      label: t("clients.overview.alerts.openIncidents", "Incidentes recientes"),
      sub: `${ov.incidentsLast7Days} ${t("clients.overview.alerts.last7", "en los últimos 7 días")}`,
      tone: "att",
    });
  if (ov.projectsCount > 0)
    alerts.push({
      icon: <FileCheck />,
      label: t("clients.overview.alerts.projects", "Proyectos activos"),
      sub: `${ov.projectsCount} ${t("clients.overview.alerts.inProgress", "en curso")}`,
      tone: "info",
    });

  /**
   * PUESTA EN MARCHA. El alta del cliente crea su primera sede, pero sin
   * servicio, sin puestos y sin gente. Mientras falte algo, la ficha lo dice
   * arriba y lleva al paso que toca; cuando está todo, el aviso desaparece.
   */
  const sedesReales = sites.filter((s) => s.id !== "__loose__");
  const primera = sedesReales[0] as
    | (Site & { setup?: { pending?: boolean } })
    | undefined;
  const sedeLista =
    sedesReales.length > 0 &&
    !sedesReales.some((s) => (s as any).setup?.pending);
  const estaciones = sedesReales.flatMap((s) => s.stations || []);
  const conGente = estaciones.some((st) => (st.guards || []).length > 0);
  const pasosDePuesta: PasoDePuesta[] = [
    { clave: "cliente", hecho: true, href: `/clients/${client?.id}/profile` },
    {
      clave: "sede",
      hecho: sedeLista,
      href: primera
        ? `/post-sites/${primera.id}/edit?step=1&puesta=1`
        : `/post-sites/new?clientId=${client?.id}`,
      detalle: sedesReales.length
        ? undefined
        : t("clients.overview.sinSede", "sin sede todavía"),
    },
    {
      clave: "puestos",
      hecho: estaciones.length > 0,
      href: primera
        ? `/post-sites/${primera.id}/stations/new?puesta=1`
        : undefined,
      detalle: estaciones.length
        ? t("clients.overview.nPuestos", {
            defaultValue: "{{n}} puestos",
            n: estaciones.length,
          })
        : undefined,
    },
    {
      clave: "vigilantes",
      hecho: conGente,
      href: primera ? `/post-sites/${primera.id}/stations` : undefined,
    },
    {
      clave: "horario",
      hecho: conGente,
      href: `/planificador?busca=${encodeURIComponent(clientDisplayName(client, ""))}`,
    },
  ];

  return (
    <div ref={containerRef} className="space-y-4">
      <AvisoDePuesta pasos={pasosDePuesta} />
      {/* Two columns: operations (map + sites table) · contact + alerts + activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section
            action={
              sedesUbicadas > 0 ? (
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {sedesUbicadas === 1
                    ? t("clients.overview.mapSedesOne", "1 sede ubicada")
                    : t(
                        "clients.overview.mapSedes",
                        "{{count}} sedes ubicadas",
                        { count: sedesUbicadas },
                      )}
                </span>
              ) : undefined
            }
            icon={<MapPin />}
            title={t("clients.overview.opsMap", "Mapa de operaciones")}
          >
            {/* `key` por cliente: al pasar de un cliente a otro el mapa se monta
                de cero. Sin esto se reaprovechaba la instancia y quedaba la
                chincheta del cliente anterior mientras llegaban los datos. */}
            <SitesMap
              key={client?.id}
              clienteFallback={
                hasCoords
                  ? {
                      lat,
                      lng,
                      label: clientDisplayName(
                        client,
                        t(
                          "ui.ClientOverview.ubicacionDelCliente",
                          "Ubicación del cliente",
                        ),
                      ),
                    }
                  : null
              }
              height="300px"
              sedes={sedesEnMapa}
              textoVacio={
                t(
                  "clients.overview.noLocation",
                  "Sin ubicación registrada",
                ) as string
              }
              onSedeClick={(sedeId) =>
                navigate(`/post-sites/${sedeId}/overview`)
              }
            />
          </Section>

          <Section
            action={
              <Link
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--brand-text)" }}
                to={`${base}/post-sites`}
              >
                {t("common.viewAll", "Ver todas")}
              </Link>
            }
            icon={<Building2 />}
            title={t("clients.overview.sedesStatus", "Estado de sedes")}
          >
            {siteRows.length === 0 ? (
              <EmptyState
                description={
                  t(
                    "clients.overview.noSedesHint",
                    "Crea la primera sede de este cliente.",
                  ) as string
                }
                icon={<Building2 />}
                title={
                  t(
                    "clients.overview.noSedes",
                    "Sin sedes registradas",
                  ) as string
                }
              />
            ) : (
              <TabTable minWidth={520}>
                <THead>
                  <Th>{t("clients.overview.tbl.sede", "Sede")}</Th>
                  <Th>{t("clients.overview.tbl.stations", "Estaciones")}</Th>
                  <Th>{t("clients.overview.tbl.guards", "Vigilantes")}</Th>
                  <Th>{t("clients.overview.tbl.status", "Estado")}</Th>
                  <Th align="right">
                    {t("clients.overview.tbl.incidents", "Incidentes")}
                  </Th>
                </THead>
                <tbody>
                  {siteRows.map((s) => (
                    <Tr
                      key={s.id}
                      onClick={
                        s.id !== "__loose__"
                          ? () => navigate(`${base}/post-sites`)
                          : undefined
                      }
                    >
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <Building2
                            className="h-4 w-4 shrink-0"
                            style={{ color: "var(--ink-faint)" }}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {s.name}
                            </p>
                            {s.address && (
                              <p
                                className="truncate text-[11px]"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                {s.address}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td
                        className="px-2 py-2.5 tabular-nums"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {s.stations}
                      </td>
                      <td
                        className="px-2 py-2.5 tabular-nums"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {s.guards}
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge
                          dot={false}
                          tone={s.estado === "operativa" ? "ok" : "neutral"}
                        >
                          {s.estado === "operativa"
                            ? t(
                                "clients.overview.status.operativa",
                                "Operativa",
                              )
                            : t(
                                "clients.overview.status.sinOp",
                                "Sin operación",
                              )}
                        </StatusBadge>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        <span
                          className={s.incidents > 0 ? "font-semibold" : ""}
                          style={{
                            color:
                              s.incidents > 0
                                ? "var(--bad-text)"
                                : "var(--ink-faint)",
                          }}
                        >
                          {s.incidents}
                        </span>
                      </td>
                    </Tr>
                  ))}
                </tbody>
              </TabTable>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          {/* Persona de contacto */}
          <Section
            action={
              <Link
                className="text-xs font-semibold hover:underline"
                style={{ color: "var(--brand-text)" }}
                to={`${base}/contacts`}
              >
                {t("common.viewAll", "Ver todos")}
              </Link>
            }
            icon={<UserRound />}
            title={t(
              "clients.overview.contactPerson.title",
              "Persona de contacto",
            )}
          >
            {primary ? (
              <div className="space-y-2.5">
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {primary.name || primary.fullName || "—"}
                  </p>
                  {(primary.description ||
                    primary.role ||
                    primary.position) && (
                    <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      {primary.description || primary.role || primary.position}
                    </p>
                  )}
                </div>
                {(primary.mobile || primary.phone) && (
                  <a
                    className="flex items-center gap-2 text-sm text-foreground hover:underline"
                    href={`tel:${primary.mobile || primary.phone}`}
                  >
                    <Phone
                      className="h-4 w-4"
                      style={{ color: "var(--ink-faint)" }}
                    />{" "}
                    {primary.mobile || primary.phone}
                  </a>
                )}
                {primary.email && (
                  <a
                    className="flex items-center gap-2 text-sm text-foreground hover:underline"
                    href={`mailto:${primary.email}`}
                  >
                    <Mail
                      className="h-4 w-4"
                      style={{ color: "var(--ink-faint)" }}
                    />{" "}
                    <span className="truncate">{primary.email}</span>
                  </a>
                )}
                {contacts.length > 1 && (
                  <p
                    className="border-t pt-2 text-xs"
                    style={{
                      borderColor: "var(--hairline)",
                      color: "var(--ink-soft)",
                    }}
                  >
                    +{contacts.length - 1}{" "}
                    {t(
                      "clients.overview.contactPerson.more",
                      "contacto(s) más",
                    )}
                  </p>
                )}
              </div>
            ) : client?.phoneNumber || client?.email ? (
              <div className="space-y-2.5">
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {t(
                    "clients.overview.contactPerson.direct",
                    "Contacto directo del cliente",
                  )}
                </p>
                {client?.phoneNumber && (
                  <a
                    className="flex items-center gap-2 text-sm text-foreground hover:underline"
                    href={`tel:${client.phoneNumber}`}
                  >
                    <Phone
                      className="h-4 w-4"
                      style={{ color: "var(--ink-faint)" }}
                    />{" "}
                    {client.phoneNumber}
                  </a>
                )}
                {client?.email && (
                  <a
                    className="flex items-center gap-2 text-sm text-foreground hover:underline"
                    href={`mailto:${client.email}`}
                  >
                    <Mail
                      className="h-4 w-4"
                      style={{ color: "var(--ink-faint)" }}
                    />{" "}
                    <span className="truncate">{client.email}</span>
                  </a>
                )}
                {isPJ && (
                  <Link
                    className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    style={{ color: "var(--brand-text)" }}
                    to={`${base}/contacts`}
                  >
                    {t(
                      "clients.overview.contactPerson.add",
                      "Agregar persona de contacto",
                    )}{" "}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ) : (
              <EmptyState
                description={
                  t(
                    "clients.overview.contactPerson.addHint",
                    "Agrega quién es el contacto del cliente.",
                  ) as string
                }
                icon={<UserRound />}
                title={
                  t(
                    "clients.overview.contactPerson.none",
                    "Sin persona de contacto",
                  ) as string
                }
              />
            )}
          </Section>

          {/* Alertas y pendientes */}
          <Section
            icon={<Bell />}
            title={t("clients.overview.alerts.title", "Alertas y pendientes")}
          >
            {alerts.length === 0 ? (
              <EmptyState
                description={
                  t(
                    "clients.overview.alerts.noneHint",
                    "No hay pendientes para este cliente.",
                  ) as string
                }
                icon={<ShieldCheck />}
                title={
                  t("clients.overview.alerts.none", "Todo en orden") as string
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {alerts.map((a, i) => {
                  const tono: Tono =
                    a.tone === "crit"
                      ? "bad"
                      : a.tone === "att"
                        ? "warn"
                        : "info";

                  return (
                    <li key={i} className="flex items-start gap-3">
                      <IconTile className="mt-0.5" size="sm" tone={tono}>
                        {a.icon}
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {a.label}
                        </p>
                        <p
                          className="truncate text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {a.sub}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-[11px] font-semibold"
                        style={{ color: `var(--${tono}-text)` }}
                      >
                        {a.tone === "crit"
                          ? t("clients.overview.alerts.critical", "Crítico")
                          : a.tone === "att"
                            ? t("clients.overview.alerts.attention", "Atención")
                            : t("clients.overview.alerts.info", "Info")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Actividad reciente — timeline unificado (marcas, incidentes,
              visitas, tareas, rondas, relevos) del personal en las sedes del cliente. */}
          <Section
            icon={<Activity />}
            title={t("clients.overview.recent.title", "Actividad reciente")}
          >
            {activity.length === 0 ? (
              <EmptyState
                description={
                  t(
                    "clients.overview.recent.noneHint",
                    "Aquí verás la actividad del personal en las sedes del cliente: turnos, incidentes, visitas, tareas y rondas.",
                  ) as string
                }
                icon={<Activity />}
                title={
                  t(
                    "clients.overview.recent.none",
                    "Sin actividad reciente",
                  ) as string
                }
              />
            ) : (
              <ul className="space-y-3">
                {activity.map((n, i: number) => {
                  const meta = ACT_META[n.type] || {
                    icon: Activity,
                    tone: "neutral" as Tono,
                  };
                  const Icon = meta.icon;

                  return (
                    <li key={n.id || i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <IconTile
                          className="mt-1 !h-7 !w-7 rounded-full"
                          size="sm"
                          tone={meta.tone}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </IconTile>
                        {i < activity.length - 1 && (
                          <span
                            className="mt-1 w-px flex-1"
                            style={{ background: "var(--hairline)" }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {n.title}
                        </p>
                        <p
                          className="truncate text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {n.subtitle && <span>{n.subtitle} · </span>}
                          {n.actor && <span>{n.actor} · </span>}
                          {fmtDateTime(n.at) || fmtTime(n.at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
