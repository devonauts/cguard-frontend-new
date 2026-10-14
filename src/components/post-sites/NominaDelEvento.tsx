import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  Banknote,
  CheckCheck,
  Clock,
  Download,
  Loader2,
  Send,
  Users,
} from "lucide-react";

import {
  InfoNote,
  Section,
  StatCard,
  StatsStrip,
  StatusBadge,
} from "@/components/kit";
import MobileCardList from "@/components/responsive/MobileCardList";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { useEsTelefono } from "@/hooks/useEsTelefono";
import { useGusto } from "@/hooks/useGusto";
import { gustoService } from "@/lib/api/gustoService";
import { rangoDelEvento } from "@/lib/eventos";
import {
  type ExportColumn,
  type ExportFormat,
  exportColumns,
} from "@/lib/export/reportExport";
import { fechaYHora, soloHora } from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";
import { ApiService } from "@/services/api/apiService";

/* ════════════════════════════════════════════════════════════════════════════
   LA NÓMINA DEL EVENTO

   Al terminar un evento la oficina tiene que pagar a toda la gente que fue, y
   para eso necesita UNA hoja: quién fue, a qué zona, cuántas horas fichó de
   verdad y cuánto se le debe. De aquí sale el archivo para el contador (Excel,
   CSV o PDF) o, si la empresa usa Gusto, las horas van a Gusto.

   Antes de que termine se ve lo programado (sirve para presupuestar); las
   horas que cuentan son las FICHADAS — un turno sin fichaje vale cero y se
   dice, no se inventa.
   ════════════════════════════════════════════════════════════════════════ */

interface Turno {
  turnoId: string | null;
  estacion: string | null;
  programadoInicio: string | null;
  programadoFin: string | null;
  entrada: string | null;
  salida: string | null;
  /** Pagables: en el puesto − descanso (misma regla que nómina y Gusto). */
  horas: number;
  horasEnElPuesto?: number;
  descansoMinutos?: number;
  estado: "cumplido" | "sinSalida" | "noFicho" | "pendiente";
  estadoNomina: string | null;
}

interface Fila {
  userId: string;
  nombre: string;
  documento: string | null;
  correo: string | null;
  zonas: string[];
  turnos: Turno[];
  horasProgramadas: number;
  horasTrabajadas: number;
  /** Descanso descontado en el evento, en minutos. */
  descansoMinutos?: number;
  tarifaCentavos: number | null;
  origenTarifa: "evento" | "persona" | null;
  importeCentavos: number | null;
  presupuestoCentavos: number | null;
  aprobadas: number;
  porAprobar: number;
  /** Archivado (al terminar este u otro evento, o de baja): sigue cobrando. */
  archivado?: boolean;
}

/** Por qué alguien del evento no se archiva (ver `archivadoDeEvento` en el servidor). */
type MotivoDeQuedarse =
  | "otroPuesto"
  | "turnoPendiente"
  | "turnoDelEvento"
  | "fichajeAbierto"
  | "otroRol";

interface Nomina {
  evento: {
    id: string;
    nombre: string;
    desde: string | null;
    hasta: string | null;
    terminado: boolean;
    tarifaHora: number | null;
    moneda: string;
    periodo: { inicio: string; fin: string } | null;
  };
  filas: Fila[];
  totales: {
    vigilantes: number;
    turnos: number;
    cumplidos: number;
    sinSalida: number;
    noFicho: number;
    pendientes: number;
    horasProgramadas: number;
    horasTrabajadas: number;
    importeCentavos: number;
    presupuestoCentavos: number;
    sinTarifa: number;
    aprobadas: number;
    porAprobar: number;
  };
  /** Al terminar, quien no tiene otro puesto se archiva y libera su asiento. */
  archivado?: {
    archivados: number;
    asientosLiberados: number;
    archivarAlTerminar: boolean;
    hecho: boolean;
  };
  /** Evento pasado sin una sola hora: quién estuvo asignado (y a qué zonas). */
  asignadosSinHoras?: Array<{
    userId: string;
    nombre: string;
    zonas: string[];
    archivado: boolean;
  }>;
}

const MOSTRAR = 40;

export default function NominaDelEvento({
  postSiteId,
}: {
  postSiteId: string;
}) {
  const { t } = useTranslation();
  const tenantId = localStorage.getItem("tenantId") || "";
  const base = `/tenant/${tenantId}/post-site/${postSiteId}/nomina-evento`;
  const gusto = useGusto();
  // En el teléfono la hoja va en tarjetas: la tabla de cinco columnas
  // obligaba a deslizar de lado para ver lo que se paga y el estado.
  const esTelefono = useEsTelefono();
  const [datos, setDatos] = useState<Nomina | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [tarifa, setTarifa] = useState("");
  const [ocupado, setOcupado] = useState<
    null | "tarifa" | "aprobar" | "gusto" | "archivar" | ExportFormat | "detalle"
  >(null);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let vivo = true;

    ApiService.get(base)
      .then((r: any) => {
        if (!vivo) return;
        const d = (r?.data ?? r) as Nomina;

        setDatos(d);
        setTarifa(
          d?.evento?.tarifaHora != null ? String(d.evento.tarifaHora) : "",
        );
        setError(null);
      })
      .catch((e: any) => vivo && setError(e?.message || "error"));

    return () => {
      vivo = false;
    };
  }, [base, vuelta]);

  const dinero = useMemo(() => {
    const f = new Intl.NumberFormat(localeActual(), {
      style: "currency",
      currency: datos?.evento?.moneda || "USD",
    });

    return (centavos: number | null | undefined) =>
      centavos == null ? "—" : f.format(centavos / 100);
  }, [datos?.evento?.moneda]);
  const horas = (h: number) =>
    new Intl.NumberFormat(localeActual(), { maximumFractionDigits: 2 }).format(
      h,
    );

  if (error)
    return (
      <Section
        icon={<Banknote />}
        title={t("ui.NominaDelEvento.titulo", "Nómina del evento")}
      >
        <InfoNote tone="bad">{error}</InfoNote>
      </Section>
    );
  if (!datos)
    return (
      <Section
        icon={<Banknote />}
        title={t("ui.NominaDelEvento.titulo", "Nómina del evento")}
      >
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin brand-text" />
        </div>
      </Section>
    );

  const { evento, totales, filas } = datos;
  const terminado = evento.terminado;

  const guardarTarifa = async () => {
    const v = tarifa.trim() === "" ? null : Number(tarifa.replace(",", "."));

    if (v !== null && !(Number.isFinite(v) && v > 0)) {
      toast.error(
        t(
          "ui.NominaDelEvento.tarifaInvalida",
          "Escribe una tarifa mayor que cero, o déjala vacía.",
        ),
      );

      return;
    }
    setOcupado("tarifa");
    try {
      await ApiService.put(`${base}/tarifa`, { tarifaHora: v });
      toast.success(t("ui.NominaDelEvento.tarifaGuardada", "Tarifa guardada"));
      setVuelta((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "error");
    } finally {
      setOcupado(null);
    }
  };

  const aprobar = async (silencioso = false) => {
    const r: any = await ApiService.post(`${base}/aprobar`, {});
    const n = Number((r?.data ?? r)?.aprobados || 0);

    if (!silencioso)
      toast.success(
        t("ui.NominaDelEvento.aprobadas", {
          defaultValue: "{{count}} turnos aprobados",
          count: n,
        }),
      );

    return n;
  };

  const alAprobar = async () => {
    setOcupado("aprobar");
    try {
      await aprobar();
      setVuelta((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "error");
    } finally {
      setOcupado(null);
    }
  };

  const alGusto = async () => {
    if (!evento.periodo) return;
    setOcupado("gusto");
    try {
      // Gusto sólo recibe horas aprobadas: las del evento se aprueban antes.
      if (totales.porAprobar > 0) await aprobar(true);
      await gustoService.enviarHoras(
        evento.periodo.inicio,
        evento.periodo.fin,
        null,
      );
      toast.success(
        t(
          "ui.NominaDelEvento.gustoEnCamino",
          "Las horas van camino de Gusto. Sigue el envío en Nómina › Gusto.",
        ),
      );
      setVuelta((n) => n + 1);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "error");
    } finally {
      setOcupado(null);
    }
  };

  /* ── ARCHIVAR AHORA ───────────────────────────────────────────────────
     Lo hace solo el sistema 12 h después del fin; esto es para no esperar.
     Primero se pregunta cuántos y quiénes NO (y por qué), luego se archiva. */
  const motivoLegible = (x: {
    nombre: string;
    motivo: MotivoDeQuedarse;
    donde: string | null;
  }) => {
    const por = t(`ui.NominaDelEvento.motivo.${x.motivo}`, {
      defaultValue: {
        otroPuesto: "tiene otro puesto",
        turnoPendiente: "tiene turnos por delante",
        turnoDelEvento: "su turno del evento sigue en curso",
        fichajeAbierto: "está fichado ahora",
        otroRol: "no es sólo vigilante",
      }[x.motivo],
    });

    return `${x.nombre} — ${por}${x.donde ? ` (${x.donde})` : ""}`;
  };

  const archivarAhora = async () => {
    setOcupado("archivar");
    try {
      const r: any = await ApiService.get(`${base}/archivar`);
      const plan = (r?.data ?? r) as {
        archivar: Array<{ userId: string; nombre: string }>;
        seQuedan: Array<{
          userId: string;
          nombre: string;
          motivo: MotivoDeQuedarse;
          donde: string | null;
        }>;
      };
      // En un evento grande la lista de quienes se quedan puede ser larga:
      // se enseñan los primeros y el resto se cuenta.
      const todosQuedan = (plan?.seQuedan || []).map(motivoLegible);
      const quedan = todosQuedan.slice(0, 10);

      if (todosQuedan.length > quedan.length)
        quedan.push(
          t("ui.NominaDelEvento.yMas", {
            defaultValue: "… y {{count}} más",
            count: todosQuedan.length - quedan.length,
          }),
        );
      const seQuedan = quedan.length
        ? t("ui.NominaDelEvento.confirmarSeQuedan", {
            defaultValue: "No se archivan:\n{{lista}}",
            lista: quedan.join("\n"),
          })
        : "";

      if (!plan?.archivar?.length) {
        // El aviso respeta los saltos de línea (uno por persona) y dura lo
        // bastante para leer la lista.
        toast.info(
          t(
            "ui.NominaDelEvento.nadieQueArchivar",
            "No hay nadie que archivar ahora.",
          ),
          {
            description: seQuedan ? (
              <span className="whitespace-pre-line">{seQuedan}</span>
            ) : undefined,
            duration: seQuedan ? 15000 : undefined,
          },
        );

        return;
      }
      const ok = await confirmDialog({
        title: t(
          "ui.NominaDelEvento.confirmarTitulo",
          "¿Archivar a la gente del evento?",
        ),
        message: [
          t("ui.NominaDelEvento.confirmarTexto", {
            defaultValue:
              "Se archivan {{count}} vigilantes sin otro puesto: {{lista}}. Liberan su asiento y siguen cobrando este evento. Si los vuelves a asignar, se reactivan solos.",
            count: plan.archivar.length,
            lista: plan.archivar.map((x) => x.nombre).join(", "),
          }),
          seQuedan,
        ]
          .filter(Boolean)
          .join("\n\n"),
        confirmText: t("ui.NominaDelEvento.archivarAhora", "Archivar ahora"),
      });

      if (!ok) return;
      const h: any = await ApiService.post(`${base}/archivar`, {});
      const n = Number((h?.data ?? h)?.archivados?.length || 0);

      toast.success(
        t("ui.NominaDelEvento.archivadosOk", {
          defaultValue: "{{count}} vigilantes archivados",
          count: n,
        }),
      );
      setVuelta((v) => v + 1);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "error");
    } finally {
      setOcupado(null);
    }
  };

  const columnas: ExportColumn<Fila>[] = [
    {
      label: t("ui.NominaDelEvento.col.vigilante", "Vigilante"),
      value: (f) => f.nombre,
    },
    {
      label: t("ui.NominaDelEvento.col.documento", "Documento"),
      value: (f) => f.documento || "",
    },
    {
      label: t("ui.NominaDelEvento.col.correo", "Correo"),
      value: (f) => f.correo || "",
    },
    {
      label: t("ui.NominaDelEvento.col.zonas", "Zonas"),
      value: (f) => f.zonas.join(" · "),
    },
    {
      label: t("ui.NominaDelEvento.col.turnos", "Turnos"),
      value: (f) => f.turnos.length,
      align: "right",
    },
    {
      label: t("ui.NominaDelEvento.col.programadas", "Horas programadas"),
      value: (f) => f.horasProgramadas,
      align: "right",
    },
    {
      label: t("ui.NominaDelEvento.col.descansoMin", "Descanso (min)"),
      value: (f) => f.descansoMinutos ?? 0,
      align: "right",
    },
    {
      label: t("ui.NominaDelEvento.col.trabajadas", "Horas trabajadas"),
      value: (f) => f.horasTrabajadas,
      align: "right",
    },
    {
      label: t("ui.NominaDelEvento.col.tarifa", {
        defaultValue: "Tarifa ({{moneda}}/h)",
        moneda: evento.moneda,
      }),
      value: (f) => (f.tarifaCentavos != null ? f.tarifaCentavos / 100 : ""),
      align: "right",
    },
    {
      label: t("ui.NominaDelEvento.col.importe", {
        defaultValue: "A pagar ({{moneda}})",
        moneda: evento.moneda,
      }),
      value: (f) => (f.importeCentavos != null ? f.importeCentavos / 100 : ""),
      align: "right",
    },
    {
      label: t("ui.NominaDelEvento.col.incidencias", "Incidencias"),
      value: (f) =>
        [
          f.turnos.filter((x) => x.estado === "noFicho").length
            ? t("ui.NominaDelEvento.nNoFicho", {
                defaultValue: "{{count}} sin fichar",
                count: f.turnos.filter((x) => x.estado === "noFicho").length,
              })
            : "",
          f.turnos.filter((x) => x.estado === "sinSalida").length
            ? t("ui.NominaDelEvento.nSinSalida", {
                defaultValue: "{{count}} sin salida",
                count: f.turnos.filter((x) => x.estado === "sinSalida").length,
              })
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
    },
  ];
  const meta = (sufijo = "") => ({
    title: `${t("ui.NominaDelEvento.titulo", "Nómina del evento")} — ${evento.nombre}`,
    subtitle: `${rangoDelEvento(evento.desde, evento.hasta)} · ${t(
      "ui.NominaDelEvento.resumenExport",
      {
        defaultValue: "{{vigilantes}} vigilantes · {{horas}} h · {{importe}}",
        vigilantes: totales.vigilantes,
        horas: horas(totales.horasTrabajadas),
        importe: dinero(totales.importeCentavos),
      },
    )}`,
    fileBase: `nomina-${evento.nombre}${sufijo}`,
  });

  const exportar = async (formato: ExportFormat) => {
    setOcupado(formato);
    try {
      await exportColumns(formato, columnas, filas, meta());
    } finally {
      setOcupado(null);
    }
  };

  /* El detalle, un renglón por turno: para quien concilia contra los
     fichajes (o lo sube a un sistema de nómina que pide horas por día). */
  const exportarDetalle = async () => {
    setOcupado("detalle");
    try {
      const filasDetalle = filas.flatMap((f) =>
        f.turnos.map((tu) => ({ f, tu })),
      );
      const hm = (v: string | null) =>
        v
          ? soloHora(v, {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            })
          : "";

      await exportColumns(
        "csv",
        [
          {
            label: t("ui.NominaDelEvento.col.vigilante", "Vigilante"),
            value: (x: any) => x.f.nombre,
          },
          {
            label: t("ui.NominaDelEvento.col.documento", "Documento"),
            value: (x: any) => x.f.documento || "",
          },
          {
            label: t("ui.NominaDelEvento.col.zona", "Zona"),
            value: (x: any) => x.tu.estacion || "",
          },
          {
            label: t("ui.NominaDelEvento.col.dia", "Día"),
            value: (x: any) =>
              fechaYHora(x.tu.programadoInicio || x.tu.entrada, {
                hour: undefined,
                minute: undefined,
              }),
          },
          {
            label: t("ui.NominaDelEvento.col.programado", "Programado"),
            value: (x: any) =>
              x.tu.programadoInicio
                ? `${hm(x.tu.programadoInicio)}–${hm(x.tu.programadoFin)}`
                : "",
          },
          {
            label: t("ui.NominaDelEvento.col.entrada", "Entrada"),
            value: (x: any) => hm(x.tu.entrada),
          },
          {
            label: t("ui.NominaDelEvento.col.salida", "Salida"),
            value: (x: any) => hm(x.tu.salida),
          },
          {
            /* El descanso de CADA turno (dueño, 2026-10-14): en el puesto −
               descanso = horas que se pagan. */
            label: t("ui.NominaDelEvento.col.enElPuesto", "En el puesto (h)"),
            value: (x: any) => x.tu.horasEnElPuesto ?? "",
          },
          {
            label: t("ui.NominaDelEvento.col.descansoMin", "Descanso (min)"),
            value: (x: any) => x.tu.descansoMinutos ?? "",
          },
          {
            label: t("ui.NominaDelEvento.col.horasNetas", "Horas netas"),
            value: (x: any) => x.tu.horas,
          },
          {
            label: t("ui.NominaDelEvento.col.estado", "Estado"),
            value: (x: any) => etiquetaEstado(x.tu.estado),
          },
        ],
        filasDetalle,
        meta("-detalle"),
      );
    } finally {
      setOcupado(null);
    }
  };

  function etiquetaEstado(e: Turno["estado"]) {
    return e === "cumplido"
      ? t("ui.NominaDelEvento.estado.cumplido", "Cumplido")
      : e === "sinSalida"
        ? t("ui.NominaDelEvento.estado.sinSalida", "Sin salida")
        : e === "noFicho"
          ? t("ui.NominaDelEvento.estado.noFicho", "No fichó")
          : t("ui.NominaDelEvento.estado.pendiente", "Pendiente");
  }

  // Quien no fichó o no cerró la salida va arriba: en un evento de 120 personas
  // es lo único que la oficina tiene que revisar antes de pagar, y por orden
  // alfabético podía quedar escondido detrás de «Ver los 120».
  const conIncidencia = (f: Fila) =>
    f.turnos.some((x) => x.estado === "noFicho" || x.estado === "sinSalida");
  const ordenadas = [
    ...filas.filter(conIncidencia),
    ...filas.filter((f) => !conIncidencia(f)),
  ];
  const visibles = todos ? ordenadas : ordenadas.slice(0, MOSTRAR);

  /** La insignia de estado de una persona (la misma en tabla y tarjeta). */
  const estadoDeFila = (f: Fila) => {
    const noFicho = f.turnos.filter((x) => x.estado === "noFicho").length;
    const sinSalida = f.turnos.filter((x) => x.estado === "sinSalida").length;

    return noFicho ? (
      <StatusBadge tone="bad">
        {t("ui.NominaDelEvento.nNoFicho", {
          defaultValue: "{{count}} sin fichar",
          count: noFicho,
        })}
      </StatusBadge>
    ) : sinSalida ? (
      <StatusBadge tone="warn">
        {t("ui.NominaDelEvento.nSinSalida", {
          defaultValue: "{{count}} sin salida",
          count: sinSalida,
        })}
      </StatusBadge>
    ) : f.porAprobar === 0 && f.aprobadas > 0 ? (
      <StatusBadge tone="ok">
        {t("ui.NominaDelEvento.aprobada", "Aprobada")}
      </StatusBadge>
    ) : f.turnos.every((x) => x.estado === "pendiente") ? (
      <StatusBadge tone="neutral">
        {t("ui.NominaDelEvento.estado.pendiente", "Pendiente")}
      </StatusBadge>
    ) : (
      <StatusBadge tone="info">
        {t("ui.NominaDelEvento.porAprobar", "Por aprobar")}
      </StatusBadge>
    );
  };

  const verTodosBoton =
    filas.length > MOSTRAR ? (
      <button
        className="cg-focus w-full border-t px-3 py-2 text-sm"
        style={{
          borderColor: "var(--hairline)",
          color: "var(--brand-text)",
        }}
        type="button"
        onClick={() => setTodos((v) => !v)}
      >
        {todos
          ? t("ui.NominaDelEvento.verMenos", "Ver menos")
          : t("ui.NominaDelEvento.verTodos", {
              defaultValue: "Ver los {{count}}",
              count: filas.length,
            })}
      </button>
    ) : null;

  /* ── EVENTO PASADO SIN HORAS: SÓLO HISTORIAL ─────────────────────────────
     Un evento movido al pasado no crea turnos hacia atrás (serían «no fichó»
     falsos), así que la hoja salía como un evento vacío —«Todavía no hay
     vigilantes asignados»— con tarifa, presupuesto y botones a cero. Se dice lo
     que es: historial, sin horas registradas, y quién estuvo asignado. */
  if (terminado && !filas.length) {
    const asignados = datos.asignadosSinHoras || [];

    return (
      <Section
        icon={<Banknote />}
        title={t("ui.NominaDelEvento.titulo", "Nómina del evento")}
      >
        <div className="space-y-3">
          <InfoNote
            title={t(
              "ui.NominaDelEvento.historialTitulo",
              "Evento pasado · historial",
            )}
            tone="info"
          >
            {t(
              "ui.NominaDelEvento.historialSinHoras",
              "No hay horas registradas en este evento: nadie fichó y no hay nada que pagar. Un evento con fechas pasadas no crea turnos hacia atrás.",
            )}
          </InfoNote>
          {asignados.length ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
                {t("ui.NominaDelEvento.historialAsignados", {
                  defaultValue: "Estuvieron asignados ({{count}}), sin horas:",
                  count: asignados.length,
                })}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {asignados.map((a) => (
                  <li
                    key={a.userId}
                    className="glass-flat inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium">{a.nombre}</span>
                    {a.zonas.length ? (
                      <span style={{ color: "var(--ink-soft)" }}>
                        {a.zonas.join(" · ")}
                      </span>
                    ) : null}
                    {a.archivado && (
                      <StatusBadge dot={false} tone="neutral">
                        {t("ui.NominaDelEvento.archivado", "Archivado")}
                      </StatusBadge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {datos.archivado && datos.archivado.archivados > 0 ? (
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("ui.NominaDelEvento.archivadosResumen", {
                defaultValue:
                  "{{count}} vigilantes archivados al terminar · liberaron {{count}} asientos",
                count: datos.archivado.archivados,
              })}
            </p>
          ) : null}
        </div>
      </Section>
    );
  }

  return (
    <Section
      icon={<Banknote />}
      title={t("ui.NominaDelEvento.titulo", "Nómina del evento")}
    >
      <div className="space-y-4">
        {!terminado ? (
          <InfoNote tone="info">
            {t("ui.NominaDelEvento.antes", {
              defaultValue:
                "El evento termina el {{fin}}. Al terminar, aquí salen las horas fichadas de cada vigilante para pagar; ahora ves lo programado, que sirve para presupuestar.",
              fin: fechaYHora(evento.hasta, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: undefined,
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
              }).replace(/,/g, ""),
            })}
          </InfoNote>
        ) : !totales.turnos ? (
          // Sin turnos no hay nada fichado: decir «todos fichados, lista
          // para pagar» con cero vigilantes engañaba.
          <InfoNote
            title={t(
              "ui.NominaDelEvento.historialTitulo",
              "Evento pasado · historial",
            )}
            tone="info"
          >
            {t(
              "ui.NominaDelEvento.terminadoSinTurnos",
              "Evento terminado sin turnos: no hay horas que pagar.",
            )}
          </InfoNote>
        ) : (
          <InfoNote
            title={t(
              "ui.NominaDelEvento.historialTitulo",
              "Evento pasado · historial",
            )}
            tone={totales.noFicho || totales.sinSalida ? "warn" : "ok"}
          >
            {totales.noFicho || totales.sinSalida
              ? [
                  // «Evento terminado» ya lo dice el título de la nota.
                  totales.noFicho
                    ? t("ui.NominaDelEvento.noFichoValeCero", {
                        defaultValue:
                          "{{count}} turnos sin fichar valen cero.",
                        count: totales.noFicho,
                      })
                    : "",
                  totales.sinSalida
                    ? t("ui.NominaDelEvento.sinSalidaNoSePaga", {
                        defaultValue:
                          "{{count}} turnos sin salida no se pagan hasta cerrarlos en Registros de asistencia.",
                        count: totales.sinSalida,
                      })
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              : t(
                  "ui.NominaDelEvento.listo",
                  "Evento terminado y todos los turnos fichados: la nómina está lista para pagar.",
                )}
          </InfoNote>
        )}

        {/* Una cifra por página en el teléfono: dentro de la sección, dos
            tarjetas por página cortaban el importe («MXN 1.3…»). */}
        <StatsStrip
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          porPagina={1}
        >
          <StatCard
            accent="info"
            icon={<Users />}
            label={t("ui.NominaDelEvento.vigilantes", "Vigilantes")}
            value={totales.vigilantes}
          />
          <StatCard
            accent="brand"
            hint={t("ui.NominaDelEvento.deProgramadas", {
              defaultValue: "de {{h}} h programadas",
              h: horas(totales.horasProgramadas),
            })}
            icon={<Clock />}
            label={t("ui.NominaDelEvento.horasTrabajadas", "Horas trabajadas")}
            value={horas(totales.horasTrabajadas)}
          />
          <StatCard
            accent="ok"
            hint={
              totales.sinTarifa
                ? t("ui.NominaDelEvento.sinTarifa", {
                    defaultValue: "{{count}} sin tarifa",
                    count: totales.sinTarifa,
                  })
                : undefined
            }
            icon={<Banknote />}
            label={
              terminado
                ? t("ui.NominaDelEvento.aPagar", "A pagar")
                : t("ui.NominaDelEvento.presupuesto", "Presupuesto")
            }
            value={dinero(
              terminado ? totales.importeCentavos : totales.presupuestoCentavos,
            )}
          />
          <StatCard
            accent={totales.noFicho || totales.sinSalida ? "warn" : "ok"}
            hint={t("ui.NominaDelEvento.desglose", {
              defaultValue: "{{noFicho}} sin fichar · {{sinSalida}} sin salida",
              noFicho: totales.noFicho,
              sinSalida: totales.sinSalida,
            })}
            icon={<AlertTriangle />}
            label={t("ui.NominaDelEvento.cumplidos", "Turnos cumplidos")}
            value={`${totales.cumplidos}/${totales.turnos}`}
          />
        </StatsStrip>

        {/* La tarifa del evento: manda sobre la de la ficha de cada persona. */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">
              {t("ui.NominaDelEvento.tarifaDelEvento", {
                defaultValue: "Tarifa por hora del evento ({{moneda}})",
                moneda: evento.moneda,
              })}
            </span>
            <input
              className="cg-input cg-focus h-9 w-36 px-2 text-sm tabular-nums"
              inputMode="decimal"
              placeholder={t(
                "ui.NominaDelEvento.tarifaPlaceholder",
                "Ej. 22.50",
              )}
              value={tarifa}
              onChange={(e) => setTarifa(e.target.value)}
            />
          </label>
          <Button
            disabled={ocupado !== null}
            size="sm"
            variant="outline"
            onClick={guardarTarifa}
          >
            {ocupado === "tarifa" && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            {t("common.save", "Guardar")}
          </Button>
          <p
            className="basis-full text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            {t(
              "ui.NominaDelEvento.tarifaAyuda",
              "Vacía, se usa la tarifa de la ficha de empleo de cada vigilante.",
            )}
          </p>
        </div>

        {/* Lo que se hace con la hoja */}
        <div className="flex flex-wrap items-center gap-2">
          {terminado && totales.porAprobar > 0 && (
            <Button disabled={ocupado !== null} size="sm" onClick={alAprobar}>
              {ocupado === "aprobar" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-1.5 h-4 w-4" />
              )}
              {t("ui.NominaDelEvento.aprobar", {
                defaultValue: "Aprobar horas ({{count}})",
                count: totales.porAprobar,
              })}
            </Button>
          )}
          {(["excel", "csv", "pdf"] as const).map((f) => (
            <Button
              key={f}
              disabled={ocupado !== null || !filas.length}
              size="sm"
              variant="outline"
              onClick={() => exportar(f)}
            >
              {ocupado === f ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              {f === "excel" ? "Excel" : f.toUpperCase()}
            </Button>
          ))}
          <Button
            disabled={ocupado !== null || !filas.length}
            size="sm"
            variant="ghost"
            onClick={exportarDetalle}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t("ui.NominaDelEvento.detalle", "Detalle por turno (CSV)")}
          </Button>
          {gusto.conectado ? (
            <Button
              disabled={ocupado !== null || !terminado || !evento.periodo}
              size="sm"
              title={
                terminado
                  ? undefined
                  : t(
                      "ui.NominaDelEvento.gustoAlTerminar",
                      "Se envía al terminar el evento",
                    )
              }
              onClick={alGusto}
            >
              {ocupado === "gusto" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-4 w-4" />
              )}
              {t("ui.NominaDelEvento.enviarGusto", "Enviar a Gusto")}
            </Button>
          ) : gusto.disponible ? (
            <Link
              className="cg-btn-link cg-focus text-sm"
              to="/setting/integraciones/gusto"
            >
              {t(
                "ui.NominaDelEvento.conectarGusto",
                "Conectar Gusto para enviar las horas",
              )}
            </Link>
          ) : null}
        </div>

        {/* Al terminar: quién liberó su asiento (y archivar sin esperar). */}
        {datos.archivado &&
          (terminado ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Archive
                aria-hidden
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--ink-soft)" }}
              />
              <span className="min-w-0 flex-1">
                {datos.archivado.archivados > 0
                  ? t("ui.NominaDelEvento.archivadosResumen", {
                      defaultValue:
                        "{{count}} vigilantes archivados al terminar · liberaron {{count}} asientos",
                      count: datos.archivado.archivados,
                    })
                  : datos.archivado.archivarAlTerminar
                    ? t(
                        "ui.NominaDelEvento.archivarAyuda",
                        "Los vigilantes sin otro puesto se archivan solos 12 h después del fin y liberan su asiento. Siguen cobrando: sus horas se quedan en esta hoja.",
                      )
                    : t(
                        "ui.NominaDelEvento.archivarApagado",
                        "Este evento no archiva a su gente al terminar (se cambia al editar el evento).",
                      )}
              </span>
              {filas.some((f) => !f.archivado) && (
                <Button
                  disabled={ocupado !== null}
                  size="sm"
                  variant="outline"
                  onClick={archivarAhora}
                >
                  {ocupado === "archivar" ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="mr-1.5 h-4 w-4" />
                  )}
                  {t("ui.NominaDelEvento.archivarAhora", "Archivar ahora")}
                </Button>
              )}
            </div>
          ) : (
            // Antes de terminar también se dice si el evento NO archiva:
            // si no, quien lo apagó no tenía dónde comprobarlo.
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {datos.archivado.archivarAlTerminar
                ? t(
                    "ui.NominaDelEvento.archivarAyuda",
                    "Los vigilantes sin otro puesto se archivan solos 12 h después del fin y liberan su asiento. Siguen cobrando: sus horas se quedan en esta hoja.",
                  )
                : t(
                    "ui.NominaDelEvento.archivarApagado",
                    "Este evento no archiva a su gente al terminar (se cambia al editar el evento).",
                  )}
            </p>
          ))}

        {/* La hoja */}
        {filas.length && esTelefono ? (
          <div className="space-y-3">
            <MobileCardList
              items={visibles.map((f) => ({ ...f, id: f.userId }))}
              renderCard={(f: Fila) => (
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{f.nombre}</div>
                      <div
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {[f.documento, f.zonas.join(" · ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    {f.archivado && (
                      <StatusBadge className="shrink-0" tone="neutral">
                        {t("ui.NominaDelEvento.archivado", "Archivado")}
                      </StatusBadge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="tabular-nums">
                      {horas(f.horasTrabajadas)}
                      <span
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {" "}
                        / {horas(f.horasProgramadas)} h
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {dinero(
                        terminado ? f.importeCentavos : f.presupuestoCentavos,
                      )}
                    </span>
                    {estadoDeFila(f)}
                  </div>
                </div>
              )}
            />
            {verTodosBoton}
          </div>
        ) : filas.length ? (
          <div
            className="overflow-x-auto rounded-xl border"
            style={{ borderColor: "var(--hairline)" }}
          >
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr
                  className="text-left text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <th className="px-3 py-2 font-medium">
                    {t("ui.NominaDelEvento.col.vigilante", "Vigilante")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("ui.NominaDelEvento.col.zonas", "Zonas")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {t("ui.NominaDelEvento.col.horas", "Horas")}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {terminado
                      ? t("ui.NominaDelEvento.aPagar", "A pagar")
                      : t("ui.NominaDelEvento.presupuesto", "Presupuesto")}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t("ui.NominaDelEvento.col.estado", "Estado")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  return (
                    <tr
                      key={f.userId}
                      className="border-t"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {f.nombre}
                          {f.archivado && (
                            <StatusBadge className="ml-2" tone="neutral">
                              {t("ui.NominaDelEvento.archivado", "Archivado")}
                            </StatusBadge>
                          )}
                        </div>
                        {f.documento && (
                          <div
                            className="text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {f.documento}
                          </div>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {f.zonas.join(" · ")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {horas(f.horasTrabajadas)}
                        <span
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {" "}
                          / {horas(f.horasProgramadas)}
                        </span>
                        {(f.descansoMinutos ?? 0) > 0 && (
                          <span
                            className="block text-[10px]"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {t("ui.NominaDelEvento.descansoDescontado", {
                              min: f.descansoMinutos,
                              defaultValue: "−{{min}} min de descanso",
                            })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {dinero(
                          terminado ? f.importeCentavos : f.presupuestoCentavos,
                        )}
                      </td>
                      <td className="px-3 py-2">{estadoDeFila(f)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {verTodosBoton}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.NominaDelEvento.vacia",
              "Todavía no hay vigilantes asignados a este evento.",
            )}
          </p>
        )}
      </div>
    </Section>
  );
}
