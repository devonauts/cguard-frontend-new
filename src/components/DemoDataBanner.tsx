import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageCircle, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApiService } from "@/services/api/apiService";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { enlaceDeAyuda } from "@/lib/avisosDelSocio";
import { useAgente } from "@/lib/agenteDeMarca";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ESTÁS VIENDO DATOS DE EJEMPLO»
 *
 * El CRM nace VACÍO (2026-10-03). Los datos de ejemplo existen sólo si la
 * empresa los pidió en el asistente de configuración: 3 puestos con sus
 * vigilantes alrededor de SU dirección. Este aviso sale sólo mientras existen
 * —nunca antes de configurar la empresa— y dice las dos formas de quitarlos:
 * solos, al crear el primer cliente, puesto o vigilante; o con el botón.
 *
 * Persistente a propósito: un administrador que olvida que sus cifras son de
 * muestra y se las enseña a un cliente real es peor que un aviso pesado.
 *
 * Mientras está activo se vuelve a preguntar al navegar: así desaparece en
 * cuanto el servidor retira el ejemplo por su cuenta, y se refrescan las listas.
 * ════════════════════════════════════════════════════════════════════════════
 */

const CACHE_KEY = "cg_demo_data_status";
const TTL_MS = 5 * 60 * 1000;

export default function DemoDataBanner() {
  const { t } = useTranslation();
  const marca = useWhiteLabel();
  const agente = useAgente();
  const [active, setActive] = useState(false);
  const [removing, setRemoving] = useState(false);

  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const eraActivo = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Con el aviso APAGADO vale la caché (5 min). Con el aviso ENCENDIDO se
    // pregunta en cada navegación: el servidor puede haberlo retirado solo.
    if (!eraActivo.current) {
      try {
        const raw = sessionStorage.getItem(CACHE_KEY);

        if (raw) {
          const { ts, data } = JSON.parse(raw);

          if (Date.now() - ts < TTL_MS && data && !data.active) return;
        }
      } catch {
        /* sin caché, se consulta */
      }
    }

    const tenantId = localStorage.getItem("tenantId");

    if (!tenantId) return;

    ApiService.get(`/tenant/${tenantId}/demo-data/status`)
      .then((data: any) => {
        if (!mounted) return;
        const payload = data?.active !== undefined ? data : data?.data;
        const ahora = !!payload?.active;

        if (eraActivo.current && !ahora) {
          // Se fueron solos: la empresa creó algo suyo.
          toast.success(
            t(
              "ui.DemoDataBanner.retiradosSolos",
              "Quitamos los datos de ejemplo: ya estás trabajando con tus propios datos.",
            ),
          );
          queryClient.invalidateQueries();
        }
        eraActivo.current = ahora;
        setActive(ahora);
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ ts: Date.now(), data: payload }),
          );
        } catch {
          /* privado */
        }
      })
      .catch(() => {
        /* sin banner si falla */
      });

    return () => {
      mounted = false;
    };
  }, [pathname]);

  if (!active) return null;

  /* The WhatsApp handoff: the 13 dead sign-ups showed self-service alone does
     not close — in LATAM, B2B is a conversation. The message is prefilled so
     the first contact doesn't start from zero. */
  const ayuda = enlaceDeAyuda(
    marca,
    t("ui.DemoDataBanner.mensajeDeWhatsapp", {
      defaultValue:
        "Hola, acabo de crear mi cuenta en {{marca}} y me gustaría que me ayuden a configurarla.",
      marca: marca.platformName,
    }),
  );

  const quitar = async () => {
    if (removing) return;
    // Confirmación en el idioma del producto: dice qué pasa y qué no.
    const ok = await confirmDialog({
      title: t(
        "ui.DemoDataBanner.quitarDatosDeEjemplo",
        "Quitar datos de ejemplo",
      ),
      message: t(
        "ui.DemoDataBanner.seQuitaranLosDatosDeEjemplo",
        "Se quitarán los datos de ejemplo (la sede, los puestos y los vigilantes de muestra). Lo que tú hayas creado se conserva.",
      ),
      confirmText: t("ui.DemoDataBanner.quitar", "Quitar"),
      tone: "danger",
    });

    if (!ok) return;

    setRemoving(true);
    try {
      const tenantId = localStorage.getItem("tenantId");

      await ApiService.post(`/tenant/${tenantId}/demo-data/disable`, {});
      sessionStorage.removeItem(CACHE_KEY);
      toast.success(t("ui.DemoDataBanner.datosDeEjemploRetiradosEsta"));
      // Recarga completa: todas las listas y contadores llevan datos de ejemplo
      // en caché y recargar es más honesto que perseguir cada query.
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error(t("ui.DemoDataBanner.noPudimosQuitarLosDatos"));
      setRemoving(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
      style={{
        background: "color-mix(in oklab, var(--brand) 12%, transparent)",
        borderBottom: "1px solid var(--hairline)",
        color: "var(--ink)",
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Sparkles size={15} style={{ color: "var(--brand-text)" }} />
        <span className="truncate">
          {t(
            "ui.DemoDataBanner.estasExplorandoConUna",
            "Estás explorando con una",
          )}{" "}
          <strong>
            {t("ui.DemoDataBanner.operacionDeEjemplo", "operación de ejemplo")}
          </strong>{" "}
          {t(
            "ui.DemoDataBanner.seBorraSola",
            "— 3 puestos con vigilantes alrededor de tu dirección. Se borra sola cuando agregues tu primer cliente, puesto o vigilante.",
          )}
        </span>
      </span>
      {ayuda ? (
        <a
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-[filter] hover:brightness-110"
          href={ayuda}
          rel="noopener noreferrer"
          style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
          target="_blank"
        >
          <MessageCircle size={13} />
          {t(
            "ui.DemoDataBanner.teLoConfiguramosContigo",
            "¿Te lo configuramos contigo?",
          )}
        </a>
      ) : null}
      <button
        className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-[filter] hover:brightness-110"
        style={{
          borderColor: "var(--hairline)",
          background: "var(--float)",
          color: "var(--ink)",
        }}
        onClick={() => {
          try {
            window.dispatchEvent(
              new CustomEvent("vigia:abrir", {
                detail: {
                  mensaje: t("ui.DemoDataBanner.saludoDelAsistente", {
                    defaultValue:
                      "Soy {{agente}}. Puedo crear clientes, sedes y puestos, e invitar vigilantes por ti — dime qué necesitas.",
                    agente: agente.nombre,
                  }),
                },
              }),
            );
          } catch {
            /* sin widget */
          }
        }}
      >
        <Sparkles size={13} />
        {t("ui.DemoDataBanner.pideseloAlAsistente", {
          defaultValue: "o pídeselo a {{agente}}",
          agente: agente.nombre,
        })}
      </button>
      <button
        className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-[filter] hover:brightness-110 disabled:opacity-60"
        disabled={removing}
        style={{
          borderColor: "var(--hairline)",
          background: "var(--float)",
          color: "var(--ink)",
        }}
        onClick={quitar}
      >
        <Trash2 size={13} />
        {removing
          ? t("ui.DemoDataBanner.quitando", "Quitando…")
          : t(
              "ui.DemoDataBanner.quitarDatosDeEjemplo",
              "Quitar datos de ejemplo",
            )}
      </button>
    </div>
  );
}
