import type { Client } from "@/types/client";

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

import ClientOverview from "./components/ClientOverview/ClientOverview";
import ClientContacts from "./components/ClientContacts/ClientContacts";
import ClientNotes from "./components/ClientNotes/ClientNotes";
import ClientPostSites from "./components/ClientPostSites/ClientPostSites";
import ClientPortal from "./components/ClientPortal/ClientPortal";
import ClientUserAccess from "./components/ClientUserAccess/ClientUserAccess";
import ClientProjects from "./components/ClientProjects/ClientProjects";
import ClientContract from "./components/ClientContract/ClientContract";
import ClientCoverage from "./components/ClientCoverage/ClientCoverage";
import ClientStaff from "./components/ClientStaff/ClientStaff";
import ClientIncidents from "./components/ClientIncidents/ClientIncidents";
import ClientDocuments from "./components/ClientDocuments/ClientDocuments";
import ClientReports from "./components/ClientReports/ClientReports";

import { clientService } from "@/lib/api/clientService";
import ClientsLayout from "@/layouts/ClientsLayout";
import AppLayout from "@/layouts/app-layout";
import { SkeletonCards, EmptyState, FadeIn } from "@/components/kit";

export default function ClientsDetails() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    // Clear the previous client so switching :id A→B never shows A's data under
    // B's URL, and a failed B load doesn't leave A stuck on screen.
    setClient(null);
    setLoading(true);
    clientService
      .getClient(id)
      .then((data) => {
        if (!mounted) return;
        setClient(data);
      })
      .catch((err) => {
        if (!mounted) return;
        console.error("Error cargando cliente:", err);
        setClient(null);
        toast.error("No se pudo cargar cliente");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    // derive active tab from pathname (e.g. /clients/:id/profile)
    if (!location || !location.pathname) return;
    const parts = location.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    // if last part matches known tabs, set it; otherwise default to overview
    const allowed = [
      "overview",
      "profile",
      "contacts",
      "notes",
      "files",
      "post-sites",
      "portal",
      "user-access",
      "email-reports",
      "projects",
      "contract",
      "coverage",
      "staff",
      "incidents",
      "reports",
      "documents",
    ];

    if (allowed.includes(last)) {
      // normalize URL segments -> internal tab keys
      const map: Record<string, string> = {
        "post-sites": "postSites",
        "user-access": "userAccess",
        "email-reports": "emailReports",
        portal: "clientPortal",
        projects: "projects",
        contract: "contrato",
        coverage: "coverage",
        staff: "staff",
        incidents: "incidents",
        reports: "reports",
        documents: "documents",
      };

      setActiveTab(map[last] || last);
    } else {
      setActiveTab("overview");
    }
  }, [location]);

  // When the active tab changes, ensure the visible content scrolls to the top.
  useEffect(() => {
    const doScroll = (behavior: ScrollBehavior = "auto") => {
      try {
        // prefer content container used by ClientsLayout
        const content = document.querySelector(
          ".flex-1.overflow-y-auto",
        ) as HTMLElement | null;

        if (content) {
          content.scrollTop = 0;
          try {
            content.scrollTo({ top: 0, left: 0, behavior });
          } catch {}
        }
      } catch (e) {}

      try {
        const main = document.querySelector("main") as HTMLElement | null;

        if (main) {
          main.scrollTop = 0;
          try {
            main.scrollTo({ top: 0, left: 0, behavior });
          } catch {}
        }
      } catch (e) {}

      try {
        // also attempt to bring the first heading of the new section into view
        const contentRoot =
          document.querySelector(".flex-1.overflow-y-auto") ||
          document.querySelector("main") ||
          document.body;

        if (contentRoot) {
          const heading = (contentRoot as HTMLElement).querySelector(
            "h1,h2,h3,h4",
          );

          if (
            heading &&
            typeof (heading as HTMLElement).scrollIntoView === "function"
          ) {
            (heading as HTMLElement).scrollIntoView({
              behavior: "auto",
              block: "start",
            });
          }
        }
      } catch (e) {}
    };

    // immediate and delayed attempts (cover async renders)
    doScroll("auto");
    const t1 = window.setTimeout(() => doScroll("auto"), 50);
    const t2 = window.setTimeout(() => doScroll("auto"), 300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [activeTab]);

  /**
   * El cliente cargado sólo vale si es EL DE LA URL.
   *
   * Al pasar de un cliente a otro, `id` cambia en el mismo render en que
   * `client` todavía guarda el anterior: el efecto que lo limpia corre DESPUÉS
   * de pintar. Ese fotograma entregaba el cliente viejo a la cabecera y a la
   * pestaña activa — de ahí el mapa marcando la dirección del cliente que
   * acabas de dejar, y el botón "Crear sede" apuntando a él. Comprobarlo en el
   * render, y no en un efecto, elimina la ventana entera.
   */
  const clienteVigente =
    client && String(client.id) === String(id) ? client : null;

  return (
    <AppLayout>
      <ClientsLayout
        client={clienteVigente}
        navKey="clients"
        title="clients.nav.title"
      >
        <div className="flex-1 flex flex-col">
          {loading || Boolean(client && !clienteVigente) ? (
            <SkeletonCards className="p-1" count={4} />
          ) : clienteVigente ? (
            <>
              {(activeTab === "overview" || activeTab === "profile") && (
                <ClientOverview client={clienteVigente} />
              )}
              {activeTab === "contacts" && (
                <ClientContacts client={clienteVigente} />
              )}
              {activeTab === "notes" && <ClientNotes client={clienteVigente} />}
              {activeTab === "files" && (
                <ClientDocuments client={clienteVigente} />
              )}
              {activeTab === "postSites" && (
                <ClientPostSites client={clienteVigente} />
              )}
              {activeTab === "clientPortal" && (
                <ClientPortal client={clienteVigente} />
              )}
              {activeTab === "userAccess" && (
                <ClientUserAccess client={clienteVigente} />
              )}
              {activeTab === "emailReports" && (
                <ClientReports client={clienteVigente} />
              )}
              {activeTab === "projects" && (
                <ClientProjects client={clienteVigente} />
              )}
              {activeTab === "contrato" && (
                <ClientContract client={clienteVigente} />
              )}
              {activeTab === "coverage" && (
                <ClientCoverage client={clienteVigente} />
              )}
              {activeTab === "staff" && <ClientStaff client={clienteVigente} />}
              {activeTab === "incidents" && (
                <ClientIncidents client={clienteVigente} />
              )}
              {activeTab === "reports" && (
                <ClientReports client={clienteVigente} />
              )}
              {activeTab === "documents" && (
                <ClientDocuments client={clienteVigente} />
              )}
            </>
          ) : (
            <FadeIn>
              <EmptyState
                description={t(
                  "clients.loadClientErrorHint",
                  "Vuelve a intentarlo o revisa que el cliente exista.",
                )}
                icon={<Building2 />}
                title={t(
                  "clients.loadClientError",
                  "No se pudo cargar el cliente",
                )}
              />
            </FadeIn>
          )}
        </div>
      </ClientsLayout>
    </AppLayout>
  );
}
