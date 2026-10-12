import { ReactNode } from "react";
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Pencil,
  Plus,
  AlertTriangle,
  MapPin,
  MapPinned,
  LayoutGrid,
  Building2,
  Users,
  Route as RouteIcon,
  Package,
  FileBarChart,
  Contact,
  StickyNote,
  IdCard,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { StatusBadge, SmartImage } from "@/components/kit";
import { FechasDelEvento } from "@/components/post-sites/EventoDeLaSede";
import { needsOperationSetup } from "@/pages/admin/post-sites/components/OperationSetup/OperationSetupAlert";
import AppLayout from "@/layouts/app-layout";
import i18n from "@/i18n";

type Props = { title?: string; children: ReactNode; site?: any };

// Sección horizontal (mismo patrón que el detalle de cliente). Cada sede es una
// vista/agregado sobre sus estaciones; el detalle y la gestión por-estación
// (consignas, geocerca, checklists, config) vive dentro de cada estación.
// Solo se exponen secciones REALES conectadas a la base de datos.
const TAB_DEFS: Array<{ id: string; seg: string; label: string; icon: any }> = [
  {
    id: "overview",
    seg: "overview",
    label: i18n.t("postSites.tabs.overview"),
    icon: LayoutGrid,
  },
  {
    id: "stations",
    seg: "stations",
    label: i18n.t("postSites.tabs.stations"),
    icon: Building2,
  },
  {
    id: "assign-guards",
    seg: "assign-guards",
    label: i18n.t("postSites.tabs.guards"),
    icon: Users,
  },
  {
    id: "site-tours",
    seg: "site-tours",
    label: i18n.t("postSites.tabs.tours"),
    icon: RouteIcon,
  },
  {
    id: "incidents",
    seg: "incidents",
    label: i18n.t("postSites.tabs.incidents"),
    icon: AlertTriangle,
  },
  {
    id: "inventory",
    seg: "inventory",
    label: i18n.t("postSites.tabs.inventory"),
    icon: Package,
  },
  {
    id: "kpis",
    seg: "kpis",
    label: i18n.t("postSites.tabs.kpis"),
    icon: FileBarChart,
  },
  {
    id: "contacts",
    seg: "contacts",
    label: i18n.t("postSites.tabs.contacts"),
    icon: Contact,
  },
  {
    id: "notes",
    seg: "notes",
    label: i18n.t("postSites.tabs.notes"),
    icon: StickyNote,
  },
  {
    id: "profile",
    seg: "profile",
    label: i18n.t("postSites.tabs.profile"),
    icon: IdCard,
  },
];

export default function PostSiteLayout({ title, children, site }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const base = `/post-sites/${id}`;

  const displayName =
    site?.companyName ||
    site?.businessName ||
    site?.name ||
    title ||
    t("postSites.postsite", "Sede");
  const parts = location.pathname.split("/").filter(Boolean);
  const currentSeg = parts[2] || "overview";

  const logo = (() => {
    const cand = site?.logoUrl || site?.placePictureUrl || site?.imageUrl;

    if (Array.isArray(cand))
      return cand[0]?.downloadUrl || cand[0]?.publicUrl || null;

    return (
      (cand && (cand.downloadUrl || cand.publicUrl)) ||
      (typeof cand === "string" ? cand : null)
    );
  })();

  const nm = String(displayName || "?");

  const isActive =
    String(site?.status || (site?.active ? "active" : "")).toLowerCase() ===
      "active" || site?.active === true;
  const clientName =
    site?.client?.commercialName ||
    site?.client?.name ||
    site?.clientAccount?.commercialName ||
    site?.clientAccount?.name ||
    site?.clientAccount?.companyName ||
    null;
  const clientId =
    site?.client?.id ||
    site?.clientAccount?.id ||
    site?.clientAccountId ||
    null;
  const activeTab = TAB_DEFS.find((it) => it.seg === currentSeg) || TAB_DEFS[0];
  const showTabCrumb = activeTab.seg !== "overview";
  const address = [site?.address, site?.city].filter(Boolean).join(", ");
  const categoryName = site?.category?.name || null;
  const fmtCoords =
    Number.isFinite(Number(site?.latitud)) &&
    Number.isFinite(Number(site?.longitud)) &&
    Number(site?.latitud) !== 0
      ? `${Number(site.latitud).toFixed(4)}, ${Number(site.longitud).toFixed(4)}`
      : null;

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-4">
        {/* Breadcrumb: Clientes › {Cliente} › {Sede} › {Pestaña activa} */}
        <div
          className="flex min-w-0 items-center gap-1.5 text-sm"
          style={{ color: "var(--ink-soft)" }}
        >
          <Link className="shrink-0 hover:text-primary" to="/clients">
            {t("clients.nav.title", "Clientes")}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          {clientId && clientName && (
            <>
              <Link
                className="max-w-[160px] truncate hover:text-primary sm:max-w-[220px]"
                title={clientName}
                to={`/clients/${clientId}/overview`}
              >
                {clientName}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </>
          )}
          {showTabCrumb ? (
            <>
              <Link
                className="max-w-[160px] truncate hover:text-primary sm:max-w-[220px]"
                title={displayName}
                to={`${base}/overview`}
              >
                {displayName}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <span
                className="shrink-0 font-medium"
                style={{ color: "var(--ink)" }}
              >
                {activeTab.label}
              </span>
            </>
          ) : (
            <span
              className="max-w-[200px] truncate font-medium sm:max-w-[280px]"
              style={{ color: "var(--ink)" }}
              title={displayName}
            >
              {displayName}
            </span>
          )}
        </div>

        {/* Header card */}
        <div className="glass p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              {/* Fondo claro FIJO bajo el logo del cliente: imagen ajena, muchas
                  con transparencia pensada para papel blanco. No es color de UI. */}
              <SmartImage
                alt=""
                className="h-16 w-16 shrink-0 border"
                fallback={
                  <span
                    className="grid h-full w-full place-items-center text-2xl font-bold"
                    style={{
                      background: "var(--brand-wash)",
                      color: "var(--brand-text)",
                    }}
                  >
                    {nm.charAt(0).toUpperCase()}
                  </span>
                }
                rounded="rounded-2xl"
                src={logo}
                style={{
                  background: "oklch(1 0 0)",
                  borderColor: "var(--hairline)",
                }}
              />
              <div className="min-w-0">
                <h1
                  className="font-display truncate text-2xl font-bold tracking-tight"
                  style={{ color: "var(--ink)" }}
                >
                  {displayName}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <StatusBadge tone={isActive ? "ok" : "bad"}>
                    {isActive
                      ? t("common.active", "Activa")
                      : t("common.archived", "Inactiva")}
                  </StatusBadge>
                  {categoryName && (
                    <StatusBadge dot={false} tone="neutral">
                      {categoryName}
                    </StatusBadge>
                  )}
                  {/* Sede-EVENTO: sus fechas, y si ya terminó. */}
                  <FechasDelEvento sede={site} />
                  {clientName && (
                    <span style={{ color: "var(--ink-soft)" }}>
                      {t("postSites.client", "Cliente")}:{" "}
                      {clientId ? (
                        <Link
                          className="font-medium text-primary hover:underline"
                          to={`/clients/${clientId}/overview`}
                        >
                          {clientName}
                        </Link>
                      ) : (
                        <span
                          className="font-medium"
                          style={{ color: "var(--ink)" }}
                        >
                          {clientName}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {address && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> {address}
                    </span>
                  )}
                  {fmtCoords && (
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <MapPinned className="h-3.5 w-3.5" /> {fmtCoords}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {id && (
              /* Sin `shrink-0`: su ancho natural (tres botones) desbordaba la
                 página en un teléfono. Encogiendo, envuelven dentro de la fila. */
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`${base}/edit`)}
                >
                  <Pencil className="mr-1 h-4 w-4" />{" "}
                  {t("common.edit", "Editar sede")}
                </Button>
                {needsOperationSetup(site) ? (
                  /* Sin tipo de servicio no se crean puestos: el botón que
                     toca es el que configura la sede. */
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={() => navigate(`${base}/edit?step=1`)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />{" "}
                    {t(
                      "ui.OperationSetupAlert.configurarLaSede",
                      "Configurar la sede",
                    )}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`${base}/stations/new`)}
                  >
                    <Plus className="mr-1 h-4 w-4" />{" "}
                    {t("postSites.Details.newStation", "Crear estación")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="brand"
                  onClick={() => navigate("/dispatch-tickets/new")}
                >
                  <AlertTriangle className="mr-1 h-4 w-4" />{" "}
                  {t("clients.newIncident", "Crear incidente")}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs (sección horizontal) */}
        <div className="overflow-x-auto">
          <nav
            className="flex min-w-max items-center gap-1 border-b"
            style={{ borderColor: "var(--hairline)" }}
          >
            {TAB_DEFS.map((it) => {
              const path = `${base}/${it.seg}`;
              const active =
                currentSeg === it.seg ||
                (it.seg === "overview" &&
                  (currentSeg === "overview" || location.pathname === base));
              const Icon = it.icon;

              return (
                <Link
                  key={it.id}
                  className="cg-focus relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    color: active ? "var(--brand-text)" : "var(--ink-soft)",
                  }}
                  to={path}
                >
                  <Icon className="h-4 w-4" />
                  {it.label}
                  {active && (
                    <span
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                      style={{
                        background: "var(--brand)",
                        boxShadow: "0 0 12px 0 var(--brand-glow)",
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>{children}</div>
      </div>
    </AppLayout>
  );
}
