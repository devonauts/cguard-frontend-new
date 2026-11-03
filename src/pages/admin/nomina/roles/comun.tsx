/**
 * ROLES DE PAGO — piezas compartidas por las pantallas del módulo: el candado
 * («no tienes el módulo»), etiquetas, dinero y nombres por idioma.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Lock, PowerOff } from "lucide-react";

import { payrollAccessMode, type PayrollAccess } from "./access";

import { Button } from "@/components/ui/button";
import { EmptyState, InfoNote, Section, SkeletonCards } from "@/components/kit";
import { useEntitlement } from "@/hooks/useEntitlement";
import { faltaElModulo } from "@/lib/rostro";
import { modulosAdicionalesService } from "@/lib/api/modulosAdicionalesService";
import { ADDONS_CHANGED_EVENT } from "@/lib/addonRequired";
import type {
  ConceptKind, ConceptMethod, ConceptBase, HoursOf, PayFrequency, DoubleShiftMode, Population,
} from "@/lib/api/payrollSlipsService";

export const MODULO = "payroll_slips";

/** The server said the role may not (403), not «the module is missing» (402). */
export function sinPermiso(e: unknown): boolean {
  return (e as { status?: number } | null)?.status === 403;
}

export type { PayrollAccess };

/**
 * What the office may do with Payslips right now (see `access.ts`): full,
 * read-only (owned but switched off: only what was issued), none or loading.
 *
 * The paused/owned state comes from the store list, under the SAME query key
 * as `useTiendaDeModulos` (the sidebar and header already keep it warm, and
 * `useAddonChangesLive` invalidates it on `addons:changed`), so this adds no
 * request of its own in practice. The session's entitlement updates on that
 * same event (`refreshProfile`).
 *
 * Call it BEFORE the page's queries: `full` enables the full-access endpoints,
 * `canRead` the read-only ones (sheets, slips, documents). Once the queries
 * answered, `resolve(gatedError, readError)` gives the final mode (a 402 on a
 * full endpoint → ask the store; a 402 on a read-only endpoint → none; a 403
 * on either → denied).
 */
export function usePayrollAccess() {
  const entitled = useEntitlement(MODULO);
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const store = useQuery({
    queryKey: ["modulos-adicionales", "tienda", tenant],
    queryFn: () => modulosAdicionalesService.tienda(),
    enabled: Boolean(tenant),
    staleTime: 60_000,
    retry: false,
  });
  const base = {
    entitled,
    store: store.data?.modules?.find((m) => m.key === MODULO) ?? null,
    storeLoading: Boolean(tenant) && store.isLoading,
  };
  const mode = payrollAccessMode(base);
  const qc = useQueryClient();

  // Switched off/on while the screen is open: a remembered 402 (or a list
  // filtered to the issued sheets) must not outlive the change.
  useEffect(() => {
    const onChange = () => void qc.invalidateQueries({ queryKey: ["payroll-slips"] });

    window.addEventListener(ADDONS_CHANGED_EVENT, onChange);

    return () => window.removeEventListener(ADDONS_CHANGED_EVENT, onChange);
  }, [qc]);

  return {
    mode,
    full: mode === "full",
    readOnly: mode === "readOnly",
    canRead: mode === "full" || mode === "readOnly",
    resolve: (gatedError?: unknown, readError?: unknown): PayrollAccess =>
      payrollAccessMode({
        ...base,
        gatedRefused: faltaElModulo(gatedError),
        readRefused: faltaElModulo(readError),
        forbidden: sinPermiso(gatedError) || sinPermiso(readError),
      }),
  };
}

/** The module is switched off: what still works and where to switch it back on. */
export function AvisoSoloLectura() {
  const { t } = useTranslation();

  return (
    <InfoNote icon={<PowerOff size={16} />} tone="warn">
      <span>
        {t(
          "ui.RolesDePago.soloLectura.aviso",
          "Roles de pago está apagado: puedes ver y descargar los roles ya emitidos. Para generar nuevos, enciéndelo en Módulos adicionales.",
        )}{" "}
        <Link className="font-medium underline underline-offset-2" to="/modulos-adicionales">
          {t("ui.RolesDePago.soloLectura.enlace", "Ir a Módulos adicionales")}
        </Link>
      </span>
    </InfoNote>
  );
}

/** Centavos → «$1.500,00 ARS»; monedas sin decimales (CLP, COP) sin centavos. */
export function dinero(cents: number | string | null | undefined, currency: string, decimals: 0 | 2 = 2): string {
  const n = Number(cents);
  const code = String(currency || "USD").toUpperCase();

  if (cents === null || cents === undefined || !Number.isFinite(n)) return `— ${code}`;
  try {
    const text = new Intl.NumberFormat(LOCALE_DE[code] ?? "es", {
      style: "currency", currency: code, currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(Math.trunc(n) / 100);

    return `${text} ${code}`.replace(/[  ]/g, " ");
  } catch {
    return `${(Math.trunc(n) / 100).toFixed(decimals)} ${code}`;
  }
}

const LOCALE_DE: Record<string, string> = {
  USD: "en-US", MXN: "es-MX", PEN: "es-PE", ARS: "es-AR", PAB: "es-PA", COP: "es-CO", CLP: "es-CL",
  GTQ: "es-GT", CRC: "es-CR", DOP: "es-DO", BRL: "pt-BR", BOB: "es-BO", UYU: "es-UY", HNL: "es-HN",
  NIO: "es-NI", CAD: "en-CA", EUR: "es-ES", PYG: "es-PY", VES: "es-VE", CUP: "es-CU",
};

/** Importe en unidades (lo que escribe la persona) → centavos enteros. */
export function aCentavos(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(String(valor).replace(/\s/g, "").replace(",", "."));

  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function deCentavos(cents: number | string | null | undefined, decimals: 0 | 2 = 2): string {
  const n = Number(cents);

  if (cents === null || cents === undefined || !Number.isFinite(n)) return "";

  return (n / 100).toFixed(decimals);
}

/**
 * UN CAMPO DE DINERO QUE NO SE REFORMATEA MIENTRAS SE ESCRIBE. Con un input
 * controlado por los centavos, teclear «12000» pasaba por «1.00» → «1.002» y
 * acababa guardado como 1,00. Aquí el texto es local y sólo se normaliza al salir.
 */
export function MoneyInput({
  cents, onCents, decimals = 2, disabled, className, placeholder, id,
}: {
  cents: number | null | undefined;
  onCents: (c: number | null) => void;
  decimals?: 0 | 2;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  const [texto, setTexto] = useState(deCentavos(cents, decimals));
  const ultimo = useRef<number | null | undefined>(cents);

  useEffect(() => {
    if (cents !== ultimo.current) {
      ultimo.current = cents;
      setTexto(deCentavos(cents, decimals));
    }
  }, [cents, decimals]);

  return (
    <input
      className={className}
      disabled={disabled}
      id={id}
      inputMode="decimal"
      placeholder={placeholder}
      value={texto}
      onBlur={() => setTexto(deCentavos(ultimo.current, decimals))}
      onChange={(e) => {
        setTexto(e.target.value);
        const c = aCentavos(e.target.value);

        ultimo.current = c;
        onCents(c);
      }}
    />
  );
}

/** El nombre de un concepto en el idioma de la pantalla, con caída al español. */
export function nombreDeConcepto(name: Record<string, string> | string | null | undefined, lang: string): string {
  if (!name) return "";
  if (typeof name === "string") return name;
  const corto = String(lang || "es").slice(0, 2);

  return name[lang] || name[corto] || name.es || name.en || Object.values(name)[0] || "";
}

/** El nombre del país en el idioma de la pantalla («Ecuador», «Brasil»). */
export function nombreDePais(code: string, lang: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([lang || "es"], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

export function useEtiquetas() {
  const { t } = useTranslation();

  const kind: Record<ConceptKind, string> = {
    earning: t("ui.RolesDePago.tipo.earning", "Ingreso"),
    deduction: t("ui.RolesDePago.tipo.deduction", "Deducción"),
    employer: t("ui.RolesDePago.tipo.employer", "Aporte del empleador"),
    info: t("ui.RolesDePago.tipo.info", "Informativo"),
  };
  const method: Record<ConceptMethod, string> = {
    fixed: t("ui.RolesDePago.metodo.fixed", "Importe fijo por periodo"),
    percent: t("ui.RolesDePago.metodo.percent", "Porcentaje sobre una base"),
    hours: t("ui.RolesDePago.metodo.hours", "Por horas de la tarjeta"),
    days: t("ui.RolesDePago.metodo.days", "Por días (sueldo ÷ 30)"),
    table: t("ui.RolesDePago.metodo.table", "Tabla por tramos"),
    manual: t("ui.RolesDePago.metodo.manual", "Se escribe en cada rol"),
  };
  const base: Record<ConceptBase, string> = {
    base_salary: t("ui.RolesDePago.base.base_salary", "Sueldo base"),
    gross: t("ui.RolesDePago.base.gross", "Total de ingresos"),
    ss_base: t("ui.RolesDePago.base.ss_base", "Base de seguridad social"),
    tax_base: t("ui.RolesDePago.base.tax_base", "Base de renta"),
    legal_minimum: t("ui.RolesDePago.base.legal_minimum", "Mínimo legal"),
    net: t("ui.RolesDePago.base.net", "Neto"),
  };
  const hours: Record<HoursOf, string> = {
    ordinary: t("ui.RolesDePago.horas.ordinary", "Horas ordinarias"),
    overtime1: t("ui.RolesDePago.horas.overtime1", "Horas extra (tipo 1)"),
    overtime2: t("ui.RolesDePago.horas.overtime2", "Horas extra (tipo 2)"),
    night: t("ui.RolesDePago.horas.night", "Horas nocturnas"),
    holiday: t("ui.RolesDePago.horas.holiday", "Horas en feriado"),
    rest_day: t("ui.RolesDePago.horas.rest_day", "Horas en día de descanso"),
    sunday: t("ui.RolesDePago.horas.sunday", "Horas en domingo"),
    double_shift: t("ui.RolesDePago.horas.double_shift", "Horas de doblada"),
    night_overtime: t("ui.RolesDePago.horas.night_overtime", "Horas extra nocturnas"),
    saturday: t("ui.RolesDePago.horas.saturday", "Horas en sábado"),
  };
  const frequency: Record<PayFrequency, string> = {
    weekly: t("ui.RolesDePago.frecuencia.weekly", "Semanal"),
    biweekly: t("ui.RolesDePago.frecuencia.biweekly", "Catorcenal (cada 14 días)"),
    semimonthly: t("ui.RolesDePago.frecuencia.semimonthly", "Quincenal (1–15 y 16–fin)"),
    monthly: t("ui.RolesDePago.frecuencia.monthly", "Mensual"),
  };
  const doubleShift: Record<DoubleShiftMode, string> = {
    overtime: t("ui.RolesDePago.doblada.overtime", "Según la política de horas extra"),
    normal_plus_advance: t("ui.RolesDePago.doblada.normal_plus_advance", "Turno normal + adelanto de turno"),
    double: t("ui.RolesDePago.doblada.double", "Turno doble (se paga dos veces)"),
    bonus: t("ui.RolesDePago.doblada.bonus", "Turno normal + premio por doblete"),
  };
  const population: Record<Population, string> = {
    vigilante: t("ui.RolesDePago.poblacion.vigilante", "Vigilantes"),
    supervisor: t("ui.RolesDePago.poblacion.supervisor", "Supervisores"),
    oficina: t("ui.RolesDePago.poblacion.oficina", "Oficina"),
  };

  return { kind, method, base, hours, frequency, doubleShift, population };
}

/**
 * Sin el módulo: qué hace, en tres pasos, y dónde se consigue. With `modo`
 * read-only (owned but switched off) a full-access screen shows the notice and
 * the way to the issued sheets instead; while loading, a skeleton.
 */
export function PresentacionDelModulo({ modo }: { modo?: PayrollAccess } = {}) {
  const { t } = useTranslation();

  if (modo === "loading") return <SkeletonCards count={3} />;
  if (modo === "denied") {
    return (
      <EmptyState
        action={
          <Button asChild variant="outline">
            <Link to="/setting/roles">{t("settings.configuracion.roles", "Roles y permisos")}</Link>
          </Button>
        }
        description={t(
          "ui.RolesDePago.sinPermiso.desc",
          "Tu rol no tiene los permisos de Roles de pago (ver y editar roles y perfiles de pago). Un administrador puede dárselos en Roles y permisos.",
        )}
        icon={<Lock />}
        title={t("ui.RolesDePago.sinPermiso.titulo", "Tu rol no puede abrir Roles de pago")}
      />
    );
  }
  if (modo === "readOnly") {
    return (
      <div className="space-y-4">
        <AvisoSoloLectura />
        <div className="cg-acciones justify-end">
          <Button asChild variant="brand">
            <Link to="/nomina/roles/planillas">{t("ui.RolesDePago.soloLectura.verPlanillas", "Ver las planillas emitidas")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <Presentacion />;
}

function Presentacion() {
  const { t } = useTranslation();
  const pasos = [
    t("ui.RolesDePago.modulo.paso1", "Dices en qué país estás, el sueldo base de la empresa y cómo trabaja cada persona (sueldo propio, empleado o contratista)."),
    t("ui.RolesDePago.modulo.paso2", "Las horas salen solas de la asistencia: ordinarias, extra, nocturnas y feriados, con los recargos de tu país ajustados a tu empresa."),
    t("ui.RolesDePago.modulo.paso3", "Generas la planilla del periodo y el rol de cada trabajador en PDF y Excel, con bonos, multas, préstamos y descuentos. Si lo activas, cada uno ve sus roles en la app."),
  ];

  return (
    <Section icon={<FileSpreadsheet />} title={t("ui.RolesDePago.modulo.titulo", "La nómina de cada periodo, lista para pagar")}>
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {t(
          "ui.RolesDePago.modulo.desc",
          "Con el módulo «Roles de pago», las horas que ya controlas se convierten en la planilla de pago de la empresa y en el rol individual de cada trabajador, con las reglas de tu país como punto de partida.",
        )}
      </p>
      <ol className="mt-4 space-y-2">
        {pasos.map((p, i) => (
          <li key={i} className="glass-flat flex items-start gap-3 p-3 text-sm">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums"
              style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}
            >
              {i + 1}
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <div className="cg-acciones mt-4 justify-end">
        <Button asChild variant="brand">
          <Link to="/modulos-adicionales">{t("ui.RolesDePago.modulo.enlace", "Ver en Módulos adicionales")}</Link>
        </Button>
      </div>
    </Section>
  );
}
