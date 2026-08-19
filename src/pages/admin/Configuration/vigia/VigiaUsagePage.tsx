/**
 * Configuración › Asistente VigIA — el dashboard de uso.
 *
 * La regla de esta pantalla: números que un dueño entiende. Mensajes del mes,
 * costo real, cuánto queda de la cuota gratis, saldo del monedero (el MISMO de
 * SMS/WhatsApp — una sola recarga para todo), y la bitácora de qué acciones
 * ejecutó el asistente y quién se las pidió — porque un asistente que ejecuta
 * acciones sin dejar rastro auditable no entra a esta plataforma.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bot, Wallet, MessageSquare, ListChecks } from "lucide-react";
import { SkeletonCards, StatCard } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import api from "@/lib/api";

const tenantId = () => localStorage.getItem("tenantId") || "";

const dolares = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`;
/** El costo viaja en centésimas de centavo (entero); aquí se vuelve legible. */
const dolaresDesdeCenti = (centi: number) => `$${(Math.max(0, centi) / 10000).toFixed(3)}`;

export default function VigiaUsagePage() {
  const [datos, setDatos] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resp: any = await api.get(`/tenant/${tenantId()}/assistant/usage`);
        setDatos(resp && resp.data !== undefined ? resp.data : resp);
      } catch {
        toast.error("No se pudo cargar el uso del asistente.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const serie: Array<{ dia: string; mensajes: number }> = datos?.serie || [];
  const maxMensajes = Math.max(1, ...serie.map((d) => d.mensajes));

  return (
    <SettingsPageShell
      icon={<Bot />}
      title="Asistente VigIA"
      subtitle="Cuánto se usa, cuánto cuesta y qué acciones ha ejecutado."
    >
      {loading ? (
        <SkeletonCards count={4} className="grid-cols-2 sm:grid-cols-4" />
      ) : !datos ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Mensajes este mes" value={String(datos.mes?.mensajes ?? 0)} icon={<MessageSquare />} />
            <StatCard label={`Cuota gratis restante (de ${dolares(datos.mes?.cuotaGratisCents ?? 100)})`} value={dolares(datos.mes?.gratisRestanteCents ?? 0)} accent={(datos.mes?.gratisRestanteCents ?? 0) > 0 ? "ok" : "neutral"} icon={<Bot />} />
            <StatCard label="Cobrado del saldo (mes)" value={dolares(datos.mes?.cobradoCents ?? 0)} icon={<Wallet />} />
            <StatCard label="Saldo disponible" value={dolares(datos.saldoCents ?? 0)} accent={(datos.saldoCents ?? 0) > 0 ? "ok" : "warn"} icon={<Wallet />} />
          </div>

          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            VigIA comparte el monedero de Comunicaciones: la misma recarga sirve para SMS, WhatsApp y el asistente.{" "}
            <Link to="/setting/comunicaciones" className="font-semibold underline" style={{ color: "var(--brand-text)" }}>
              Recargar saldo
            </Link>
          </p>

          {/* Actividad de los últimos 30 días */}
          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold">Actividad · últimos 30 días</h3>
            {serie.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Aún sin uso. El asistente vive abajo a la derecha del CRM.</p>
            ) : (
              <div className="flex items-end gap-1" style={{ height: 90 }}>
                {serie.map((d) => (
                  <div key={d.dia} title={`${d.dia}: ${d.mensajes} mensajes`} className="flex-1 rounded-t"
                    style={{ height: `${Math.max(6, (d.mensajes / maxMensajes) * 100)}%`, background: "color-mix(in oklab, var(--brand) 55%, transparent)" }} />
                ))}
              </div>
            )}
            {typeof datos.tokens30d === "number" && datos.tokens30d > 0 && (
              <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                {datos.tokens30d.toLocaleString()} tokens procesados en 30 días.
              </p>
            )}
          </section>

          {/* Bitácora de acciones — quién le pidió qué */}
          <section className="glass-flat rounded-2xl p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ListChecks size={15} /> Acciones ejecutadas</h3>
            {!datos.acciones?.length ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Ninguna todavía. Toda acción del asistente queda registrada aquí.</p>
            ) : (
              <div className="space-y-2">
                {datos.acciones.map((a: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--glass-raised)" }}>
                    <span className="font-mono text-xs">{a.action}</span>
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      {a.quien} · {new Date(a.at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <p className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
            Costo real del mes: {dolaresDesdeCenti(datos.mes?.costCentiCents ?? 0)} en el proveedor de IA.
            La cuota gratis se renueva cada mes.
          </p>
        </div>
      )}
    </SettingsPageShell>
  );
}
