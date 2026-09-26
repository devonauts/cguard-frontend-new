/**
 * Vista de tarjetas de clientes (toggle Cards ⇄ Lista en ClientsPage).
 * Cada tarjeta: logo (o inicial con color estable), nombre, estado, acceso a
 * la app, contacto y el tamaño de su operación (sitios · estaciones) — con
 * clic directo al detalle. La meta (logo/conteos) llega por lote desde
 * /client-account/card-meta para no engordar la lista principal.
 */
import type { Client } from "@/types/client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Shield,
  EllipsisVertical,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
  GlassPanel,
  SmartImage,
} from "@/components/kit";

export type ClientCardMeta = {
  logoUrl: string | null;
  sites: number;
  stations: number;
};

export type CardRowAction = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
};

function displayName(c: Client): string {
  if (c.commercialName) return c.commercialName;
  const last = (c.lastName || "").toString().trim();

  return last && last.toLowerCase() !== "null" ? `${c.name} ${last}` : c.name;
}

// Constante de módulo: se evalúa al cargar, antes de que el idioma esté listo.
// Por eso guarda la CLAVE y el texto se traduce donde se pinta.
const APP_BADGE: Record<
  string,
  { labelKey: string; label: string; tone: "neutral" | "warn" | "ok" | "bad" }
> = {
  not_invited: {
    labelKey: "clients.onboarding.not_invited",
    label: "Sin acceso",
    tone: "neutral",
  },
  invited: {
    labelKey: "clients.onboarding.invited",
    label: "Invitado",
    tone: "warn",
  },
  active: {
    labelKey: "clients.onboarding.active",
    label: "En app",
    tone: "ok",
  },
  suspended: {
    labelKey: "clients.onboarding.suspended",
    label: "Suspendido",
    tone: "bad",
  },
};

export default function ClientCardsGrid({
  clients,
  meta,
  loading,
  onOpen,
  rowActions,
}: {
  clients: Client[];
  meta: Record<string, ClientCardMeta>;
  loading: boolean;
  onOpen: (c: Client) => void;
  rowActions: (c: Client) => CardRowAction[];
}) {
  const { t } = useTranslation();
  const cards = useMemo(() => clients, [clients]);

  if (loading)
    return (
      <SkeletonCards
        className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        count={8}
      />
    );
  if (!cards.length) {
    return (
      <EmptyState
        description={t(
          "ui.ClientCardsGrid.daDeAltaAlPrimerCliente",
          "Da de alta al primer cliente con «Agregar cliente».",
        )}
        icon={<Building2 />}
        title={t("ui.ClientCardsGrid.sinClientes", "Sin clientes")}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c, i) => {
        const m = meta[c.id];
        const name = displayName(c);
        const app =
          APP_BADGE[c.onboardingStatus || "not_invited"] ||
          APP_BADGE.not_invited;
        const isActive = c.active === true;
        const actions = rowActions(c);

        return (
          <GlassPanel
            key={c.id}
            flat
            hover
            className="cg-focus group flex cursor-pointer flex-col p-4 animate-in fade-in slide-in-from-bottom-2"
            role="button"
            style={{
              animationDelay: `${Math.min(i, 12) * 30}ms`,
              animationFillMode: "backwards",
            }}
            tabIndex={0}
            onClick={() => onOpen(c)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(c);
            }}
          >
            <div className="flex items-start gap-3">
              <SmartImage
                alt=""
                className="h-12 w-12 shrink-0 border"
                fallback={
                  <span
                    className="grid h-full w-full place-items-center text-lg font-bold"
                    style={{
                      background: "var(--brand-wash)",
                      color: "var(--brand-text)",
                    }}
                  >
                    {(name || "?").charAt(0).toUpperCase()}
                  </span>
                }
                rounded="rounded-xl"
                src={m?.logoUrl}
                style={{ borderColor: "var(--hairline)" }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">{name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={isActive ? "ok" : "bad"}>
                    {isActive
                      ? t("common.active", "Activo")
                      : t("adminOfficeUsers.statuses.archived", "Archivado")}
                  </StatusBadge>
                  <StatusBadge tone={app.tone}>
                    {t(app.labelKey, app.label)}
                  </StatusBadge>
                </div>
              </div>
              {actions.length > 0 && (
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
                    <DropdownMenuContent align="end" className="w-48">
                      {actions.map((a) => (
                        <DropdownMenuItem
                          key={a.label}
                          style={
                            a.destructive
                              ? { color: "var(--bad-text)" }
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
              {c.email && (
                <p className="flex items-center gap-1.5 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{c.email}</span>
                </p>
              )}
              {c.phoneNumber && (
                <p className="flex items-center gap-1.5 truncate">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{c.phoneNumber}</span>
                </p>
              )}
              {c.address && (
                <p className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{c.address}</span>
                </p>
              )}
            </div>

            <div
              className="mt-3 flex items-center gap-4 border-t pt-3 text-sm"
              style={{
                borderColor: "var(--hairline)",
                color: "var(--ink-soft)",
              }}
            >
              <span className="flex items-center gap-1.5">
                <Building2
                  className="h-4 w-4"
                  style={{ color: "var(--brand-text)" }}
                />
                <span className="font-semibold text-foreground">
                  {m ? m.sites : "…"}
                </span>{" "}
                sitio(s)
              </span>
              <span className="flex items-center gap-1.5">
                <Shield
                  className="h-4 w-4"
                  style={{ color: "var(--brand-text)" }}
                />
                <span className="font-semibold text-foreground">
                  {m ? m.stations : "…"}
                </span>{" "}
                puesto(s)
              </span>
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
