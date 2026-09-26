/**
 * ════════════════════════════════════════════════════════════════════════════
 * REGISTROS DEL SISTEMA — LA BITÁCORA QUE SE LEE SOLA
 *
 * Cada fila contesta, sin abrir nada: QUIÉN (nombre, rol y desde dónde), QUÉ
 * (la frase que escribe el servidor: «Extendió el turno de María López»),
 * RESULTADO (hecho, consulta, rechazado, error) y CUÁNDO. Al abrirla: el
 * cambio campo a campo (antes → después) y desde dónde (IP, dispositivo,
 * petición).
 *
 * Las filas anteriores al 2026-09-26 no traen frase ni actor completo: se
 * pintan con lo que tienen (acción + registro + correo), sin romper.
 * Ver `backend/src/lib/auditoria.ts` para la forma de la fila.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollText,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  PencilLine,
  Trash2,
  Activity,
  Inbox,
  Eye,
  Download,
  ShieldX,
  AlertTriangle,
  Cpu,
  UserCog,
} from "lucide-react";
import type { ReactNode } from "react";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageContainer,
  PageHeader,
  Section,
  Toolbar,
  Segmented,
  StatusBadge,
  EmptyState,
  Avatar,
} from "@/components/kit";
import { useInfiniteAuditList } from "./useInfiniteAuditList";
import {
  AuditRow,
  AuditSearch,
  AuditSkeleton,
  AuditTable,
  InfiniteFooter,
  SeverityRail,
  fmtStamp,
  type SeverityTone,
} from "./shared";

type LogRow = {
  id: string;
  entityName: string;
  entityId: string;
  action: string;
  actionCode?: string | null;
  description?: string | null;
  createdById?: string | null;
  createdByEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  channel?: string | null;
  via?: string | null;
  outcome?: string | null;
  statusCode?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  impersonatedById?: string | null;
  changes?: any;
  timestamp: string;
  values?: any;
};

const PAGE_SIZE = 50;

/* ── Etiquetas: se guardan CLAVES, se traducen en el render ─────────────── */

const CANALES: Record<string, { key: string; label: string }> = {
  crm: { key: "ui.SystemLogs.canal.crm", label: "CRM" },
  app_vigilante: { key: "ui.SystemLogs.canal.appVigilante", label: "App del vigilante" },
  app_supervisor: { key: "ui.SystemLogs.canal.appSupervisor", label: "App del supervisor" },
  portal_cliente: { key: "ui.SystemLogs.canal.portalCliente", label: "Portal del cliente" },
  superadmin: { key: "ui.SystemLogs.canal.superadmin", label: "Soporte de la plataforma" },
  socio: { key: "ui.SystemLogs.canal.socio", label: "Panel del distribuidor" },
  sistema: { key: "ui.SystemLogs.canal.sistema", label: "Automático" },
  webhook: { key: "ui.SystemLogs.canal.webhook", label: "Integración" },
  receptora: { key: "ui.SystemLogs.canal.receptora", label: "Receptora de alarmas" },
  publico: { key: "ui.SystemLogs.canal.publico", label: "Enlace público" },
  socket: { key: "ui.SystemLogs.canal.socket", label: "Tiempo real" },
};

const ROLES: Record<string, { key: string; label: string }> = {
  admin: { key: "ui.SystemLogs.rol.admin", label: "Administrador" },
  securityguard: { key: "ui.SystemLogs.rol.vigilante", label: "Vigilante" },
  securitysupervisor: { key: "ui.SystemLogs.rol.supervisor", label: "Supervisor" },
  customer: { key: "ui.SystemLogs.rol.cliente", label: "Cliente" },
  operationsmanager: { key: "ui.SystemLogs.rol.operaciones", label: "Jefe de operaciones" },
  dispatcher: { key: "ui.SystemLogs.rol.despachador", label: "Despachador" },
  hrmanager: { key: "ui.SystemLogs.rol.rrhh", label: "Recursos humanos" },
  clientaccountmanager: { key: "ui.SystemLogs.rol.ejecutivo", label: "Ejecutivo de cuenta" },
  "central-operator": { key: "ui.SystemLogs.rol.centralista", label: "Centralista" },
  superadmin: { key: "ui.SystemLogs.rol.soporte", label: "Soporte de la plataforma" },
  sistema: { key: "ui.SystemLogs.rol.sistema", label: "Sistema" },
  webhook: { key: "ui.SystemLogs.rol.integracion", label: "Integración" },
  publico: { key: "ui.SystemLogs.rol.publico", label: "Sin sesión" },
};

/** Tono e icono por resultado; si no hay resultado (filas viejas), por acción. */
function metaDe(r: LogRow): { tone: SeverityTone; icon: ReactNode; key: string; label: string } {
  const o = String(r.outcome || "");
  const a = String(r.action || "").toLowerCase();
  if (o === "rechazado" || a === "denied")
    return { tone: "bad", icon: <ShieldX className="size-3.5" />, key: "ui.SystemLogs.res.rechazado", label: "Rechazado" };
  if (o === "error")
    return { tone: "warn", icon: <AlertTriangle className="size-3.5" />, key: "ui.SystemLogs.res.error", label: "No se completó" };
  if (a === "export")
    return { tone: "info", icon: <Download className="size-3.5" />, key: "ui.SystemLogs.res.exportacion", label: "Descarga" };
  if (o === "lectura" || a === "read")
    return { tone: "info", icon: <Eye className="size-3.5" />, key: "ui.SystemLogs.res.lectura", label: "Consulta" };
  if (a.includes("delete") || a.includes("destroy"))
    return { tone: "bad", icon: <Trash2 className="size-3.5" />, key: "security.logs.actionDelete", label: "Eliminación" };
  if (a.includes("update"))
    return { tone: "warn", icon: <PencilLine className="size-3.5" />, key: "security.logs.actionUpdate", label: "Actualización" };
  if (a.includes("create"))
    return { tone: "ok", icon: <PlusCircle className="size-3.5" />, key: "security.logs.actionCreate", label: "Creación" };
  return { tone: "neutral", icon: <Activity className="size-3.5" />, key: "", label: r.action || "—" };
}

/* ── Filtros ─────────────────────────────────────────────────────────────── */

type Tipo = "" | "cambios" | "lecturas" | "rechazos" | "errores" | "sistema";

const TIPOS: Array<{ value: Tipo; key: string; label: string }> = [
  { value: "", key: "ui.SystemLogs.tipo.todo", label: "Todo" },
  { value: "cambios", key: "ui.SystemLogs.tipo.cambios", label: "Cambios" },
  { value: "lecturas", key: "ui.SystemLogs.tipo.lecturas", label: "Consultas y descargas" },
  { value: "rechazos", key: "ui.SystemLogs.tipo.rechazos", label: "Rechazos" },
  { value: "errores", key: "ui.SystemLogs.tipo.errores", label: "Errores" },
  { value: "sistema", key: "ui.SystemLogs.tipo.sistema", label: "Automático" },
];

function aplicarTipo(p: URLSearchParams, tipo: Tipo) {
  if (tipo === "cambios") p.set("filter[actions]", "create,update,delete");
  if (tipo === "lecturas") p.set("filter[actions]", "read,export");
  if (tipo === "rechazos") p.set("filter[outcome]", "rechazado");
  if (tipo === "errores") p.set("filter[outcome]", "error");
  if (tipo === "sistema") p.set("filter[channels]", "sistema,webhook,receptora");
}

/* ── El cambio: { campo: [antes, después] } y sus variantes ─────────────── */

const vacio = (v: any) => v === null || v === undefined || v === "";

function valorLegible(v: any): string {
  if (vacio(v)) return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "object") {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  const s = String(v);
  // Fechas ISO: en la hora de la empresa, como el resto de la pantalla.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return fmtStamp(s);
  return s;
}

/** Pares [campo, antes, después]. Acepta el plano, el agrupado por registro y la copia de borrados. */
function paresDeCambio(changes: any): Array<{ grupo?: string; campo: string; antes: any; despues: any }> {
  if (!changes || typeof changes !== "object") return [];
  // La copia de un borrado definitivo no es un cambio campo a campo: se pinta aparte.
  if (copiaDeBorrado(changes)) return [];
  const out: Array<{ grupo?: string; campo: string; antes: any; despues: any }> = [];
  const esPar = (v: any) => Array.isArray(v) && v.length === 2;
  const plano = Object.values(changes).every(esPar);
  const volcar = (obj: any, grupo?: string) => {
    for (const [campo, v] of Object.entries(obj || {})) {
      if (esPar(v)) out.push({ grupo, campo, antes: (v as any)[0], despues: (v as any)[1] });
    }
  };
  if (plano) volcar(changes);
  else for (const [grupo, obj] of Object.entries(changes)) if (obj && typeof obj === "object" && !Array.isArray(obj)) volcar(obj, grupo);
  return out;
}

/** La copia de un borrado definitivo (`filas`/`turnos`): lista, no pares. */
function copiaDeBorrado(changes: any): any[] | null {
  const c = changes?.filas || changes?.turnos;
  return Array.isArray(c) && Array.isArray(c[0]) ? c[0] : null;
}

/** Nombre de campo legible: los comunes por nombre, el resto deletreado. */
const CAMPOS: Record<string, string> = {
  name: "nombre", title: "título", fullName: "nombre", firstName: "nombre", lastName: "apellido",
  email: "correo", phoneNumber: "teléfono", status: "estado", workStatus: "estado de trabajo",
  priority: "prioridad", description: "descripción", notes: "notas", internalNotes: "notas internas",
  startTime: "inicio", endTime: "fin", punchInTime: "entrada", punchOutTime: "salida",
  scheduledEnd: "fin previsto", scheduledStart: "inicio previsto", stationId: "puesto",
  stationNameId: "puesto", guardId: "vigilante", guardNameId: "vigilante", postSiteId: "sede",
  roles: "roles", billingStatus: "estado de cobro", plan: "plan", suspendedAt: "suspendida el",
  hourlyRateCents: "tarifa por hora (centavos)", monthlyRateCents: "sueldo mensual (centavos)",
  assignedToUserId: "asignado a", dispatchStatus: "estado del despacho", forcedClockOut: "cierre forzado",
  address: "dirección", active: "activo", archived: "archivado", reason: "motivo", module: "módulo",
  acknowledgedAt: "atendido el", dunningStage: "aviso de impago nº", password: "contraseña",
  observations: "observaciones", filas: "registros", turnos: "turnos",
};
const nombreCampo = (c: string) =>
  CAMPOS[c] || c.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").toLowerCase();

function dispositivo(ua?: string | null): string {
  if (!ua) return "—";
  if (/iPhone|iPad/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Electron/i.test(ua)) return "CRM de escritorio";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";
  if (/curl|node|axios|python/i.test(ua)) return "Integración";
  return ua.slice(0, 40);
}

export default function SystemLogs() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tipo, setTipo] = useState<Tipo>("");
  const [canal, setCanal] = useState("todos");
  const [expanded, setExpanded] = useState<string | null>(null);

  const tid = () => localStorage.getItem("tenantId") || "";

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(h);
  }, [q]);

  const buildParams = useCallback(
    (offset: number, limit: number) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      params.set("orderBy", "timestamp_DESC");
      aplicarTipo(params, tipo);
      if (canal !== "todos") params.set("filter[channels]", canal);
      if (debouncedQ.trim()) params.set("filter[search]", debouncedQ.trim());
      return params;
    },
    [tipo, canal, debouncedQ],
  );

  const { items, total, loading, hasMore, load, sentinelRef } =
    useInfiniteAuditList<LogRow>({
      endpoint: `/tenant/${tid()}/audit-log`,
      pageSize: PAGE_SIZE,
      buildParams,
      deps: [tipo, canal, debouncedQ],
      onReset: () => setExpanded(null),
    });

  const primeraCarga = loading && items.length === 0;

  const etiquetaCanal = (c?: string | null) =>
    c && CANALES[c] ? t(CANALES[c].key, CANALES[c].label) : "";
  const etiquetaRol = (r?: string | null) =>
    String(r || "")
      .split(",")
      .filter(Boolean)
      .map((x) => {
        const m = ROLES[x.trim().toLowerCase()];
        return m ? t(m.key, m.label) : x.trim();
      })
      .join(", ");

  /** La frase: la del servidor, o la reconstruida para filas antiguas. */
  const fraseDe = (r: LogRow) => {
    if (r.description) return r.description;
    const m = metaDe(r);
    return `${m.key ? t(m.key, m.label) : m.label} · ${r.entityName}`;
  };

  const quienDe = (r: LogRow) =>
    r.actorName || r.createdByEmail || t("ui.SystemLogs.desconocido", "Desconocido");

  const esAutomatico = (r: LogRow) =>
    ["sistema", "webhook", "receptora"].includes(String(r.channel || "")) ||
    String(r.createdByEmail || "").startsWith("sistema");

  return (
    <AppLayout>
      <PageContainer width="wide" className="pt-4 sm:pt-6">
        <PageHeader
          icon={<ScrollText />}
          title={t("ui.SystemLogs.registrosDelSistema")}
          subtitle={t(
            "ui.SystemLogs.subtituloCompleto",
            "Todo lo que pasa en la empresa: quién lo hizo, desde dónde, qué cambió y cómo terminó.",
          )}
          badges={
            !primeraCarga ? (
              <StatusBadge tone="neutral" dot={false}>
                {items.length}
                {total ? ` / ${total}` : ""}
              </StatusBadge>
            ) : undefined
          }
        />

        <Toolbar>
          <AuditSearch
            value={q}
            onChange={setQ}
            placeholder={t(
              "ui.SystemLogs.buscarPersonaOAccion",
              "Buscar por persona, acción o registro…",
            )}
          />

          <Button
            variant="outline"
            size="icon"
            className="ml-auto"
            onClick={() => load(true)}
            title={t("ui.AuditLogs.recargar", "Recargar")}
            aria-label={t("ui.AuditLogs.recargar", "Recargar")}
          >
            <RefreshCw className={`size-4 ${primeraCarga ? "animate-spin" : ""}`} />
          </Button>
        </Toolbar>

        {/* El tipo va en su propia fila: dentro de la barra, junto al buscador
            y al selector de canal, en el teléfono se quedaba en una píldora. */}
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 max-w-full overflow-x-auto">
            <Segmented
              value={tipo}
              onChange={(v) => setTipo(v as Tipo)}
              options={TIPOS.map((f) => ({ value: f.value, label: t(f.key, f.label) }))}
            />
          </div>
          <Select value={canal} onValueChange={setCanal}>
            <SelectTrigger className="h-9 w-full sm:w-[210px]" aria-label={t("ui.SystemLogs.canalTitulo", "Desde dónde")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t("ui.SystemLogs.canal.todos", "Desde cualquier sitio")}</SelectItem>
              {Object.entries(CANALES).map(([k, v]) => (
                <SelectItem key={k} value={k}>{t(v.key, v.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Section contentClassName="-mx-5 -mb-5">
          {primeraCarga ? (
            <AuditSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                className="border-0"
                icon={<Inbox />}
                title={t("comun.sinRegistros")}
                description={
                  q.trim() || tipo || canal !== "todos"
                    ? t("ui.SystemLogs.sinCoincidencias", "Ninguna acción coincide con la búsqueda o el filtro elegido.")
                    : t("ui.SystemLogs.sinNada", "Todavía no se ha registrado ninguna acción.")
                }
              />
            </div>
          ) : (
            <AuditTable
              head={
                <>
                  <th className="px-4 py-3">{t("ui.SystemLogs.quePaso", "Qué pasó")}</th>
                  <th className="px-3 py-3">{t("ui.SystemLogs.quien", "Quién")}</th>
                  <th className="px-3 py-3">{t("ui.SystemLogs.resultado", "Resultado")}</th>
                  <th className="px-3 py-3 text-right">{t("comun.fecha")}</th>
                  <th className="px-2 py-3"></th>
                </>
              }
            >
              {items.map((r) => {
                const m = metaDe(r);
                const isOpen = expanded === r.id;
                const pares = paresDeCambio(r.changes);
                const copia = copiaDeBorrado(r.changes);
                const auto = esAutomatico(r);
                return (
                  <Fragment key={r.id}>
                    <AuditRow tone={m.tone} onClick={() => setExpanded(isOpen ? null : r.id)}>
                      <td className="relative px-4 py-2.5" data-rotulo={t("ui.SystemLogs.quePaso", "Qué pasó")}>
                        <SeverityRail tone={m.tone} />
                        <div className="font-medium leading-snug [overflow-wrap:anywhere]">{fraseDe(r)}</div>
                        {pares.length > 0 && (
                          <div className="mt-0.5 line-clamp-2 text-xs [overflow-wrap:anywhere]" style={{ color: "var(--ink-soft)" }}>
                            {pares.slice(0, 2).map((p, i) => (
                              <span key={i} className="mr-3">
                                {nombreCampo(p.campo)}: {valorLegible(p.antes)} → {valorLegible(p.despues)}
                              </span>
                            ))}
                            {pares.length > 2 && `+${pares.length - 2}`}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5" data-rotulo={t("ui.SystemLogs.quien", "Quién")}>
                        <div className="flex items-center gap-2">
                          <Avatar
                            size="sm"
                            name={auto ? null : quienDe(r)}
                            icon={auto ? <Cpu className="size-3.5" /> : undefined}
                            tone={auto ? "neutral" : "brand"}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{quienDe(r)}</div>
                            <div className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>
                              {[etiquetaRol(r.actorRole), etiquetaCanal(r.channel)].filter(Boolean).join(" · ")}
                            </div>
                            {r.impersonatedById && (
                              <StatusBadge tone="warn" dot={false} className="mt-1">
                                <UserCog className="size-3" />
                                {t("ui.SystemLogs.hechoPorSoporte", "Lo hizo el soporte de la plataforma")}
                              </StatusBadge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5" data-rotulo={t("ui.SystemLogs.resultado", "Resultado")}>
                        <StatusBadge tone={m.tone} dot={false}>
                          {m.icon}
                          {m.key ? t(m.key, m.label) : m.label}
                        </StatusBadge>
                      </td>
                      <td
                        data-rotulo={t("comun.fecha")}
                        className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {fmtStamp(r.timestamp)}
                      </td>
                      <td className="px-2 py-2.5" style={{ color: "var(--ink-faint)" }}>
                        {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </td>
                    </AuditRow>

                    {isOpen && (
                      <tr className="border-b" style={{ borderColor: "var(--hairline)", background: "var(--glass-sunken)" }}>
                        <td colSpan={5} className="space-y-3 px-4 py-3">
                          {pares.length > 0 && (
                            <div>
                              <div className="mb-1 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
                                {t("ui.SystemLogs.queCambio", "Qué cambió")}
                              </div>
                              {/* Rejilla, no <table>: dentro de la ficha del teléfono una tabla
                                  anidada heredaba el plegado en fichas y se desordenaba. */}
                              <div className="grid grid-cols-[minmax(90px,auto)_1fr_1fr] gap-x-3 text-xs">
                                <div className="py-1 font-medium" style={{ color: "var(--ink-faint)" }}>{t("ui.SystemLogs.campo", "Campo")}</div>
                                <div className="py-1 font-medium" style={{ color: "var(--ink-faint)" }}>{t("ui.SystemLogs.antes", "Antes")}</div>
                                <div className="py-1 font-medium" style={{ color: "var(--ink-faint)" }}>{t("ui.SystemLogs.despues", "Después")}</div>
                                {pares.map((p, i) => (
                                  <Fragment key={i}>
                                    <div className="border-t py-1" style={{ borderColor: "var(--hairline)" }}>{nombreCampo(p.campo)}</div>
                                    <div className="border-t py-1 [overflow-wrap:anywhere]" style={{ borderColor: "var(--hairline)", color: "var(--ink-soft)" }}>{valorLegible(p.antes)}</div>
                                    <div className="border-t py-1 [overflow-wrap:anywhere]" style={{ borderColor: "var(--hairline)" }}>{valorLegible(p.despues)}</div>
                                  </Fragment>
                                ))}
                              </div>
                            </div>
                          )}

                          {copia && (
                            <div>
                              <div className="mb-1 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
                                {t("ui.SystemLogs.copiaBorrado", "Copia de lo que se borró")} ({copia.length})
                              </div>
                              <pre className="glass-sunken max-h-60 overflow-auto p-3 text-xs">
                                {JSON.stringify(copia, null, 2)}
                              </pre>
                            </div>
                          )}

                          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                            {[
                              [t("ui.SystemLogs.registro", "Registro"), `${r.entityName}${r.entityId && r.entityId !== "-" ? ` · ${r.entityId}` : ""}`],
                              [t("ui.SystemLogs.accionCodigo", "Acción"), r.actionCode || r.action],
                              [t("ui.SystemLogs.canalTitulo", "Desde dónde"), etiquetaCanal(r.channel) || "—"],
                              [t("ui.SystemLogs.correo", "Cuenta"), r.createdByEmail || "—"],
                              [t("ui.SystemLogs.ip", "Dirección IP"), r.ip || "—"],
                              [t("ui.SystemLogs.dispositivo", "Dispositivo"), dispositivo(r.userAgent)],
                              [t("ui.SystemLogs.codigoHttp", "Respuesta"), r.statusCode ? String(r.statusCode) : "—"],
                              [t("ui.SystemLogs.peticion", "Referencia"), r.requestId || "—"],
                            ].map(([k, v]) => (
                              <div key={k} className="flex min-w-0 gap-2">
                                <dt className="shrink-0" style={{ color: "var(--ink-faint)" }}>{k}:</dt>
                                <dd className="min-w-0 break-all font-mono">{v}</dd>
                              </div>
                            ))}
                          </dl>

                          <details>
                            <summary className="cursor-pointer text-xs" style={{ color: "var(--ink-faint)" }}>
                              {t("ui.SystemLogs.datosTecnicos", "Datos técnicos")}
                            </summary>
                            <pre className="glass-sunken mt-1 max-h-72 overflow-auto p-3 text-xs">
                              {JSON.stringify(r.values ?? {}, null, 2)}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </AuditTable>
          )}

          <InfiniteFooter
            sentinelRef={sentinelRef}
            loading={loading}
            hasMore={hasMore}
            count={items.length}
            endLabel={t("ui.SystemLogs.fin", "Fin de los registros")}
          />
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
