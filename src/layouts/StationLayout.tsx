/**
 * Layout del detalle de estación — SIN sidebar interno.
 * El viejo menú lateral secundario (columna anticuada) se reemplaza por una
 * fila de CARDS de navegación horizontales bajo el hero: mismas secciones,
 * mismo lenguaje visual de la plataforma (tarjetas redondeadas + dorado),
 * contenido a ancho completo.
 */
import React, { ReactNode, useEffect, useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ChevronRight,
  LayoutDashboard,
  DoorOpen,
  Users,
  CalendarClock,
  ClipboardList,
  Route,
  QrCode,
  History,
  Package,
  Car,
  AlertTriangle,
  ClipboardSignature,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";

type Props = { title?: string; children: ReactNode; station?: any };

export default function StationLayout({ title, children, station }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const { postSiteId, stationId } = useParams();
  const navRef = useRef<HTMLDivElement | null>(null);

  const base = `/post-sites/${postSiteId || ":postSiteId"}/stations/${stationId || ":stationId"}`;

  const items = [
    {
      id: "overview",
      label: t("station.details.overview", "Vista General"),
      icon: LayoutDashboard,
      path: `${base}/overview`,
    },
    {
      id: "visitors",
      label: t("station.details.visitors", "Visitantes"),
      icon: DoorOpen,
      path: `${base}/visitors`,
    },
    {
      id: "guards",
      label: t("station.details.guards", "Vigilantes"),
      icon: Users,
      path: `${base}/guards`,
    },
    {
      id: "shifts",
      label: t("station.details.shifts", "Turnos"),
      icon: CalendarClock,
      path: `${base}/shifts`,
    },
    {
      id: "orders",
      label: t("station.details.orders", "Consignas"),
      icon: ClipboardList,
      path: `${base}/orders`,
    },
    {
      // Justo después de las consignas: el pase de turno es el registro del
      // puesto en cada cambio de turno, y ahí es donde se busca.
      id: "passdowns",
      label: t("station.details.passdowns", "Pases de turno"),
      icon: ClipboardSignature,
      path: `${base}/passdowns`,
    },
    {
      id: "site-tours",
      label: t("station.details.siteTours", "Rondas"),
      icon: Route,
      path: `${base}/site-tours`,
    },
    {
      id: "etiquetas",
      label: t("station.details.patrolQr", "QR de Rondas"),
      icon: QrCode,
      path: `${base}/etiquetas`,
    },
    {
      id: "tag-scans",
      label: t("station.details.rondaHistory", "Historial"),
      icon: History,
      path: `${base}/tag-scans`,
    },
    {
      id: "inventory",
      label: t("station.details.inventory", "Inventario"),
      icon: Package,
      path: `${base}/inventory`,
    },
    {
      id: "parking",
      label: t("station.details.parking", "Control vehicular"),
      icon: Car,
      path: `${base}/parking`,
    },
    {
      id: "incidents",
      label: t("station.details.incidents", "Incidencias"),
      icon: AlertTriangle,
      path: `${base}/incidents`,
    },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  // Breadcrumb chain — Clientes › {Cliente} › {Sede} › {Estación} › {Pestaña}.
  // The owning client comes from the sede (postSite.clientAccount); stationOrigin
  // is a legacy/optional direct link and is often null.
  const site = station?.postSite;
  const client = site?.clientAccount || station?.stationOrigin;
  const clientId = client?.id || site?.clientAccountId || null;
  const clientName =
    client?.commercialName || client?.name || client?.companyName || null;
  const siteName =
    site?.businessName ||
    site?.companyName ||
    site?.name ||
    t("postSites.postsite", "Sede");
  const stationName =
    station?.stationName ||
    station?.name ||
    t("station.details.station", "Estación");
  const activeItem = items.find((it) => isActive(it.path)) || items[0];
  const showTabCrumb = activeItem.id !== "overview";

  // Keep the active card visible when landing deep in the list.
  useEffect(() => {
    try {
      const el = navRef.current?.querySelector(
        '[data-active="true"]',
      ) as HTMLElement | null;

      el?.scrollIntoView({ block: "nearest", inline: "center" });
    } catch {
      /* ignore */
    }
  }, [location.pathname]);

  return (
    <AppLayout>
      {/* Misma fórmula que `<main>` en `app-layout.tsx` (ventana − cabecera −
          muesca). Antes restaba 64 px cuando la cabecera mide 3,5rem: el bloque
          quedaba 8 px más alto que su hueco y aparecía una segunda barra de
          desplazamiento sobre la que ya tiene el contenido. */}
      <div className="flex h-[calc(100vh_-_3.5rem_-_env(safe-area-inset-top))] flex-col overflow-hidden supports-[height:100dvh]:h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-top))]">
        {/* Barra de navegación: breadcrumb + cards de sección (scroll horizontal) */}
        <div className="shrink-0 px-4 pt-3">
          {/* Breadcrumb: Clientes › Cliente › Sede › Estación › Pestaña */}
          {/* En el teléfono la miga empieza en la SEDE: con «Clientes › Cliente ›»
              delante, cada eslabón se quedaba en cinco letras («Freem…», «Tesla
              S…») y no se leía ninguno. El cliente sigue a un toque, desde la sede. */}
          <div className="mb-2 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Link className="hidden shrink-0 hover:text-primary sm:inline" to="/clients">
              {t("clients.nav.title", "Clientes")}
            </Link>
            <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
            {clientId && clientName && (
              <>
                <Link
                  className="hidden max-w-[190px] truncate hover:text-primary sm:inline"
                  title={clientName}
                  to={`/clients/${clientId}/overview`}
                >
                  {clientName}
                </Link>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
              </>
            )}
            <Link
              className="min-w-0 max-w-[45%] truncate hover:text-primary sm:max-w-[190px]"
              title={siteName}
              to={`/post-sites/${postSiteId}/overview`}
            >
              {siteName}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            {showTabCrumb ? (
              <>
                <Link
                  className="max-w-[130px] truncate hover:text-primary sm:max-w-[190px]"
                  title={stationName}
                  to={`${base}/overview`}
                >
                  {stationName}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                <span className="shrink-0 font-medium text-foreground">
                  {activeItem.label}
                </span>
              </>
            ) : (
              <span
                className="min-w-0 flex-1 truncate font-medium text-foreground sm:max-w-[220px] sm:flex-none"
                title={stationName}
              >
                {stationName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div
              ref={navRef}
              className="flex flex-1 items-center gap-2 overflow-x-auto pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
            >
              {items.map((it) => {
                const active = isActive(it.path);
                const Icon = it.icon;

                return (
                  <Link
                    key={it.id}
                    className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:-translate-y-px hover:border-primary/30 hover:text-foreground"
                    }`}
                    data-active={active ? "true" : undefined}
                    to={it.path}
                  >
                    <Icon className={active ? "" : "opacity-70"} size={15} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Contenido a ancho completo */}
        <main className="flex-1 overflow-y-auto">
          <div className="pb-20">{children}</div>
        </main>
      </div>
    </AppLayout>
  );
}
