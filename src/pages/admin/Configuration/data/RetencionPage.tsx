/**
 * Configuración › Datos y conexiones › Retención de datos
 *
 * EL HUECO QUE LLENA: la plataforma tenía UN solo barrido —el rastro GPS— y su
 * plazo vivía en una variable de entorno del servidor. Misma política para todos
 * los clientes, invisible para ellos e imposible de pactar. El registro de
 * mensajes y la bitácora de cambios no se purgaban nunca.
 *
 * ── POR QUÉ ESTA PANTALLA NO SE PARECE A LAS DEMÁS ────────────────────────
 * Es la única de Configuración cuyo «Guardar» termina en un DELETE irreversible
 * sobre datos de clientes. Las otras encienden una regla; ésta destruye
 * evidencia que puede hacer falta en un juicio laboral o en una reclamación.
 *
 * De ahí las tres cosas que no tiene ninguna otra:
 *
 *  1. Enseña lo que HAY antes de preguntar nada — cuántos registros y desde
 *     cuándo. «90 días» no es una decisión informada; «se borrarán 4.312
 *     registros, el más antiguo del 16 de junio» sí lo es.
 *  2. Recalcula la consecuencia MIENTRAS mueves el número, no después.
 *  3. Confirma antes de guardar, y sólo cuando de verdad va a borrar algo.
 *
 * Los valores por defecto reproducen lo que la plataforma hace hoy: el rastro a
 * 30 días, lo demás para siempre. Publicar esta pantalla no le borra nada a
 * nadie.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DatabaseZap,
  Loader2,
  MapPin,
  MessageSquare,
  Save,
  ScrollText,
  Trash2,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  InfoNote,
  Modal,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type Clave = "locationTrailDays" | "communicationLogsDays" | "auditLogDays";
type Retencion = Record<Clave, number>;

/** Iguales a los del backend (services/dataRetentionService.ts). Si divergen, la
 *  pantalla enseña un plazo que no es el que se aplica. */
const DEFAULTS: Retencion = {
  locationTrailDays: 30,
  communicationLogsDays: 0,
  auditLogDays: 0,
};

/** Suelos del backend. Aquí sólo para avisar antes de enviar; quien manda es él. */
const SUELO: Retencion = {
  locationTrailDays: 7,
  communicationLogsDays: 30,
  auditLogDays: 90,
};

type Dato = {
  clave: Clave;
  icono: React.ReactNode;
  titulo: string;
  /** Qué es este dato, en la lengua de quien lo va a borrar. */
  queEs: string;
  /** Qué se pierde si lo borras. Esto es lo que de verdad hay que leer. */
  quePierdes: string;
};

const DATOS: Dato[] = [
  {
    clave: "locationTrailDays",
    icono: <MapPin className="h-4 w-4" />,
    titulo: "Rastro de ubicación",
    queEs:
      "El recorrido que hicieron vigilantes y supervisores durante sus turnos, punto a punto.",
    quePierdes:
      "Dejas de poder demostrar por dónde pasó alguien. Acortarlo también es una decisión de privacidad válida: es el dato más sensible que guardas de tu gente.",
  },
  {
    clave: "communicationLogsDays",
    icono: <MessageSquare className="h-4 w-4" />,
    titulo: "Registro de mensajes",
    queEs:
      "Cada aviso enviado por la app, WhatsApp, SMS o correo, con su estado de entrega y su coste.",
    quePierdes:
      "El respaldo de que un aviso salió y llegó, y el detalle de lo que se cobró. Es el registro que más crece de todos.",
  },
  {
    clave: "auditLogDays",
    icono: <ScrollText className="h-4 w-4" />,
    titulo: "Bitácora de cambios",
    queEs: "Quién modificó qué dentro de la plataforma, y con qué valores.",
    quePierdes:
      "La respuesta a «¿quién cambió esto?». Cuando hace falta, hace mucha falta, y siempre se descubre tarde.",
  },
];

type Estimacion = { clave: Clave; total: number; masAntigua: string | null; aBorrar: number };

const tenantId = () => localStorage.getItem("tenantId") || "";
const nf = new Intl.NumberFormat("es");

function fecha(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return null;
  }
}

/** Una fila: el dato, lo que hay guardado, el plazo y lo que ese plazo se lleva. */
function FilaDato({
  dato,
  valor,
  onChange,
  est,
  calculando,
  disabled,
}: {
  dato: Dato;
  valor: number;
  onChange: (v: number) => void;
  est?: Estimacion;
  calculando: boolean;
  disabled?: boolean;
}) {
  const paraSiempre = valor === 0;
  const bajoElSuelo = valor > 0 && valor < SUELO[dato.clave];
  const desde = fecha(est?.masAntigua ?? null);

  return (
    <div className="py-4">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ background: "var(--glass-raised)", color: "var(--ink-soft)" }}
        >
          {dato.icono}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{dato.titulo}</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
            {dato.queEs}
          </p>

          {/* Lo que hay guardado HOY. Sin esto, el plazo se elige a ciegas. */}
          {est && (
            <p className="mt-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
              {est.total === 0 ? (
                <>Ahora mismo no hay nada guardado.</>
              ) : (
                <>
                  Guardados hoy: <strong>{nf.format(est.total)}</strong> registros
                  {desde ? <> · el más antiguo, del {desde}</> : null}
                </>
              )}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              max={3650}
              value={valor}
              disabled={disabled}
              onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
              className="cg-input cg-focus w-28 px-3 py-2 text-sm"
            />
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
              días
            </span>
            {paraSiempre && (
              <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                · se conserva para siempre
              </span>
            )}
          </div>

          {bajoElSuelo && (
            <p className="mt-2 text-xs" style={{ color: "var(--warn)" }}>
              El mínimo para este dato son {SUELO[dato.clave]} días. Al guardar se
              ajustará solo.
            </p>
          )}

          {/* La consecuencia, en el momento en que se decide. */}
          {!paraSiempre && !bajoElSuelo && (
            <p
              className="mt-2 text-xs"
              style={{ color: est && est.aBorrar > 0 ? "var(--bad)" : "var(--ink-faint)" }}
            >
              {calculando ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> calculando…
                </span>
              ) : est && est.aBorrar > 0 ? (
                <>
                  Con este plazo se borrarán <strong>{nf.format(est.aBorrar)}</strong>{" "}
                  registros en el próximo barrido. {dato.quePierdes}
                </>
              ) : (
                <>Con este plazo no se borraría nada todavía.</>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RetencionPage() {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [r, setR] = useState<Retencion>(DEFAULTS);
  const [row, setRow] = useState<any>(null);
  const [est, setEst] = useState<Record<string, Estimacion>>({});
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings`);
        setRow(data || {});
        setR({ ...DEFAULTS, ...((data && data.dataRetention) || {}) });
      } catch {
        toast.error("No se pudo cargar la política de retención.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // La vista previa se recalcula al soltar el teclado, no en cada pulsación:
  // son tres COUNT por consulta y el número que interesa es el del valor final,
  // no el de cada dígito intermedio.
  const timer = useRef<any>(null);
  const estimar = useCallback((politica: Retencion) => {
    if (timer.current) clearTimeout(timer.current);
    setCalculando(true);
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/tenant/${tenantId()}/settings/retention-preview`, {
          params: politica,
        });
        const mapa: Record<string, Estimacion> = {};
        for (const d of (data && data.datos) || []) mapa[d.clave] = d;
        setEst(mapa);
      } catch {
        // Silencioso a propósito: es una ayuda, no el guardado. Un error aquí no
        // debe parecer que la política no se guardó.
      } finally {
        setCalculando(false);
      }
    }, 450);
  }, []);

  useEffect(() => {
    if (!loading) estimar(r);
    return () => timer.current && clearTimeout(timer.current);
  }, [r, loading, estimar]);

  const set = (k: Clave, v: number) => setR((p) => ({ ...p, [k]: v }));

  /** Cuántos registros se llevaría el próximo barrido con lo que hay en pantalla. */
  const aBorrar = DATOS.reduce((n, d) => n + (r[d.clave] > 0 ? est[d.clave]?.aBorrar || 0 : 0), 0);

  const guardar = async () => {
    setSaving(true);
    setConfirmar(false);
    try {
      await api.put(`/tenant/${tenantId()}/settings`, {
        settings: {
          theme: row?.theme || "default",
          // Se reenvían las relaciones de archivo intactas: el backend recalcula
          // logoUrl desde logos[0], así que omitirlas BORRARÍA el logotipo.
          logos: row?.logos || [],
          backgroundImages: row?.backgroundImages || [],
          dataRetention: r,
        },
      });
      toast.success("Política de retención guardada.");
      estimar(r);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const alGuardar = () => {
    // Sólo se pregunta cuando de verdad va a borrar algo. Un diálogo que sale
    // siempre se cierra sin leerlo, y entonces no protege de nada.
    if (aBorrar > 0) setConfirmar(true);
    else guardar();
  };

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Retención de datos">
        <PageContainer width="narrow">
          <PageHeader
            icon={<DatabaseZap />}
            title="Retención de datos"
            subtitle="Cuánto tiempo se guarda cada cosa antes de borrarse para siempre."
          />

          {loading ? (
            <SkeletonCards count={2} />
          ) : (
            <div className="space-y-5">
              <InfoNote tone="warn" title="Esto borra datos, y no se puede deshacer">
                Lo que se borra no se recupera, ni desde una copia de seguridad
                antigua. Pon <strong>0</strong> en cualquier plazo para conservar ese
                dato indefinidamente, que es como está todo salvo el rastro de
                ubicación.
              </InfoNote>

              <Section title="Plazos" icon={<DatabaseZap />}>
                <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  {DATOS.map((d) => (
                    <FilaDato
                      key={d.clave}
                      dato={d}
                      valor={r[d.clave]}
                      onChange={(v) => set(d.clave, v)}
                      est={est[d.clave]}
                      calculando={calculando}
                      disabled={!canEdit}
                    />
                  ))}
                </div>
              </Section>

              <InfoNote tone="info">
                El barrido corre solo cada tres horas. No hace falta que dejes esta
                pantalla abierta.
              </InfoNote>

              <div className="flex justify-end">
                <Button variant="brand" onClick={alGuardar} disabled={!canEdit || saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Guardar plazos
                </Button>
              </div>
            </div>
          )}

          <Modal
            open={confirmar}
            onOpenChange={setConfirmar}
            icon={<Trash2 />}
            title="Se van a borrar registros"
            description="El próximo barrido, dentro de menos de tres horas, eliminará estos datos. No se pueden recuperar."
            footer={
              <>
                <Button variant="outline" onClick={() => setConfirmar(false)}>
                  Cancelar
                </Button>
                <Button variant="brand" onClick={guardar}>
                  Guardar y borrar
                </Button>
              </>
            }
          >
            <ul className="space-y-2 text-sm">
              {DATOS.filter((d) => r[d.clave] > 0 && (est[d.clave]?.aBorrar || 0) > 0).map((d) => (
                <li key={d.clave} className="flex items-start justify-between gap-3">
                  <span style={{ color: "var(--ink-soft)" }}>{d.titulo}</span>
                  <strong className="shrink-0" style={{ color: "var(--bad)" }}>
                    {nf.format(est[d.clave]!.aBorrar)} registros
                  </strong>
                </li>
              ))}
            </ul>
          </Modal>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
