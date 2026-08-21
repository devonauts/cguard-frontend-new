import { useEffect, useState } from "react";
import { MessageCircle, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiService } from "@/services/api/apiService";
import { confirmDialog } from "@/components/ui/confirmDialog";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ESTÁS EXPLORANDO CON UNA OPERACIÓN DE EJEMPLO»
 *
 * Toda instancia nueva del CRM nace con datos de muestra dentro —cliente, sede,
 * puestos, vigilantes, turnos, rondas, novedades— porque trece de dieciocho
 * registros murieron en un dashboard vacío. Este banner es la otra mitad del
 * trato: decir SIEMPRE que lo que se ve es ejemplo, y hacer que quitarlo sea un
 * botón.
 *
 * Persistente a propósito (no se puede descartar sin quitar los datos): un
 * administrador que olvida que sus cifras son de muestra y se las enseña a un
 * cliente real es un problema peor que un banner pesado.
 *
 * El borrado del servidor toca SÓLO las filas registradas por el sembrador
 * (demoSeedRows) — nunca puede llevarse un dato real.
 * ════════════════════════════════════════════════════════════════════════════
 */

const CACHE_KEY = "cg_demo_data_status";
const TTL_MS = 5 * 60 * 1000;

export default function DemoDataBanner() {
  const [active, setActive] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let mounted = true;

    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts < TTL_MS && data) {
          setActive(!!data.active);
          return;
        }
      }
    } catch { /* sin caché, se consulta */ }

    const tenantId = localStorage.getItem("tenantId");
    if (!tenantId) return;

    // Esta llamada además SIEMBRA en la primera visita de un tenant encendido
    // y vacío (siembra perezosa del servidor): quien vuelva tras el correo de
    // seguimiento también encuentra el CRM vivo.
    ApiService.get(`/tenant/${tenantId}/demo-data/status`)
      .then((data: any) => {
        if (!mounted) return;
        const payload = data?.active !== undefined ? data : data?.data;
        setActive(!!payload?.active);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: payload }));
        } catch { /* privado */ }
      })
      .catch(() => { /* sin banner si falla */ });

    return () => { mounted = false; };
  }, []);

  if (!active) return null;

  const quitar = async () => {
    if (removing) return;
    // Confirmación en el idioma del producto: dice qué pasa y qué no.
    const ok = await confirmDialog({
      title: "Quitar datos de ejemplo",
      message:
        "Se quitarán los datos de ejemplo (la sede, los puestos y los vigilantes de muestra). " +
        "Lo que tú hayas creado se conserva.",
      confirmText: "Quitar",
      tone: "danger",
    });
    if (!ok) return;

    setRemoving(true);
    try {
      const tenantId = localStorage.getItem("tenantId");
      await ApiService.post(`/tenant/${tenantId}/demo-data/disable`, {});
      sessionStorage.removeItem(CACHE_KEY);
      toast.success("Datos de ejemplo retirados. Esta es ya tu operación real.");
      // Recarga completa: todas las listas y contadores llevan datos de ejemplo
      // en caché y recargar es más honesto que perseguir cada query.
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error("No pudimos quitar los datos de ejemplo. Inténtalo de nuevo.");
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
          Estás explorando con una <strong>operación de ejemplo</strong> — puestos,
          vigilantes y novedades de muestra para que veas el sistema vivo.
        </span>
      </span>
      {/* El traspaso a WhatsApp: los 13 registros muertos demostraron que el
          autoservicio solo no cierra — en LATAM el B2B se conversa. El mensaje
          va prellenado para que el primer contacto no empiece de cero. */}
      <a
        href={`https://wa.me/593995914128?text=${encodeURIComponent(
          "Hola, acabo de crear mi cuenta en CGuardPro y me gustaría que me ayuden a configurarla.",
        )}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-[filter] hover:brightness-110"
        style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
      >
        <MessageCircle size={13} />
        ¿Te lo configuramos contigo?
      </a>
      <button
        onClick={() => { try { window.dispatchEvent(new CustomEvent("vigia:abrir", { detail: { mensaje: "Soy VigIA. Puedo crear clientes, sedes y puestos, e invitar vigilantes por ti — dime qué necesitas." } })); } catch { /* sin widget */ } }}
        className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-[filter] hover:brightness-110"
        style={{ borderColor: "var(--hairline)", background: "var(--float)", color: "var(--ink)" }}
      >
        <Sparkles size={13} />
        o pídeselo a VigIA
      </button>
      <button
        onClick={quitar}
        disabled={removing}
        className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-[filter] hover:brightness-110 disabled:opacity-60"
        style={{ borderColor: "var(--hairline)", background: "var(--float)", color: "var(--ink)" }}
      >
        <Trash2 size={13} />
        {removing ? "Quitando…" : "Quitar datos de ejemplo"}
      </button>
    </div>
  );
}
