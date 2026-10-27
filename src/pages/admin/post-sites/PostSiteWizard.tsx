/**
 * PostSiteWizard — multi-step creation flow for Sitio de Servicio
 *
 * Steps:
 *  1  Tipo de servicio      — service-type card picker
 *  2  Sitio & Ubicación     — client, address, description
 *  3  Configuración         — type-specific config + custom equipment / training
 *  4  Horario & Contacto    — schedule, hours, phone, email
 *  5  Resumen & Crear       — review → POST → inline station builder
 */

import { localeActual } from "@/lib/localeActual";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  X,
  Trash2,
  Shield,
  BellElectric,
  Camera,
  Car,
  Lock,
  Tag,
  Users,
  Clock,
  MapPin,
  Building2,
  Loader2,
  Check,
  Star,
  Zap,
  AlertTriangle,
  Navigation2,
  Globe,
  Hash,
  ChevronDown,
  ChevronUp,
  Edit3,
  ArrowRight,
} from "lucide-react";
import { ImagePlus, Upload, CalendarRange, CalendarClock } from "lucide-react";

import { invalidateEntity } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { stationService } from "@/lib/api/stationService";
import { ApiService } from "@/services/api/apiService";
import { jornadasDePlazas, jornadasPorTipo } from "@/lib/jornadasDePlazas";
import { clientService } from "@/lib/api/clientService";
import { ServiceTypePicker } from "@/components/post-sites/ServiceTypeBadge";
import AddressAutocomplete, {
  AddressComponents,
} from "@/components/maps/AddressAutocomplete";
import { useClientSelection } from "@/contexts/ClientSelectionContext";
import { getServiceType, esEvento } from "@/lib/serviceTypes";
import {
  EVENTO_MAX_DIAS,
  avisosDeVueltaAlFuturo,
  configParaGuardar,
  eventoTerminado,
  pasaAlPasado,
  validarVigencia,
  vuelveAlFuturo,
  type ErrorVigencia,
  type VueltaAlFuturo,
} from "@/lib/eventos";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { desdeInputFechaHora, paraInputFechaHora } from "@/lib/horaDeLaEmpresa";
import { Section, EmptyState, IconTile, InfoNote } from "@/components/kit";
import CampoSucursalDeSede from "@/components/post-sites/CampoSucursalDeSede";
import { HiloDePuesta } from "@/components/onboarding/PuestaEnMarcha";
import StationCreateForm, {
  type StationCreada,
} from "@/components/stations/StationCreateForm";

// ─── types ────────────────────────────────────────────────────────────────────

export type WizardClient = { id: string; name: string };

interface WizardProps {
  clients?: WizardClient[];
  mode?: "create" | "edit";
  id?: string;
  /** Cliente ya decidido por el contexto de navegación (se entró desde su
   *  ficha). Cuando llega, el paso 2 lo da por hecho: no se pregunta ni se
   *  puede cambiar — la sede pertenece a ese cliente y punto. */
  presetClientId?: string;
  presetClientName?: string;
}

interface JornadaDraft {
  id: string;
  nombre: string;
  tipo: "matutina" | "nocturna" | "sacafranco" | "personalizada";
  startTime: string;
  endTime: string;
  guardsCount: string;
}

interface StationDraft {
  name: string;
  description: string;
  jornadas: JornadaDraft[];
  existingId?: string;
  existingScheduleType?: string; // current engine scheduleType (to detect changes)
}

// Client detail fields consulted for the "same address as client" toggle.
interface ClientDetail {
  name?: string;
  lastName?: string;
  commercialName?: string;
  address?: string;
  addressLine2?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  latitude?: number | string;
  longitude?: number | string;
}
// An uploaded file association (site photo).
interface FileAsset {
  downloadUrl?: string;
  publicUrl?: string;
}
// A raw station row from stationService.list, read in edit mode.
interface StationApiRow {
  id?: string;
  stationName?: string;
  name?: string;
  description?: string;
  scheduleType?: string;
}

// Map the station's turnos (jornadas) to the scheduling engine's scheduleType.
// Day = matutina, night = nocturna; both → 24h; otherwise custom. Sacafranco
// jornadas are relief, not a station coverage type.
function deriveScheduleType(
  jornadas: JornadaDraft[],
): "24h" | "12h-day" | "12h-night" | "custom" | null {
  const hasDay = jornadas.some((j) => j.tipo === "matutina");
  const hasNight = jornadas.some((j) => j.tipo === "nocturna");

  if (hasDay && hasNight) return "24h";
  if (hasNight) return "12h-night";
  if (hasDay) return "12h-day";
  if (jornadas.length) return "custom";

  return null;
}

// ─── tiny helpers ─────────────────────────────────────────────────────────────

const STEP_LABELS: { key: string; label: string }[] = [
  { key: "ui.PostSiteWizard.step.tipo", label: "Tipo" },
  { key: "ui.PostSiteWizard.step.sitio", label: "Sitio" },
  { key: "ui.PostSiteWizard.step.estaciones", label: "Estaciones" },
  { key: "ui.PostSiteWizard.step.listo", label: "Listo" },
];
const SCHEDULES = [
  "1 hora",
  "4 horas",
  "8 horas",
  "10 horas",
  "12 horas",
  "14 horas",
  "16 horas",
  "24 horas",
];

const JORNADA_PRESETS: {
  tipo: JornadaDraft["tipo"];
  label: string;
  labelKey: string;
  startTime: string;
  endTime: string;
}[] = [
  /* ── UN SOLO VOCABULARIO, Y LAS MISMAS HORAS ─────────────────────────────
     Esto decía «Matutina 06:00–18:00» y la ficha del puesto, «12h Diurno
     07:00–19:00»: el mismo turno con otro nombre y otra hora según por dónde
     entraras. Y no era sólo cosmético — el propio código de rehidratación de
     más abajo documenta que un `tipo` desconocido reventaba
     `JORNADA_STYLE[tipo].ring` y se llevaba por delante el editor entero.

     Manda el vocabulario del Horario y de la app del vigilante: Diurno y
     Nocturno, 07:00–19:00 y 19:00–07:00. */
  {
    tipo: "matutina",
    label: "Diurna",
    labelKey: "ui.PostSiteWizard.jornada.diurna",
    startTime: "07:00",
    endTime: "19:00",
  },
  {
    tipo: "nocturna",
    label: "Nocturna",
    labelKey: "ui.PostSiteWizard.jornada.nocturna",
    startTime: "19:00",
    endTime: "07:00",
  },
  {
    tipo: "sacafranco",
    label: "Relevo",
    labelKey: "ui.PostSiteWizard.jornada.relevo",
    startTime: "07:00",
    endTime: "19:00",
  },
  {
    tipo: "personalizada",
    label: "Personalizada",
    labelKey: "ui.PostSiteWizard.jornada.personalizada",
    startTime: "",
    endTime: "",
  },
];

// El tinte de cada jornada sale de los semánticos del sistema: matutina = día
// (warn), nocturna = noche (info), sacafranco = relevo (ok). Nada escrito a mano
// para que el acento del usuario no choque con la píldora.
const JORNADA_TONE: Record<
  JornadaDraft["tipo"],
  "warn" | "info" | "ok" | "neutral"
> = {
  matutina: "warn",
  nocturna: "info",
  sacafranco: "ok",
  personalizada: "neutral",
};

function jornadaFill(tipo: JornadaDraft["tipo"]) {
  const t = JORNADA_TONE[tipo] ?? "neutral";

  return t === "neutral" ? "var(--ink-faint)" : `var(--${t})`;
}

/** Píldora de la jornada — fondo, borde y tinta del mismo semántico. */
function jornadaChip(tipo: JornadaDraft["tipo"]): React.CSSProperties {
  const t = JORNADA_TONE[tipo] ?? "neutral";
  const fill = jornadaFill(tipo);

  return {
    background: `color-mix(in oklab, ${fill} 14%, transparent)`,
    borderColor: `color-mix(in oklab, ${fill} 32%, transparent)`,
    color: t === "neutral" ? "var(--ink-soft)" : `var(--${t}-text)`,
  };
}

/** Canto teñido de la fila de jornada. */
function jornadaEdge(tipo: JornadaDraft["tipo"]): React.CSSProperties {
  return {
    borderColor: `color-mix(in oklab, ${jornadaFill(tipo)} 30%, transparent)`,
  };
}

const DEPLOY_CHECKS: {
  key: string;
  label: string;
  labelKey: string;
  defaultOn?: boolean;
}[] = [
  {
    key: "armedService",
    labelKey: "ui.PostSiteWizard.deploy.armedService",
    label: "Vigilante armado",
  },
  {
    key: "uniformRequired",
    labelKey: "ui.PostSiteWizard.deploy.uniformRequired",
    label: "Uniforme obligatorio",
    defaultOn: true,
  },
  {
    key: "periodicPatrol",
    labelKey: "ui.PostSiteWizard.deploy.periodicPatrol",
    label: "Patrullaje perimetral",
  },
  {
    key: "k9Service",
    labelKey: "ui.PostSiteWizard.deploy.k9Service",
    label: "Canes / K9",
  },
  {
    key: "vehicleControl",
    labelKey: "ui.PostSiteWizard.deploy.vehicleControl",
    label: "Control acceso vehicular",
  },
  {
    key: "cctvMonitoring",
    labelKey: "ui.PostSiteWizard.deploy.cctvMonitoring",
    label: "Monitoreo CCTV",
  },
  {
    key: "visitorLog",
    labelKey: "ui.PostSiteWizard.deploy.visitorLog",
    label: "Registro de visitantes",
  },
  {
    key: "incidentLog",
    labelKey: "ui.PostSiteWizard.deploy.incidentLog",
    label: "Libro de novedades",
  },
  {
    key: "formalHandover",
    labelKey: "ui.PostSiteWizard.deploy.formalHandover",
    label: "Entrega de turno formal",
  },
  {
    key: "keyCustody",
    labelKey: "ui.PostSiteWizard.deploy.keyCustody",
    label: "Custodia de llaves",
  },
  {
    key: "alarmResponse",
    labelKey: "ui.PostSiteWizard.deploy.alarmResponse",
    label: "Respuesta a alarmas",
  },
  {
    key: "radioComms",
    labelKey: "ui.PostSiteWizard.deploy.radioComms",
    label: "Comunicación por radio",
  },
];

const SERVICE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Shield,
  BellAlert: BellElectric,
  Camera,
  Car,
  Lock,
  CalendarClock,
};

// ─── CheckboxGroup with custom-item support ───────────────────────────────────

interface ChipGroupProps {
  options: { value: string; label: string }[];
  value: string[];
  customItems: string[];
  onChange: (selected: string[], custom: string[]) => void;
  placeholder?: string;
}

function ChipGroup({
  options,
  value,
  customItems,
  onChange,
  placeholder,
}: ChipGroupProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");

  const toggleKnown = (v: string) => {
    onChange(
      value.includes(v) ? value.filter((x) => x !== v) : [...value, v],
      customItems,
    );
  };

  const addCustom = () => {
    const trimmed = input.trim();

    if (!trimmed || customItems.includes(trimmed)) return;
    onChange(value, [...customItems, trimmed]);
    setInput("");
  };

  const removeCustom = (item: string) => {
    onChange(
      value,
      customItems.filter((x) => x !== item),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value.includes(opt.value);

          return (
            <button
              key={opt.value}
              className="cg-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all"
              style={
                checked
                  ? {
                      background: "var(--brand-wash)",
                      borderColor: "var(--brand-line)",
                      color: "var(--brand-text)",
                    }
                  : {
                      background: "var(--glass-sunken)",
                      borderColor: "var(--hairline)",
                      color: "var(--ink-soft)",
                    }
              }
              type="button"
              onClick={() => toggleKnown(opt.value)}
            >
              {checked && <Check className="h-3 w-3 shrink-0" />}
              {opt.label}
            </button>
          );
        })}
        {customItems.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
            style={{
              background: "var(--brand-wash)",
              borderColor: "var(--brand-line)",
              color: "var(--brand-text)",
            }}
          >
            <Tag className="h-3 w-3 shrink-0" />
            {item}
            <button
              aria-label={t("ui.PostSiteWizard.quitarItem", {
                item,
                defaultValue: "Quitar {{item}}",
              })}
              className="cg-focus ml-0.5 rounded-full transition-colors"
              style={{ color: "var(--bad-text)" }}
              type="button"
              onClick={() => removeCustom(item)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Custom add row */}
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs"
          placeholder={
            placeholder ??
            t(
              "ui.PostSiteWizard.agregarPersonalizado",
              "Agregar personalizado…",
            )
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.preventDefault(), addCustom())
          }
        />
        <button
          className="cg-btn-brand cg-focus flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40"
          disabled={!input.trim()}
          type="button"
          onClick={addCustom}
        >
          <Plus className="h-3 w-3" />
          {t("actions.add", "Agregar")}
        </button>
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5">
      {STEP_LABELS.map(({ key: labelKey, label }, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;

        return (
          <React.Fragment key={idx}>
            <div className="flex flex-col items-center gap-1">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300"
                style={
                  done
                    ? {
                        background: "var(--ok)",
                        borderColor: "var(--ok)",
                        color: "var(--brand-ink)",
                      }
                    : active
                      ? {
                          background: "var(--brand)",
                          borderColor: "var(--brand)",
                          color: "var(--brand-ink)",
                          boxShadow: "0 0 18px -6px var(--brand-glow)",
                        }
                      : {
                          background: "var(--glass-sunken)",
                          borderColor: "var(--hairline)",
                          color: "var(--ink-faint)",
                        }
                }
              >
                {done ? <Check className="h-3.5 w-3.5" /> : idx}
              </div>
              <span
                className="hidden sm:block text-[10px] font-medium leading-none"
                style={{
                  color: active
                    ? "var(--brand-text)"
                    : done
                      ? "var(--ok-text)"
                      : "var(--ink-faint)",
                }}
              >
                {t(labelKey, label)}
              </span>
            </div>
            {i < total - 1 && (
              <div
                className="h-0.5 flex-1 rounded transition-all duration-500"
                style={{
                  background:
                    idx < current ? "var(--ok)" : "var(--glass-sunken)",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Jornada row ─────────────────────────────────────────────────────────────

function JornadaRow({
  jornada,
  onChange,
  onRemove,
}: {
  jornada: JornadaDraft;
  onChange: (d: Partial<JornadaDraft>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  return (
    /* La fila (etiqueta + nombre + dos horas + vigilantes + quitar) pide unos
       300 px de ancho fijo: en un teléfono se parte en dos líneas. */
    <div
      className="glass-flat flex flex-wrap items-center gap-2 px-3 py-2"
      style={jornadaEdge(jornada.tipo)}
    >
      {/* Type badge */}
      <span
        className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
        style={jornadaChip(jornada.tipo)}
      >
        {jornada.tipo === "sacafranco"
          ? t("ui.PostSiteWizard.abrev.sacafranco", "SF")
          : jornada.tipo === "matutina"
            ? t("ui.PostSiteWizard.abrev.matutina", "MAT")
            : jornada.tipo === "nocturna"
              ? t("ui.PostSiteWizard.abrev.nocturna", "NOC")
              : t("ui.PostSiteWizard.abrev.personalizada", "PER")}
      </span>
      {/* Editable name */}
      <Input
        className="h-7 min-w-32 flex-1 text-xs font-medium border-0 bg-transparent px-0 focus-visible:ring-0 shadow-none"
        placeholder={t("ui.PostSiteWizard.nombreDelTurno", "Nombre del turno")}
        value={jornada.nombre}
        onChange={(e) => onChange({ nombre: e.target.value })}
      />
      {/* Times */}
      <div className="flex items-center gap-1 shrink-0">
        <Input
          className="h-7 w-16 text-[11px] font-mono text-center px-1"
          placeholder="HH:MM"
          value={jornada.startTime}
          onChange={(e) => onChange({ startTime: e.target.value })}
        />
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <Input
          className="h-7 w-16 text-[11px] font-mono text-center px-1"
          placeholder="HH:MM"
          value={jornada.endTime}
          onChange={(e) => onChange({ endTime: e.target.value })}
        />
      </div>
      {/* Guards */}
      <div className="flex items-center gap-1 shrink-0">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="h-7 w-10 text-[11px] text-center px-1"
          min={1}
          type="number"
          value={jornada.guardsCount}
          onChange={(e) => onChange({ guardsCount: e.target.value })}
        />
      </div>
      <button
        aria-label={t("ui.PostSiteWizard.quitarJornada", "Quitar jornada")}
        className="cg-focus shrink-0 rounded-md transition-colors"
        style={{ color: "var(--bad-text)" }}
        type="button"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Station card ─────────────────────────────────────────────────────────────

function StationRow({
  draft,
  onChange,
  onRemove,
}: {
  draft: StationDraft;
  onChange: (d: Partial<StationDraft>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const addJornada = (preset: (typeof JORNADA_PRESETS)[number]) => {
    const j: JornadaDraft = {
      id: Math.random().toString(36).slice(2),
      nombre: t(preset.labelKey, preset.label),
      tipo: preset.tipo,
      startTime: preset.startTime,
      endTime: preset.endTime,
      guardsCount: "1",
    };

    onChange({ jornadas: [...draft.jornadas, j] });
  };

  const updateJornada = (id: string, delta: Partial<JornadaDraft>) => {
    onChange({
      jornadas: draft.jornadas.map((j) =>
        j.id === id ? { ...j, ...delta } : j,
      ),
    });
  };

  const removeJornada = (id: string) => {
    onChange({ jornadas: draft.jornadas.filter((j) => j.id !== id) });
  };

  /* ── LA COBERTURA, EN UNA PREGUNTA ──────────────────────────────────────
     Antes el puesto nacía sin turnos y había que ir añadiendo «Diurna»,
     «Nocturna» con unos chips que no explicaban nada. Lo que el dueño sabe
     del puesto es otra cosa: ¿se cubre las 24 horas, sólo de día o sólo de
     noche? ¿Y cuántos vigilantes a la vez? Eso se pregunta; las jornadas se
     derivan solas con las horas del Horario (07–19 / 19–07). «A medida»
     abre el editor de siempre para los casos raros. */
  const [aMedida, setAMedida] = useState(false);
  const cobertura: "24h" | "dia" | "noche" | "custom" | null = (() => {
    const tipos = draft.jornadas.map((j) => j.tipo);
    const raras = tipos.some(
      (x) => x === "personalizada" || x === "sacafranco",
    );
    const dia = tipos.filter((x) => x === "matutina").length;
    const noche = tipos.filter((x) => x === "nocturna").length;

    if (!tipos.length) return null;
    if (raras || dia > 1 || noche > 1) return "custom";
    if (dia && noche) return "24h";
    if (dia) return "dia";

    return "noche";
  })();
  const aLaVez = Math.max(1, Number(draft.jornadas[0]?.guardsCount) || 1);
  const jornadaDe = (
    tipo: "matutina" | "nocturna",
    n: number,
  ): JornadaDraft => {
    const preset = JORNADA_PRESETS.find((x) => x.tipo === tipo)!;
    const previa = draft.jornadas.find((j) => j.tipo === tipo);

    return {
      id: previa?.id ?? Math.random().toString(36).slice(2),
      nombre: previa?.nombre ?? t(preset.labelKey, preset.label),
      tipo,
      startTime: preset.startTime,
      endTime: preset.endTime,
      guardsCount: String(n),
    };
  };
  const elegirCobertura = (c: "24h" | "dia" | "noche" | "custom") => {
    if (c === "custom") {
      setAMedida(true);

      return;
    }
    setAMedida(false);
    const n = aLaVez;

    onChange({
      jornadas:
        c === "24h"
          ? [jornadaDe("matutina", n), jornadaDe("nocturna", n)]
          : c === "dia"
            ? [jornadaDe("matutina", n)]
            : [jornadaDe("nocturna", n)],
    });
  };
  const cambiarALaVez = (n: number) => {
    const v = String(Math.max(1, Math.min(20, n)));

    onChange({
      jornadas: draft.jornadas.map((j) => ({ ...j, guardsCount: v })),
    });
  };
  const COBERTURAS: {
    c: "24h" | "dia" | "noche" | "custom";
    k: string;
    d: string;
    horas: string;
  }[] = [
    {
      c: "24h",
      k: "ui.PostSiteWizard.cobertura.24h",
      d: "24 horas",
      horas: "07:00 → 07:00",
    },
    {
      c: "dia",
      k: "ui.PostSiteWizard.cobertura.dia",
      d: "Sólo de día",
      horas: "07:00 → 19:00",
    },
    {
      c: "noche",
      k: "ui.PostSiteWizard.cobertura.noche",
      d: "Sólo de noche",
      horas: "19:00 → 07:00",
    },
    {
      c: "custom",
      k: "ui.PostSiteWizard.cobertura.aMedida",
      d: "A medida",
      horas: "",
    },
  ];
  const editorVisible = aMedida || cobertura === "custom";

  return (
    <div className="glass-flat overflow-hidden">
      {/* Station name + delete */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <Input
          className="font-semibold flex-1"
          placeholder={t("ui.PostSiteWizard.nombreDelPuesto")}
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <button
          aria-label={t("ui.PostSiteWizard.quitarPuesto")}
          className="cg-focus shrink-0 rounded-md transition-colors"
          style={{ color: "var(--bad-text)" }}
          type="button"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pb-3">
        <Input
          className="text-sm text-muted-foreground"
          placeholder={t(
            "ui.PostSiteWizard.descripcionDelPuestoOpcional",
            "Descripción del puesto (opcional)",
          )}
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      {/* Cobertura: la pregunta que sí sabe contestar el dueño */}
      <div
        className="border-t px-4 py-3 space-y-3"
        style={{
          borderColor: "var(--hairline)",
          background: "var(--glass-sunken)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <span className="cg-eyebrow flex items-center gap-1">
              <Clock className="h-3 w-3" />{" "}
              {t("ui.PostSiteWizard.cobertura.titulo", "¿Qué horas se cubre?")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {COBERTURAS.map((o) => {
                const activa =
                  o.c === "custom"
                    ? editorVisible
                    : cobertura === o.c && !aMedida;

                return (
                  <button
                    key={o.c}
                    className="cg-focus rounded-full border px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
                    style={
                      activa
                        ? {
                            background: "var(--brand)",
                            color: "var(--brand-ink)",
                            borderColor: "var(--brand)",
                          }
                        : {
                            background: "var(--glass)",
                            color: "var(--ink)",
                            borderColor: "var(--hairline)",
                          }
                    }
                    type="button"
                    onClick={() => elegirCobertura(o.c)}
                  >
                    {t(o.k, o.d)}
                    {o.horas && (
                      <span className="ml-1 font-mono text-[10px] opacity-70">
                        {o.horas}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {draft.jornadas.length > 0 && !editorVisible && (
            <div className="space-y-1.5">
              <span className="cg-eyebrow flex items-center gap-1">
                <Users className="h-3 w-3" />{" "}
                {t("ui.PostSiteWizard.cobertura.aLaVez", "Vigilantes a la vez")}
              </span>
              <div className="flex items-center gap-1">
                <button
                  aria-label="−"
                  className="cg-focus glass h-7 w-7 rounded-md text-sm"
                  type="button"
                  onClick={() => cambiarALaVez(aLaVez - 1)}
                >
                  −
                </button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">
                  {aLaVez}
                </span>
                <button
                  aria-label="+"
                  className="cg-focus glass h-7 w-7 rounded-md text-sm"
                  type="button"
                  onClick={() => cambiarALaVez(aLaVez + 1)}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>
        {draft.jornadas.length > 0 && !editorVisible && (
          <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {cobertura === "24h"
              ? t("ui.PostSiteWizard.cobertura.explica24h", {
                  defaultValue:
                    "Dos turnos de 12 h (día y noche) con {{count}} vigilantes cada uno. Las rotaciones y los francos se cuadran en el Planificador.",
                  count: aLaVez,
                })
              : t("ui.PostSiteWizard.cobertura.explica12h", {
                  defaultValue:
                    "Un turno de 12 h con {{count}} vigilantes. Las rotaciones y los francos se cuadran en el Planificador.",
                  count: aLaVez,
                })}
          </p>
        )}
      </div>

      {/* Jornadas section */}
      <div
        className="border-t px-4 py-3 space-y-2"
        hidden={!editorVisible}
        style={{
          borderColor: "var(--hairline)",
          background: "var(--glass-sunken)",
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="cg-eyebrow flex items-center gap-1">
            <Clock className="h-3 w-3" />{" "}
            {t("ui.PostSiteWizard.jornadasTurnos", "Jornadas / Turnos")}
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {JORNADA_PRESETS.map((p) => (
              <button
                key={p.tipo}
                className="cg-focus flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-70"
                style={jornadaChip(p.tipo)}
                type="button"
                onClick={() => addJornada(p)}
              >
                <Plus className="h-2.5 w-2.5" />
                {t(p.labelKey, p.label)}
              </button>
            ))}
          </div>
        </div>

        {draft.jornadas.length === 0 ? (
          <p
            className="py-3 text-center text-xs italic"
            style={{ color: "var(--ink-faint)" }}
          >
            {t(
              "ui.PostSiteWizard.sinJornadasAnade",
              "Sin jornadas — añade Diurna, Nocturna o Relevo con los botones de arriba.",
            )}
          </p>
        ) : (
          <div className="space-y-1.5">
            {draft.jornadas.map((j) => (
              <JornadaRow
                key={j.id}
                jornada={j}
                onChange={(d) => updateJornada(j.id, d)}
                onRemove={() => removeJornada(j.id)}
              />
            ))}
          </div>
        )}

        {draft.jornadas.length > 0 && (
          <p className="pt-1 text-[10px]" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.PostSiteWizard.cadaJornadaSeGuarda",
              "Cada jornada se guarda como un registro independiente en el puesto.",
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function PostSiteWizard({
  clients = [],
  mode = "create",
  id,
  presetClientId,
  presetClientName,
}: WizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedClient } = useClientSelection();
  const isEdit = mode === "edit" && !!id;

  /**
   * `?step=N` — para poder entrar DIRECTO al paso que falta.
   *
   * El aviso de «falta la configuración operativa» enlaza aquí con `step=1`: lo
   * que falta es el tipo de servicio, y el paso 3 se dibuja entero a partir de
   * él, así que mandar a alguien al paso 2 (donde arranca la edición) le
   * obligaría a adivinar hacia dónde ir. Se acota al rango real de pasos.
   */
  const pasoPedido = (() => {
    const n = Number(searchParams.get("step"));

    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.trunc(n) : null;
  })();

  // ── form state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState(pasoPedido ?? (isEdit ? 2 : 1));
  /** Se llegó aquí desde el alta del cliente: el hilo de puesta en marcha se enseña y el final sigue hacia los vigilantes. */
  const enPuesta = searchParams.get("puesta") === "1";
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  /* La sede tal como quedó guardada (la lee el formulario de estación para el
     tenant y las coordenadas) y las estaciones creadas en este recorrido. */
  const [sedeGuardada, setSedeGuardada] = useState<any | null>(null);
  const [creadas, setCreadas] = useState<StationCreada[]>([]);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);

  // Step 1
  const [serviceType, setServiceType] = useState<string | undefined>(undefined);
  /* Sede-EVENTO: las fechas son hora de pared de la EMPRESA (`datetime-local`)
     y viajan como instantes ISO (`vigenteDesde` / `vigenteHasta`). */
  const [eventoInicio, setEventoInicio] = useState("");
  const [eventoFin, setEventoFin] = useState("");
  /* El NOMBRE del evento («Concierto Estadio Norte»): es lo que ve el vigilante
     en su app. Una sede normal se sigue llamando por su dirección. */
  const [nombreEvento, setNombreEvento] = useState("");
  const esEventoSel = esEvento({ serviceType });
  const faltaNombreEvento = esEventoSel && !nombreEvento.trim();
  const vigenciaISO = {
    desde: eventoInicio ? desdeInputFechaHora(eventoInicio) : "",
    hasta: eventoFin ? desdeInputFechaHora(eventoFin) : "",
  };
  const errorVigencia: ErrorVigencia = esEventoSel
    ? validarVigencia(vigenciaISO.desde, vigenciaISO.hasta)
    : null;
  /* Evento MOVIDO AL PASADO = sólo historial (decisión del dueño): se avisa
     antes de guardar, no después. Corregir la hora de uno que ya había
     terminado no cuenta (ver `pasaAlPasado`). */
  const pasaAHistorial =
    isEdit &&
    esEventoSel &&
    !errorVigencia &&
    pasaAlPasado(sedeGuardada?.vigenteHasta, vigenciaISO.hasta);
  /* Y al revés: uno que ya había terminado vuelve al futuro. El servidor
     reabre lo que cerró el paso a historial; se dice antes de guardar. */
  const vuelveDelHistorial =
    isEdit &&
    esEventoSel &&
    !errorVigencia &&
    vuelveAlFuturo(sedeGuardada?.vigenteHasta, vigenciaISO.hasta);

  // Step 2
  const [clientId, setClientId] = useState(
    presetClientId || (selectedClient?.id ? String(selectedClient.id) : ""),
  );
  const [address, setAddress] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  // Módulo Sucursales: null = automática (por su ciudad / el alcance).
  const [branchId, setBranchId] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [latitud, setLatitud] = useState("");
  const [longitud, setLongitud] = useState("");
  const [description, setDescription] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [showAddressFields, setShowAddressFields] = useState(false);
  const [useClientAddress, setUseClientAddress] = useState(false);
  const [clientData, setClientData] = useState<ClientDetail | null>(null);

  // Step 3: service config — stored as flat map, custom items tracked separately
  const [serviceConfig, setServiceConfig] = useState<Record<string, any>>({});
  // equipment
  const [equipment, setEquipment] = useState<string[]>([]);
  const [customEquipment, setCustomEquipment] = useState<string[]>([]);
  // training
  const [training, setTraining] = useState<string[]>([]);
  const [customTraining, setCustomTraining] = useState<string[]>([]);

  // Step 4: Estaciones + Contacto
  const [stations, setStations] = useState<StationDraft[]>([]);
  const originalStationIdsRef = useRef<string[]>([]);
  const [status, setStatus] = useState<"active" | "inactive">("active");

  // Images (site photo — stored on post site)
  const [placeFile, setPlaceFile] = useState<File | null>(null);
  const [placePreview, setPlacePrev] = useState<string | null>(null);
  const [placeExisting, setPlaceExisting] = useState<FileAsset | null>(null);

  // El cliente viene decidido desde su ficha (?clientId=…): la sede se crea
  // dentro de ese cliente, así que el campo queda fijo y no se pregunta.
  const clientLocked = !isEdit && !!presetClientId;

  // Auto-inject client from context (create mode only — edit loads from API)
  useEffect(() => {
    if (isEdit) return;
    if (presetClientId) {
      setClientId(presetClientId);

      return;
    }
    if (selectedClient?.id) setClientId(String(selectedClient.id));
  }, [selectedClient, presetClientId]);

  // Fetch client details when client changes (for address toggle)
  useEffect(() => {
    if (!clientId) {
      setClientData(null);

      return;
    }
    (async () => {
      try {
        const data = await clientService.getClient(clientId);

        setClientData(data as ClientDetail);
        // La sede que crea el alta del cliente lleva SU dirección. Volver a
        // pedirla aquí era el campo repetido que más se notaba: se da por
        // hecha y se enseña plegada; «usar otra dirección» la abre.
        const d = data as ClientDetail;

        if (d?.address && (!address || address === d.address)) {
          setUseClientAddress(true);
          setAddress(d.address || "");
          setAddressLine2(d.addressLine2 || "");
          setCity(d.city || "");
          setCountry(d.country || "");
          setPostalCode(d.postalCode || "");
          if (d.latitude) setLatitud(String(d.latitude));
          if (d.longitude) setLongitud(String(d.longitude));
          setAddressConfirmed(true);
        }
      } catch {
        setClientData(null);
      }
    })();
  }, [clientId]);

  // Nombre del cliente elegido. La lista corta del asistente no siempre lo
  // contiene (cuando llega fijado desde su ficha ni siquiera se pide la
  // lista), así que caemos al dato de navegación y luego al detalle cargado.
  const resolvedClientName = useMemo(() => {
    if (!clientId) return null;

    return (
      clients.find((c) => c.id === clientId)?.name ||
      presetClientName ||
      clientData?.commercialName ||
      [clientData?.name, clientData?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      null
    );
  }, [clients, clientId, presetClientName, clientData]);

  // Load existing site data in edit mode
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const data = await stationService.get(id!);
        const d = data as any;

        setSedeGuardada(d);

        setServiceType(d.serviceType ?? undefined);
        setEventoInicio(
          d.vigenteDesde ? paraInputFechaHora(d.vigenteDesde) : "",
        );
        setEventoFin(d.vigenteHasta ? paraInputFechaHora(d.vigenteHasta) : "");
        // Sólo un evento tiene nombre propio; el de una sede normal es su
        // dirección y no se trae aquí (si pasa a evento, se le pide uno).
        setNombreEvento(
          esEvento(d) ? String(d.companyName ?? d.name ?? "") : "",
        );
        setClientId(d.clientAccountId ?? d.clientId ?? "");
        setAddress(d.address ?? "");
        setAddressLine2(d.secondAddress ?? d.addressLine2 ?? "");
        setCity(d.city ?? "");
        setBranchId(d.branchId ?? null);
        setCountry(d.country ?? "");
        setPostalCode(d.postalCode ?? "");
        setLatitud(String(d.latitud ?? d.latitude ?? ""));
        setLongitud(String(d.longitud ?? d.longitude ?? ""));
        setDescription(d.description ?? "");
        setStatus(
          typeof d.active === "boolean"
            ? d.active
              ? "active"
              : "inactive"
            : (d.status ?? "active"),
        );
        if (d.serviceConfig && typeof d.serviceConfig === "object") {
          const { specialEquipment, trainingRequired, ...rest } =
            d.serviceConfig;

          setServiceConfig(rest);
          if (Array.isArray(specialEquipment)) setEquipment(specialEquipment);
          if (Array.isArray(trainingRequired)) setTraining(trainingRequired);
        }
        if (d.address || d.city) setAddressConfirmed(true);

        // Load post site's own photo (stored as 'logo' association on businessInfo)
        if (d.logo && Array.isArray(d.logo) && d.logo.length > 0) {
          setPlaceExisting(d.logo[0]);
          setPlacePrev(d.logo[0].downloadUrl || d.logo[0].publicUrl || null);
        }

        // Load existing stations
        try {
          const stationsResp = await stationService.list(
            { postSite: id } as any,
            { limit: 100, offset: 0 },
          );
          /* ── LAS JORNADAS SALEN DE LAS PLAZAS ──────────────────────────
             `stationSchedule` es una columna JSON que describe lo mismo que
             las PLAZAS (`stationPositions`), y sólo las plazas son lo que el
             generador de turnos lee. Mientras el asistente se rehidrataba del
             JSON, este editor enseñaba una cosa y el puesto trabajaba otra:
             cambiar el turno desde la ficha movía las plazas y dejaba el JSON
             con las jornadas viejas.

             Ahora se leen las plazas. El JSON queda de respaldo sólo para un
             puesto que aún no las tenga. */
          const loadedStations: StationDraft[] = (
            (stationsResp.rows || []) as unknown as StationApiRow[]
          ).map((r: StationApiRow) => {
            let jornadas: JornadaDraft[] = [];

            const plazas = (r as any).positions as any[] | undefined;

            if (plazas?.length) {
              /* La aritmética de agrupar plazas en jornadas es UNA y vive en
                 `lib/jornadasDePlazas`, espejo del servidor. Aquí había una
                 copia propia que, entre otras cosas, no reponía la mitad de
                 noche de un 24 h: dos «Diurna» hacían que `deriveScheduleType`
                 degradara el puesto a 12h-day al guardar, o sea que abrir el
                 asistente y darle a guardar apagaba el turno de noche. */
              jornadas = jornadasDePlazas(plazas, (r as any).scheduleType).map(
                (j) => {
                  const esNoche = j.tipo === "Nocturno";

                  return {
                    // La jornada es un GRUPO de plazas (dos fijos en la misma
                    // ventana son una jornada de dos personas), así que no
                    // hereda el id de ninguna: la identifica su ventana.
                    id: `${j.startTime}-${j.endTime}`,
                    nombre: esNoche
                      ? t("ui.PostSiteWizard.jornada.nocturna", "Nocturna")
                      : t("ui.PostSiteWizard.jornada.diurna", "Diurna"),
                    tipo: (esNoche
                      ? "nocturna"
                      : "matutina") as JornadaDraft["tipo"],
                    startTime: j.startTime,
                    endTime: j.endTime,
                    guardsCount: String(j.guardsCount),
                  };
                },
              );

              // Los sacafrancos no son jornada del puesto pero SÍ se editan
              // aquí: se añaden aparte, que es como los espera el editor.
              for (const p of plazas) {
                if ((p.type || "fijo") !== "sacafranco") continue;
                jornadas.push({
                  id: String(p.id),
                  nombre: t("ui.PostSiteWizard.jornada.relevo", "Relevo"),
                  tipo: "sacafranco",
                  startTime: p.startTime || "",
                  endTime: p.endTime || "",
                  guardsCount: String(p.guardsNeeded ?? 1),
                });
              }
            }

            /* Sin plazas, la cobertura PREVISTA por tipo de horario. Aquí se
               leía `r.stationSchedule`, la columna JSON que se eliminó de la
               base el 2026-09-12: la lectura devolvía siempre `undefined` y el
               `catch` se lo tragaba, así que una estación sin plazas salía en
               blanco y en silencio. */
            if (!jornadas.length) {
              jornadas = jornadasPorTipo((r as any).scheduleType, r as any).map((j) => ({
                id: `${j.startTime}-${j.endTime}`,
                nombre:
                  j.tipo === "Nocturno"
                    ? t("ui.PostSiteWizard.jornada.nocturna", "Nocturna")
                    : t("ui.PostSiteWizard.jornada.diurna", "Diurna"),
                tipo: (j.tipo === "Nocturno"
                  ? "nocturna"
                  : "matutina") as JornadaDraft["tipo"],
                startTime: j.startTime,
                endTime: j.endTime,
                guardsCount: String(j.guardsCount),
              }));
            }

            return {
              name: r.stationName || r.name || "",
              description: r.description || "",
              jornadas,
              existingId: r.id,
              existingScheduleType: r.scheduleType || undefined,
            };
          });

          originalStationIdsRef.current = loadedStations
            .map((s) => s.existingId!)
            .filter(Boolean);
          if (loadedStations.length > 0) setStations(loadedStations);
        } catch {}
      } catch (e) {
        toast.error(t("ui.PostSiteWizard.errorAlCargarElSitio"));
        navigate("/post-sites");
      } finally {
        setLoadingEdit(false);
      }
    })();
  }, [isEdit, id]);

  // ── step validation ──────────────────────────────────────────────────────────
  const canGoNext = () => {
    if (step === 2)
      return !!address.trim() && !errorVigencia && !faltaNombreEvento;

    return true; // other steps are optional-ish
  };

  // ── service config helpers ───────────────────────────────────────────────────
  const cfgSet = (key: string, val: any) =>
    setServiceConfig((prev) => ({ ...prev, [key]: val }));
  const cfgGet = (key: string, fallback: any = "") =>
    serviceConfig[key] ?? fallback;

  // ── address autocomplete handler ─────────────────────────────────────────────
  const handleAddressSelect = (ac: AddressComponents) => {
    setAddress(ac.address);
    setCity(ac.city);
    setCountry(ac.country);
    setPostalCode(ac.postalCode);
    setLatitud(String(ac.latitude));
    setLongitud(String(ac.longitude));
    if (ac.address || ac.city) {
      setAddressConfirmed(true);
    }
  };

  // ── build payload ────────────────────────────────────────────────────────────
  const buildPayload = () => {
    /* A site that already has its OWN name keeps it: the wizard used to
       rename it to the address, and selects, stations and the Planificador
       lost the name everyone knew it by (QA-98). The address is only the
       fallback — and a name that was just the old address follows the new one. */
    const nombreGuardado = String(
      sedeGuardada?.companyName ?? sedeGuardada?.name ?? "",
    ).trim();
    const nombrePropio =
      nombreGuardado &&
      nombreGuardado !== String(sedeGuardada?.address ?? "").trim()
        ? nombreGuardado
        : "";
    const autoName =
      esEventoSel && nombreEvento.trim()
        ? nombreEvento.trim()
        : nombrePropio ||
          address.trim() ||
          (resolvedClientName
            ? `Sitio de ${resolvedClientName}`
            : "Sitio sin nombre");

    /* Lo del formulario va ENCIMA de lo último que tiene el servidor, nunca
       solo: el servidor guarda `serviceConfig` entero, y las claves que
       apunta él (paso a historial, archivado, tarifa del evento…) se perdían
       o volvían viejas al guardar otra vez (ver `configParaGuardar`). */
    const finalConfig = configParaGuardar(sedeGuardada?.serviceConfig, {
      ...serviceConfig,
      specialEquipment: [...equipment, ...customEquipment],
      trainingRequired: [...training, ...customTraining],
    });

    return {
      name: autoName,
      companyName: autoName,
      clientId: clientId || undefined,
      description,
      address,
      addressLine2,
      city,
      country,
      postalCode,
      // Una dirección escrita a mano no trae coordenadas: «» en una columna
      // DECIMAL es «Data truncated» (500). Sin coordenadas va null.
      latitud:
        latitud !== "" && Number.isFinite(Number(latitud))
          ? Number(latitud)
          : null,
      longitud:
        longitud !== "" && Number.isFinite(Number(longitud))
          ? Number(longitud)
          : null,
      serviceType,
      serviceConfig: finalConfig,
      /* La vigencia sólo la pide un EVENTO. Si una sede que ERA evento pasa a
         otro tipo, se borra: si no, al pasar la fecha la sede dejaría de exigir
         cobertura sin que nadie supiera por qué. */
      ...(esEventoSel
        ? { vigenteDesde: vigenciaISO.desde, vigenteHasta: vigenciaISO.hasta }
        : isEdit && esEvento(sedeGuardada)
          ? { vigenteDesde: null, vigenteHasta: null }
          : {}),
      status,
      // Sólo si se eligió una: «automática» deja que el servidor la coloque.
      ...(branchId ? { branchId } : {}),
    };
  };

  // ── submit site ──────────────────────────────────────────────────────────────
  const buildStationPayload = (s: StationDraft, postSiteId: string) => {
    const firstJornada = s.jornadas[0];

    return {
      stationName: s.name.trim(),
      postSite: postSiteId,
      startingTimeInDay: firstJornada?.startTime || undefined,
      finishTimeInDay: firstJornada?.endTime || undefined,
      /* Aquí se escribía `stationSchedule`, una TERCERA descripción del mismo
         horario junto a la franja y las plazas — y en un formato distinto del
         que escriben las otras dos pantallas del CRM. Las jornadas ya viajan a
         `auto-positions`, que crea las plazas, y las plazas son lo único que el
         generador de turnos lee. Escribir el JSON sólo servía para tener dos
         versiones que se podían contradecir, y se contradecían. */
    };
  };

  const syncStationRecords = async (postSiteId: string) => {
    const valid = stations.filter((s) => s.name.trim());
    const tenantId = localStorage.getItem("tenantId") || "";
    const currentIds = new Set(
      valid.map((s) => s.existingId).filter(Boolean) as string[],
    );

    // Delete stations that were removed
    const toDelete = originalStationIdsRef.current.filter(
      (sid) => !currentIds.has(sid),
    );

    await Promise.all(
      toDelete.map((sid) =>
        ApiService.delete(`/tenant/${tenantId}/station/${sid}`),
      ),
    );

    // Update existing or create new, then link the turno to the scheduling
    // engine (Programador › Horario) by setting scheduleType + rebuilding the
    // turno positions via /auto-positions. We only fire auto-positions when the
    // turno actually changed (or the station is new), because that rebuild also
    // clears the station's existing guard assignments.
    for (const s of valid) {
      const payload = buildStationPayload(s, postSiteId);
      let stationId = s.existingId || "";

      if (s.existingId) {
        await ApiService.put(`/tenant/${tenantId}/station/${s.existingId}`, {
          data: payload,
        });
      } else {
        const created: any = await ApiService.post(
          `/tenant/${tenantId}/station`,
          { data: payload },
        );

        stationId = created?.id || created?.data?.id || "";
      }

      const desired = deriveScheduleType(s.jornadas);
      const changed =
        !s.existingId ||
        (desired && desired !== (s.existingScheduleType || ""));

      if (stationId && desired && changed) {
        const first = s.jornadas[0];

        try {
          await ApiService.post(
            `/tenant/${tenantId}/station/${stationId}/auto-positions`,
            {
              data: {
                scheduleType: desired,
                startTime: first?.startTime || undefined,
                endTime: first?.endTime || undefined,
              },
            },
          );
        } catch {
          // Non-blocking: the station saved; the horario can still be set in Programador › Horario.
        }
      }
    }
  };

  // ── upload site photo to post site ───────────────────────────────────────────
  const uploadSitePhoto = async (postSiteId: string) => {
    if (!postSiteId) return;
    if (!placeFile) return;
    try {
      const obj = await clientService.uploadFile(placeFile, "businessInfoLogo");
      const tenantId = localStorage.getItem("tenantId") || "";

      await ApiService.put(`/tenant/${tenantId}/post-site/${postSiteId}`, {
        data: { logo: [obj] },
      });
      invalidateEntity("stations");
    } catch {
      toast.error(t("ui.PostSiteWizard.laFotoDelSitioNo"));
    }
  };

  /* ── CAMBIAR LAS FECHAS DE UN EVENTO MUEVE A SU GENTE ────────────────────
     El servidor lleva a los vigilantes a las fechas nuevas; quien ya tiene
     otro turno en ellas SALE del evento. Eso no puede pasar en silencio: se
     dice quién y de qué estación, para que se busque a otro. */
  const avisarResincronizado = (
    rs?: {
      movidas?: number;
      cerradas?: number;
      plazasMovidas?: number;
      desplazamientoMin?: number;
      choques?: Array<{ guardId?: string; nombre?: string; puesto?: string }>;
      salidas?: Array<{
        guardId?: string;
        nombre?: string;
        puesto?: string;
        motivo?: "fueraDelEvento" | "choque";
        chocaCon?: string;
      }>;
      historial?: {
        cerradas?: number;
        archivados?: Array<{ userId?: string; nombre?: string }>;
        seQuedan?: number;
        archivarAlTerminar?: boolean;
      };
      vueltaAlFuturo?: VueltaAlFuturo;
    } | null,
  ) => {
    if (!rs) return;
    /* El evento había terminado y vuelve al futuro: se dice qué se reabrió y
       quién volvió, y lo que no se pudo recuperar, para reasignarlo. Lo demás
       (quién no cabe en las fechas nuevas) se avisa después, como siempre. */
    const vuelta = avisosDeVueltaAlFuturo(rs.vueltaAlFuturo, (k, o) =>
      String(t(k, o as any)),
    );

    if (vuelta) {
      toast.info(vuelta.info, { duration: 12000 });
      if (vuelta.aviso) toast.warning(vuelta.aviso, { duration: 15000 });
    }
    /* Con las fechas nuevas el evento ya terminó: nadie se «movió» a fechas
       pasadas (antes decía «Se movieron N vigilantes» sin un solo turno). Se
       dice lo que pasó de verdad: asignaciones cerradas y quién se archivó. */
    if (rs.historial) {
      const archivados = rs.historial.archivados || [];

      toast.info(
        [
          t("ui.PostSiteWizard.evento.historialHecho", {
            defaultValue:
              "El evento quedó como historial: se cerraron {{count}} asignaciones.",
            count: Number(rs.historial.cerradas || 0),
          }),
          archivados.length
            ? t("ui.PostSiteWizard.evento.historialArchivados", {
                defaultValue:
                  "{{count}} vigilantes sin otro puesto se archivaron: {{lista}}.",
                count: archivados.length,
                lista: archivados.map((a) => a.nombre || "—").join(", "),
              })
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        { duration: 12000 },
      );

      return;
    }
    /* `salidas` trae a TODOS los que salieron y por qué; `choques` es el
       formato viejo (sólo los que chocaban) y queda de respaldo. */
    const salidas = Array.isArray(rs.salidas)
      ? rs.salidas
      : (Array.isArray(rs.choques) ? rs.choques : []).map((c) => ({
          ...c,
          motivo: "choque" as const,
        }));
    const lista = (xs: typeof salidas) =>
      xs
        .map((c) =>
          c.puesto ? `${c.nombre || "—"} (${c.puesto})` : c.nombre || "—",
        )
        .join(", ");
    const chocan = salidas.filter((x) => x.motivo !== "fueraDelEvento");
    const fuera = salidas.filter((x) => x.motivo === "fueraDelEvento");

    if (chocan.length) {
      toast.warning(
        t("ui.PostSiteWizard.evento.salieron", {
          defaultValue:
            "Fechas actualizadas. {{count}} vigilantes salieron del evento porque ya tienen turno: {{lista}}. Asigna a otros en sus estaciones.",
          count: chocan.length,
          lista: lista(chocan),
        }),
        { duration: 15000 },
      );
    }
    if (fuera.length) {
      toast.warning(
        t("ui.PostSiteWizard.evento.fueraDelEvento", {
          defaultValue:
            "{{count}} vigilantes salieron porque su relevo ya no cae dentro del evento: {{lista}}.",
          count: fuera.length,
          lista: lista(fuera),
        }),
        { duration: 15000 },
      );
    }
    if ((rs.movidas || 0) > 0 || (rs.plazasMovidas || 0) > 0) {
      const min = Number(rs.desplazamientoMin || 0);

      toast.info(
        min
          ? t("ui.PostSiteWizard.evento.desplazados", {
              defaultValue:
                "Los relevos se movieron {{horas}} h con el evento: {{plazas}} y {{vigilantes}}.",
              horas: `${min > 0 ? "+" : "−"}${Math.round((Math.abs(min) / 60) * 100) / 100}`,
              // Dos cantidades en una frase: cada pieza lleva su plural.
              plazas: t("ui.eventos.nPlazas", {
                defaultValue: "{{count}} plazas",
                count: rs.plazasMovidas || 0,
              }),
              vigilantes: t("ui.eventos.nVigilantes", {
                defaultValue: "{{count}} vigilantes",
                count: rs.movidas || 0,
              }),
            })
          : t("ui.PostSiteWizard.evento.movidas", {
              defaultValue:
                "Se movieron {{count}} vigilantes a las nuevas fechas.",
              count: rs.movidas,
            }),
      );
    }
  };

  const handleCreateSite = async () => {
    if (
      pasaAHistorial &&
      !(await confirmDialog({
        title: t(
          "ui.PostSiteWizard.evento.historialConfirmarTitulo",
          "¿Dejar el evento como historial?",
        ),
        message: t(
          "ui.PostSiteWizard.evento.historialConfirmarTexto",
          "Con estas fechas el evento ya terminó. No se crean turnos ni nómina hacia atrás: sus asignaciones se cierran y los vigilantes sin otro puesto se archivan, como en cualquier evento terminado. Lo que ya se fichó se conserva.",
        ),
        confirmText: t(
          "ui.PostSiteWizard.evento.historialConfirmar",
          "Guardar como historial",
        ),
      }))
    )
      return;
    setSubmitting(true);
    try {
      const payload = buildPayload();
      let sedeId = id || "";

      /* Las estaciones no se crean aquí: se crean una a una en el paso 3,
         con el formulario completo (nominativo, geocerca, plazas, ciclo…),
         una vez que la sede existe. */
      if (isEdit) {
        const r: any = await stationService.update(id!, payload as any);

        avisarResincronizado(
          r?.eventoResincronizado ?? r?.data?.eventoResincronizado,
        );
      } else {
        const data = await stationService.create(payload as any);

        sedeId = (data as any).id || (data as any).data?.id || "";
        setCreatedId(sedeId);
      }
      invalidateEntity("stations");
      try {
        await uploadSitePhoto(sedeId);
      } catch {
        /* already toasted inside */
      }
      try {
        setSedeGuardada(await stationService.get(sedeId));
      } catch {
        /* Si la relectura falla, lo que se acaba de guardar se sabe igual: el
           tipo y la vigencia van también, para que el paso 3 abra el
           formulario de estación en modo evento y no en modo normal. */
        setSedeGuardada({
          id: sedeId,
          latitud,
          longitud,
          serviceType,
          name: payload.name,
          companyName: payload.companyName,
          ...(esEventoSel
            ? {
                vigenteDesde: vigenciaISO.desde,
                vigenteHasta: vigenciaISO.hasta,
              }
            : {}),
        });
      }
      toast.success(
        isEdit
          ? t("ui.PostSiteWizard.cambiosGuardados", "Cambios guardados")
          : t("ui.PostSiteWizard.sedeCreada", "Sede creada"),
      );
      setStep(3);
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ??
          e?.message ??
          t("ui.PostSiteWizard.errorAlCrearElSitio", "Error al crear el sitio"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    // ── Step 1: Service type ───────────────────────────────────────────────────
    if (step === 1) {
      return (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="font-display text-xl font-bold">
              {t(
                "ui.PostSiteWizard.queTipoDeServicioEs",
                "¿Qué tipo de servicio es este sitio?",
              )}
            </h2>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.PostSiteWizard.estoNosPermitePreparar",
                "Esto nos permite preparar los campos de configuración adecuados. Puede cambiar después.",
              )}
            </p>
          </div>
          <ServiceTypePicker
            value={serviceType ?? null}
            onChange={(v) => {
              setServiceType(v);
              setStep(2);
            }}
          />
          {/* En la puesta en marcha no hay atajo: sin tipo de servicio la sede
             queda cerrada (no se crean puestos ni se asigna a nadie). */}
          {!enPuesta && (
            <div className="text-center">
              <button
                className="cg-btn-link cg-focus rounded-md text-sm underline underline-offset-4 transition-colors"
                type="button"
                onClick={() => {
                  setServiceType(undefined);
                  setStep(2);
                }}
              >
                {t(
                  "ui.PostSiteWizard.continuarSinSeleccionarTipo",
                  "Continuar sin seleccionar tipo",
                )}
              </button>
            </div>
          )}
        </div>
      );
    }

    // ── Step 2: Site info + address ────────────────────────────────────────────
    if (step === 2) {
      const selectedClientObj = resolvedClientName
        ? { id: clientId, name: resolvedClientName }
        : null;
      const coordsLabel =
        latitud && longitud
          ? `${Number(latitud).toFixed(5)}, ${Number(longitud).toFixed(5)}`
          : null;

      return (
        <div className="space-y-5">
          <div>
            <h2 className="font-display mb-0.5 text-xl font-bold">
              {t("ui.PostSiteWizard.ubicacionDelSitio", "Ubicación del sitio")}
            </h2>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {clientLocked
                ? t(
                    "ui.PostSiteWizard.buscaDireccionClienteAsignado",
                    "Busca la dirección de la sede en el mapa. El cliente ya está asignado.",
                  )
                : t(
                    "ui.PostSiteWizard.buscaDireccionAsignaCliente",
                    "Busca la dirección en el mapa y asigna el sitio a un cliente.",
                  )}
            </p>
          </div>

          {/* ── Sede-EVENTO: cuándo es. Lo primero que se pregunta, porque
                 es lo que lo distingue de un servicio normal. ──────────── */}
          {esEventoSel && (
            <div className="glass overflow-hidden">
              <div
                className="flex items-center gap-3 border-b px-4 py-2.5"
                style={{ borderColor: "var(--hairline)" }}
              >
                <IconTile size="sm">
                  <CalendarClock />
                </IconTile>
                <span className="cg-eyebrow">
                  {t(
                    "ui.PostSiteWizard.evento.cuando",
                    "¿Cuándo es el evento?",
                  )}
                </span>
              </div>
              <div className="space-y-2 px-4 py-3">
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-foreground/70"
                    htmlFor="evento-nombre"
                  >
                    {t("ui.PostSiteWizard.evento.nombre", "Nombre del evento")}{" "}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </label>
                  <input
                    aria-invalid={faltaNombreEvento}
                    autoComplete="off"
                    className="cg-input cg-focus w-full px-3 py-2 text-sm"
                    id="evento-nombre"
                    maxLength={200}
                    placeholder={t(
                      "ui.PostSiteWizard.evento.nombreEj",
                      "Ej.: Concierto Estadio Norte",
                    )}
                    value={nombreEvento}
                    onChange={(e) => setNombreEvento(e.target.value)}
                  />
                  <p
                    className="mt-1 text-[11px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t(
                      "ui.PostSiteWizard.evento.nombreAyuda",
                      "Es el nombre que verán los vigilantes en su app.",
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium text-foreground/70"
                      htmlFor="evento-inicio"
                    >
                      {t("ui.PostSiteWizard.evento.inicio", "Inicio")}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </label>
                    <input
                      className="cg-input cg-focus w-full px-3 py-2 text-sm"
                      id="evento-inicio"
                      type="datetime-local"
                      value={eventoInicio}
                      onChange={(e) => setEventoInicio(e.target.value)}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium text-foreground/70"
                      htmlFor="evento-fin"
                    >
                      {t("ui.PostSiteWizard.evento.fin", "Fin")}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </label>
                    <input
                      aria-invalid={
                        errorVigencia === "finAntesDeInicio" ||
                        errorVigencia === "demasiadoLargo"
                      }
                      className="cg-input cg-focus w-full px-3 py-2 text-sm"
                      id="evento-fin"
                      min={eventoInicio || undefined}
                      type="datetime-local"
                      value={eventoFin}
                      onChange={(e) => setEventoFin(e.target.value)}
                    />
                  </div>
                </div>
                {errorVigencia === "finAntesDeInicio" ? (
                  <p
                    className="text-xs font-medium"
                    role="alert"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {t(
                      "ui.PostSiteWizard.evento.finAntesDeInicio",
                      "El fin tiene que ser después del inicio. Si el evento acaba de madrugada, pon el día siguiente.",
                    )}
                  </p>
                ) : errorVigencia === "demasiadoLargo" ? (
                  <p
                    className="text-xs font-medium"
                    role="alert"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {t("ui.PostSiteWizard.evento.demasiadoLargo", {
                      defaultValue:
                        "Un evento puede durar como máximo {{n}} días. Para un servicio más largo, elige otro tipo de servicio.",
                      n: EVENTO_MAX_DIAS,
                    })}
                  </p>
                ) : errorVigencia ? (
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t(
                      "ui.PostSiteWizard.evento.faltanFechas",
                      "Indica cuándo empieza y cuándo termina el evento, en la hora de la empresa.",
                    )}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {(() => {
                      const horas =
                        (new Date(vigenciaISO.hasta).getTime() -
                          new Date(vigenciaISO.desde).getTime()) /
                        3600000;

                      // «2 días y 5 h», no «2.2 días»: los decimales de un
                      // día no se leen, y el punto ni siquiera es el del idioma.
                      const num = (x: number) =>
                        new Intl.NumberFormat(localeActual(), {
                          maximumFractionDigits: 1,
                        }).format(x);
                      const dias = Math.floor(horas / 24);
                      const resto = Math.round(horas - dias * 24);

                      return horas >= 48
                        ? resto
                          ? t("ui.PostSiteWizard.evento.duraDiasYHoras", {
                              defaultValue: "Dura {{dias}} días y {{horas}} h.",
                              dias,
                              horas: resto,
                            })
                          : t("ui.PostSiteWizard.evento.duraDias", {
                              defaultValue: "Dura {{n}} días.",
                              n: dias,
                            })
                        : t("ui.PostSiteWizard.evento.duraHoras", {
                            defaultValue: "Dura {{n}} h.",
                            n: num(Math.round(horas * 10) / 10),
                          });
                    })()}{" "}
                    {t(
                      "ui.PostSiteWizard.evento.alTerminar",
                      "Al terminar, los vigilantes quedan libres y el evento se queda con su historial (fichajes, incidentes e informe).",
                    )}
                  </p>
                )}
                {pasaAHistorial && (
                  <InfoNote
                    className="mt-3"
                    icon={<CalendarClock />}
                    title={t(
                      "ui.PostSiteWizard.evento.historialTitulo",
                      "Con estas fechas el evento ya terminó: quedará sólo como historial",
                    )}
                    tone="warn"
                  >
                    {cfgGet("archivarAlTerminar", true) !== false
                      ? t(
                          "ui.PostSiteWizard.evento.historialAviso",
                          "Al guardar no se crean turnos ni nómina hacia atrás. Sus asignaciones se cierran y los vigilantes sin otro puesto se archivan. Si alguien está fichado ahora mismo en el evento, no se podrá guardar.",
                        )
                      : t(
                          "ui.PostSiteWizard.evento.historialAvisoSinArchivar",
                          "Al guardar no se crean turnos ni nómina hacia atrás y sus asignaciones se cierran (este evento no archiva a su gente). Si alguien está fichado ahora mismo en el evento, no se podrá guardar.",
                        )}
                  </InfoNote>
                )}
                {vuelveDelHistorial && (
                  <p
                    className="mt-3 flex items-start gap-1.5 text-xs"
                    style={{ color: "var(--info-text)" }}
                  >
                    <CalendarClock
                      aria-hidden
                      className="mt-px h-3.5 w-3.5 shrink-0"
                    />
                    {t(
                      "ui.PostSiteWizard.evento.vuelveAlFuturoAviso",
                      "Este evento ya había terminado: al guardar se reabrirán sus asignaciones y volverán sus vigilantes.",
                    )}
                  </p>
                )}
                {/* Al terminar, su gente libera el asiento (por defecto sí). El
                   servidor lo lee de `serviceConfig.archivarAlTerminar`; sin
                   la clave, archiva. */}
                <label className="mt-3 flex cursor-pointer select-none items-start gap-2.5">
                  <input
                    checked={cfgGet("archivarAlTerminar", true) !== false}
                    className="cg-focus mt-0.5 h-4 w-4 rounded"
                    style={{ accentColor: "var(--brand)" }}
                    type="checkbox"
                    onChange={(e) =>
                      cfgSet("archivarAlTerminar", e.target.checked)
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-xs font-medium">
                      {t(
                        "ui.PostSiteWizard.evento.archivarAlTerminar",
                        "Al terminar, archivar a los vigilantes que no tengan otro puesto — liberan su asiento",
                      )}
                    </span>
                    <span
                      className="block text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t(
                        "ui.PostSiteWizard.evento.archivarAlTerminarAyuda",
                        "Siguen cobrando sus horas del evento, y si los vuelves a asignar se reactivan solos.",
                      )}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ── Client selector — card style ─────────────────────────── */}
          <div className="glass overflow-hidden">
            <div
              className="flex items-center gap-3 border-b px-4 py-2.5"
              style={{ borderColor: "var(--hairline)" }}
            >
              <IconTile size="sm">
                <Building2 />
              </IconTile>
              <span className="cg-eyebrow">{t("comun.cliente")}</span>
            </div>
            <div className="px-4 py-3">
              {selectedClientObj ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                      style={{
                        background: "var(--brand-wash)",
                        borderColor: "var(--brand-line)",
                        color: "var(--brand-text)",
                      }}
                    >
                      {selectedClientObj.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold">
                      {selectedClientObj.name}
                    </span>
                  </div>
                  {!clientLocked && (
                    <button
                      className="cg-focus flex items-center gap-1 rounded-md text-xs transition-colors"
                      style={{ color: "var(--ink-soft)" }}
                      type="button"
                      onClick={() => setClientId("")}
                    >
                      <Edit3 className="h-3 w-3" />{" "}
                      {t("ui.PostSiteWizard.cambiar", "Cambiar")}
                    </button>
                  )}
                </div>
              ) : (
                <select
                  className="cg-input cg-focus flex h-9 w-full px-3 py-1 text-sm"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">
                    {t("ui.PostSiteWizard.seleccionarCliente")}
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {/* ── Same address as client toggle ── */}
            {clientId && clientData?.address && (
              <div
                className="border-t px-4 py-2.5"
                style={{ borderColor: "var(--hairline)" }}
              >
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    checked={useClientAddress}
                    className="cg-focus h-4 w-4 rounded"
                    style={{ accentColor: "var(--brand)" }}
                    type="checkbox"
                    onChange={(e) => {
                      const checked = e.target.checked;

                      setUseClientAddress(checked);
                      if (checked && clientData) {
                        setAddress(clientData.address || "");
                        setAddressLine2(clientData.addressLine2 || "");
                        setCity(clientData.city || "");
                        setCountry(clientData.country || "");
                        setPostalCode(clientData.postalCode || "");
                        if (clientData.latitude)
                          setLatitud(String(clientData.latitude));
                        if (clientData.longitude)
                          setLongitud(String(clientData.longitude));
                        setAddressConfirmed(true);
                      }
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">
                      {t(
                        "ui.PostSiteWizard.mismaDireccionDelCliente",
                        "Misma dirección del cliente",
                      )}
                    </span>
                    <p
                      className="truncate text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {clientData.address}
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Con «Misma dirección del cliente» marcada, el mapa y los campos
             sobran: es el dato que ya se escribió en el alta del cliente. Se
             pliegan; desmarcar los abre para una sede en otro sitio. */}
          {!useClientAddress && (
            <>
              {/* ── Map hero block ──────────────────────────────────────── */}
              <div className="glass">
                <div className="px-4 pt-4 pb-0">
                  <AddressAutocomplete
                    showMap
                    suppressInitialReverse
                    defaultValue={address}
                    initialLat={latitud ? Number(latitud) : undefined}
                    initialLng={longitud ? Number(longitud) : undefined}
                    mapHeight="300px"
                    placeholder={t(
                      "ui.PostSiteWizard.buscarCalleNumeroCiudadLugar",
                      "Buscar calle, número, ciudad, lugar…",
                    )}
                    onAddressSelect={handleAddressSelect}
                  />
                </div>
              </div>

              {/* ── Address confirmation card — appears after selection ─── */}
              {addressConfirmed && (address || city) && (
                <div
                  className="glass overflow-hidden"
                  style={{
                    borderColor:
                      "color-mix(in oklab, var(--ok) 32%, transparent)",
                    background:
                      "color-mix(in oklab, var(--ok) 10%, transparent)",
                  }}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: "var(--ok)",
                        color: "var(--brand-ink)",
                      }}
                    >
                      <Check className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-snug">
                        {address || city}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {city && (
                          <span
                            className="inline-flex items-center gap-1 text-xs"
                            style={{ color: "var(--ok-text)" }}
                          >
                            <Globe className="h-3 w-3" />
                            {[city, country].filter(Boolean).join(", ")}
                          </span>
                        )}
                        {postalCode && (
                          <span
                            className="inline-flex items-center gap-1 text-xs"
                            style={{ color: "var(--ok-text)" }}
                          >
                            <Hash className="h-3 w-3" />
                            {t("ui.PostSiteWizard.cpAbrev", "CP")} {postalCode}
                          </span>
                        )}
                        {coordsLabel && (
                          <span
                            className="inline-flex items-center gap-1 font-mono text-xs"
                            style={{ color: "var(--ok-text)" }}
                          >
                            <Navigation2 className="h-3 w-3" />
                            {coordsLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="cg-focus flex shrink-0 items-center gap-1 rounded-md text-xs transition-colors"
                      style={{ color: "var(--ok-text)" }}
                      type="button"
                      onClick={() => setShowAddressFields((v) => !v)}
                    >
                      <Edit3 className="h-3 w-3" />
                      {t("actions.edit", "Editar")}
                      {showAddressFields ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  {/* Collapsible manual fields */}
                  {showAddressFields && (
                    <div
                      className="space-y-3 border-t px-4 py-4"
                      style={{
                        borderColor:
                          "color-mix(in oklab, var(--ok) 28%, transparent)",
                        background: "var(--glass-sunken)",
                      }}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-foreground/70 mb-1">
                            {t("ui.PostSiteWizard.direccion", "Dirección")}
                          </label>
                          <Input
                            placeholder={t(
                              "ui.PostSiteWizard.calleYNumero",
                              "Calle y número",
                            )}
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-foreground/70 mb-1">
                            {t("ui.PostSiteWizard.complemento", "Complemento")}
                          </label>
                          <Input
                            placeholder={t(
                              "ui.PostSiteWizard.aptoPisoReferencia",
                              "Apto., piso, referencia…",
                            )}
                            value={addressLine2}
                            onChange={(e) => setAddressLine2(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground/70 mb-1">
                            {t("comun.ciudad")}
                          </label>
                          <Input
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground/70 mb-1">
                            {t("ui.PostSiteWizard.pais", "País")}
                          </label>
                          <Input
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground/70 mb-1">
                            {t(
                              "ui.PostSiteWizard.codigoPostal",
                              "Código postal",
                            )}
                          </label>
                          <Input
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-foreground/70 mb-1">
                              {t("postSites.stations.lat", "Latitud")}
                            </label>
                            <Input
                              className="font-mono text-xs"
                              placeholder="0.000000"
                              value={latitud}
                              onChange={(e) => setLatitud(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-foreground/70 mb-1">
                              {t("postSites.stations.lng", "Longitud")}
                            </label>
                            <Input
                              className="font-mono text-xs"
                              placeholder="0.000000"
                              value={longitud}
                              onChange={(e) => setLongitud(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <CampoSucursalDeSede
                    ciudad={city}
                    value={branchId}
                    onChange={setBranchId}
                  />
                </div>
              )}

              {/* Fallback: show bare fields if no address confirmed yet */}
              {!addressConfirmed && address && (
                <div className="glass-sunken space-y-3 px-4 py-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-foreground/70 mb-1">
                      {t("ui.PostSiteWizard.direccion2", "Dirección")}
                    </label>
                    <Input
                      placeholder={t(
                        "ui.PostSiteWizard.calleYNumero2",
                        "Calle y número",
                      )}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Briefing del evento: lo que el vigilante necesita saber al
                 llegar. Todo opcional y PLANO en `serviceConfig`; la app se lo
                 enseña en su turno. ─────────────────────────────────────── */}
          {esEventoSel && (
            <div className="glass overflow-hidden">
              <div
                className="flex items-center gap-3 border-b px-4 py-2.5"
                style={{ borderColor: "var(--hairline)" }}
              >
                <IconTile size="sm">
                  <Users />
                </IconTile>
                <div className="min-w-0">
                  <span className="cg-eyebrow block">
                    {t(
                      "ui.PostSiteWizard.evento.briefing",
                      "Instrucciones para los vigilantes",
                    )}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t(
                      "ui.PostSiteWizard.evento.briefingAyuda",
                      "Opcional. Lo ven en la app con su turno.",
                    )}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
                {(
                  [
                    [
                      "encuentro",
                      "ui.PostSiteWizard.evento.encuentro",
                      "Punto de encuentro",
                      "ui.PostSiteWizard.evento.encuentroEj",
                      "Ej. Acceso 3, junto a taquillas",
                    ],
                    [
                      "uniforme",
                      "ui.PostSiteWizard.evento.uniforme",
                      "Uniforme",
                      "ui.PostSiteWizard.evento.uniformeEj",
                      "Ej. Chaleco y pantalón negro",
                    ],
                    [
                      "responsable",
                      "ui.PostSiteWizard.evento.responsable",
                      "Responsable en el lugar",
                      "ui.PostSiteWizard.evento.responsableEj",
                      "Nombre de quien recibe al equipo",
                    ],
                    [
                      "telefonoResponsable",
                      "ui.PostSiteWizard.evento.telefonoResponsable",
                      "Teléfono del responsable",
                      "",
                      "",
                    ],
                  ] as const
                ).map(([k, lk, l, pk, pl]) => (
                  <div key={k}>
                    <label
                      className="mb-1 block text-xs font-medium text-foreground/70"
                      htmlFor={`evento-${k}`}
                    >
                      {t(lk, l)}
                    </label>
                    <Input
                      id={`evento-${k}`}
                      maxLength={200}
                      placeholder={pk ? t(pk, pl) : undefined}
                      type={k === "telefonoResponsable" ? "tel" : "text"}
                      value={String(cfgGet(k) ?? "")}
                      onChange={(e) => cfgSet(k, e.target.value)}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label
                    className="mb-1 block text-xs font-medium text-foreground/70"
                    htmlFor="evento-instrucciones"
                  >
                    {t(
                      "ui.PostSiteWizard.evento.instrucciones",
                      "Instrucciones",
                    )}
                  </label>
                  <Textarea
                    id="evento-instrucciones"
                    maxLength={4000}
                    placeholder={t(
                      "ui.PostSiteWizard.evento.instruccionesEj",
                      "Qué controlar, por dónde entra el público, a quién avisar ante un incidente…",
                    )}
                    rows={4}
                    value={String(cfgGet("instrucciones") ?? "")}
                    onChange={(e) => cfgSet("instrucciones", e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Nivel de riesgo de la sede (el del cliente es el promedio) ── */}
          <div className="glass p-4">
            <label className="cg-eyebrow mb-1 block">
              {t("clients.form.riskLevel", "Nivel de riesgo")}
            </label>
            <select
              className="cg-input cg-focus flex h-9 w-full max-w-xs px-3 py-1 text-sm"
              value={cfgGet("riskLevel")}
              onChange={(e) => cfgSet("riskLevel", e.target.value)}
            >
              <option value="">{t("comun.seleccionar")}</option>
              {[
                ["low", "clients.riskLevel.low", "Bajo"],
                ["medium", "clients.riskLevel.medium", "Medio"],
                ["high", "clients.riskLevel.high", "Alto"],
                ["critical", "ui.PostSiteWizard.riesgoCritico", "Crítico"],
              ].map(([v, k, l]) => (
                <option key={v} value={v}>
                  {t(k, l)}
                </option>
              ))}
            </select>
          </div>

          {/* ── Site Photo ────────────────────────────────────────── */}
          <div className="glass overflow-hidden">
            <div
              className="flex items-center gap-3 border-b px-4 py-2.5"
              style={{ borderColor: "var(--hairline)" }}
            >
              <IconTile size="sm">
                <ImagePlus />
              </IconTile>
              <span className="cg-eyebrow">
                {t("ui.PostSiteWizard.fotoDelSitio")}
              </span>
            </div>
            <div className="px-4 py-4">
              <label className="cursor-pointer block">
                <input
                  accept="image/*"
                  className="hidden"
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];

                    if (!f) return;
                    setPlaceFile(f);
                    setPlacePrev(URL.createObjectURL(f));
                  }}
                />
                <div
                  className="relative flex aspect-video w-full max-w-[280px] items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors"
                  style={{
                    borderColor: "var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  {placePreview ? (
                    <img
                      alt={t("ui.PostSiteWizard.fotoDelSitio")}
                      className="h-full w-full object-cover"
                      src={placePreview}
                    />
                  ) : (
                    <div
                      className="flex flex-col items-center gap-1"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      <Upload size={20} />
                      <span className="text-[11px]">
                        {t("ui.PostSiteWizard.subirFotoDelSitio")}
                      </span>
                    </div>
                  )}
                </div>
              </label>
              {placePreview && (
                <button
                  className="cg-focus mt-1 rounded-md text-[11px] hover:underline"
                  style={{ color: "var(--bad-text)" }}
                  type="button"
                  onClick={() => {
                    setPlaceFile(null);
                    setPlacePrev(null);
                    setPlaceExisting(null);
                  }}
                >
                  {t("ui.PostSiteWizard.quitar", "Quitar")}
                </button>
              )}
            </div>
          </div>
          {isEdit && (
            <Section title={t("ui.PostSiteWizard.estadoDelSitio")}>
              <div className="flex max-w-xs gap-2">
                {(["active", "inactive"] as const).map((s) => {
                  const sel = status === s;
                  const fill =
                    s === "active" ? "var(--ok)" : "var(--ink-faint)";

                  return (
                    <button
                      key={s}
                      aria-pressed={sel}
                      className="cg-focus h-9 flex-1 rounded-md border text-sm font-medium transition-colors"
                      style={
                        sel
                          ? {
                              background: `color-mix(in oklab, ${fill} 14%, transparent)`,
                              borderColor: `color-mix(in oklab, ${fill} 34%, transparent)`,
                              color:
                                s === "active"
                                  ? "var(--ok-text)"
                                  : "var(--ink-soft)",
                            }
                          : {
                              background: "var(--glass-sunken)",
                              borderColor: "var(--hairline)",
                              color: "var(--ink-faint)",
                            }
                      }
                      type="button"
                      onClick={() => setStatus(s)}
                    >
                      {s === "active"
                        ? t("common.active", "Activo")
                        : t("common.inactive", "Inactivo")}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      );
    }

    // ── Step 3: Estaciones — el formulario completo, una a una ────────────────
    if (step === 3) {
      const sedeId = isEdit ? id! : (createdId ?? "");
      const existentes = stations
        .filter((x) => x.existingId)
        .map((x) => ({ id: x.existingId!, name: x.name }));
      const todas = [...existentes, ...creadas];
      /* Un evento que YA TERMINÓ es historial: crearle zonas ahora no tiene
         turnos que generar ni nadie a quien asignar. Se dice y se cierra la
         puerta; para añadir zonas, primero se le cambian las fechas. */
      const terminadoYa = !!sedeGuardada && eventoTerminado(sedeGuardada);

      return (
        <div className="space-y-5">
          <div>
            <h2 className="font-display mb-0.5 text-xl font-bold">
              {t(
                "ui.PostSiteWizard.estacionesDeLaSede",
                "Estaciones de la sede",
              )}
            </h2>
            {/* Terminado, la invitación a crear no aplica: lo dice la nota. */}
            {!terminadoYa && (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {esEventoSel
                  ? t(
                      "ui.PostSiteWizard.creaCadaEstacionEvento",
                      "Crea cada estación del evento: nombre, de qué hora a qué hora se cubre, cuántos vigilantes a la vez y geocerca. Sin rotación: el evento tiene sus fechas. Cuando estén todas, pulsa «Terminar».",
                    )
                  : t(
                      "ui.PostSiteWizard.creaCadaEstacion",
                      "Crea cada estación con su nombre, nominativo, horario y geocerca. Cuando estén todas, pulsa «Terminar».",
                    )}
              </p>
            )}
          </div>

          {todas.length > 0 && (
            <div className="glass p-4">
              <p className="text-sm font-semibold">
                {t("ui.PostSiteWizard.estacionesConteo", {
                  defaultValue: "Estaciones ({{count}})",
                  count: todas.length,
                })}
              </p>
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {todas.map((x) => x.name).join(" · ")}
              </p>
            </div>
          )}

          {terminadoYa ? (
            <InfoNote
              icon={<CalendarClock />}
              title={t(
                "ui.PostSiteWizard.evento.terminadoSinZonasTitulo",
                "Evento terminado",
              )}
              tone="info"
            >
              {t(
                "ui.PostSiteWizard.evento.terminadoSinZonas",
                "Este evento ya terminó: queda como historial. Para añadir zonas, cambia primero sus fechas.",
              )}
            </InfoNote>
          ) : sedeGuardada && sedeId ? (
            /* `key` remonta el formulario tras cada alta: queda limpio para la
               siguiente estación sin que el componente sepa nada de esto. */
            <StationCreateForm
              key={creadas.length}
              modo={esEvento(sedeGuardada) ? "evento" : "normal"}
              site={sedeGuardada}
              siteId={sedeId}
              submitLabel={t(
                "ui.PostSiteWizard.guardarEstacion",
                "Guardar estación",
              )}
              onCreated={(st) => {
                setCreadas((c) => [...c, st]);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ) : (
            <div className="flex items-center justify-center py-16">
              <Loader2
                className="h-6 w-6 animate-spin"
                style={{ color: "var(--brand-text)" }}
              />
            </div>
          )}
        </div>
      );
    }

    // ── Step 4: Listo ─────────────────────────────────────────────────────────
    if (step === 4) {
      const sedeId = isEdit ? id! : (createdId ?? "");
      const n = stations.filter((x) => x.existingId).length + creadas.length;
      const nombreParaPlan = (resolvedClientName || "").trim();

      return (
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full border-2"
            style={{
              background: "color-mix(in oklab, var(--ok) 14%, transparent)",
              borderColor: "color-mix(in oklab, var(--ok) 40%, transparent)",
              color: "var(--ok-text)",
            }}
          >
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">
              {t("ui.PostSiteWizard.sedeListaExcl", "¡Sede lista!")}
            </h2>
            <p
              className="mx-auto mt-2 max-w-sm text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              {n > 0 && esEventoSel
                ? t("ui.PostSiteWizard.eventoConEstaciones", {
                    defaultValue:
                      "{{count}} estaciones. Siguiente: asigna a los vigilantes; las fechas y horas las pone el evento.",
                    count: n,
                  })
                : n > 0
                  ? t("ui.PostSiteWizard.sedeConEstaciones", {
                      defaultValue:
                        "{{count}} estaciones. Siguiente: pon a cada una su vigilante; con eso el horario se arma solo y lo cuadras en el Planificador.",
                      count: n,
                    })
                  : t(
                      "ui.PostSiteWizard.sedeSinEstacionesAun",
                      "Sin estaciones todavía. Puedes crearlas desde la sede cuando quieras.",
                    )}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {n > 0 ? (
              <>
                <Button
                  className="gap-2"
                  type="button"
                  variant="brand"
                  onClick={() => navigate(`/post-sites/${sedeId}/stations`)}
                >
                  <Users className="h-4 w-4" />
                  {t(
                    "ui.PostSiteWizard.asignarVigilantes",
                    "Asignar vigilantes",
                  )}
                </Button>
                {/* Un evento no tiene rotación que cuadrar. */}
                {!esEventoSel && (
                  <Button
                    className="gap-2"
                    type="button"
                    variant="outline"
                    onClick={() =>
                      navigate(
                        `/planificador?busca=${encodeURIComponent(nombreParaPlan)}`,
                      )
                    }
                  >
                    <CalendarRange className="h-4 w-4" />
                    {t(
                      "ui.PostSiteWizard.abrirPlanificador",
                      "Abrir en el Planificador",
                    )}
                  </Button>
                )}
              </>
            ) : (
              <Button
                className="gap-2"
                type="button"
                variant="brand"
                onClick={() => setStep(3)}
              >
                <Plus className="h-4 w-4" />
                {t("ui.PostSiteWizard.crearEstacion", "Crear estación")}
              </Button>
            )}
            <Button
              className="gap-2"
              type="button"
              variant="outline"
              onClick={() => navigate(`/post-sites/${sedeId}/profile`)}
            >
              <MapPin className="h-4 w-4" />
              {t("ui.PostSiteWizard.irAlPerfil", "Ir al perfil")}
            </Button>
          </div>
        </div>
      );
    }

    return null;
  };

  // ── nav ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      {loadingEdit ? (
        <div className="flex items-center justify-center py-24">
          <Loader2
            className="h-8 w-8 animate-spin"
            style={{ color: "var(--brand-text)" }}
          />
        </div>
      ) : (
        <>
          {/* Puesta en marcha: se entró desde el alta del cliente */}
          {enPuesta && (
            <div className="mb-4">
              <HiloDePuesta
                pasos={[
                  {
                    clave: "cliente",
                    hecho: true,
                    href: clientId
                      ? `/clients/${clientId}/overview`
                      : undefined,
                  },
                  { clave: "sede", hecho: step >= 3 },
                  {
                    clave: "puestos",
                    hecho: step >= 4 || creadas.length > 0,
                  },
                  { clave: "vigilantes", hecho: false },
                  { clave: "horario", hecho: false },
                ]}
              />
            </div>
          )}
          <div className="mb-8">
            <StepBar current={step} total={STEP_LABELS.length} />
          </div>

          {/* Content */}
          <div className="min-h-[420px]">{renderStep()}</div>

          {/* Pie: en los dos primeros pasos se navega; el 2 guarda la sede. En
              el 3 el formulario de estación tiene sus botones y aquí sólo
              queda «Terminar». El 4 no tiene pie. */}
          {step <= 2 && (
            <div
              className="mt-8 flex items-center justify-between border-t pt-5"
              style={{ borderColor: "var(--hairline)" }}
            >
              <Button
                className="gap-1.5 text-foreground/70"
                type="button"
                variant="ghost"
                onClick={() => {
                  // Cancelar devuelve al sitio de donde se vino: la ficha del
                  // cliente si se entró desde ahí, si no la lista.
                  if (step <= (isEdit ? 2 : 1)) {
                    navigate(
                      isEdit
                        ? `/post-sites/${id}`
                        : clientLocked
                          ? `/clients/${presetClientId}/post-sites`
                          : "/post-sites",
                    );
                  } else setStep((s) => s - 1);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                {step <= (isEdit ? 2 : 1)
                  ? t("actions.cancel", "Cancelar")
                  : t("actions.back", "Atrás")}
              </Button>

              {step === 2 ? (
                <Button
                  className="gap-2 min-w-36"
                  disabled={
                    submitting ||
                    !address.trim() ||
                    !!errorVigencia ||
                    faltaNombreEvento
                  }
                  type="button"
                  variant="brand"
                  onClick={handleCreateSite}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />{" "}
                      {t("common.saving", "Guardando…")}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />{" "}
                      {t(
                        "ui.PostSiteWizard.guardarSedeYSeguir",
                        "Guardar sede y seguir",
                      )}
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  className="gap-1.5"
                  disabled={!canGoNext()}
                  type="button"
                  variant="brand"
                  onClick={() => setStep((s) => s + 1)}
                >
                  {t("kit.pagination.next", "Siguiente")}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          {step === 3 && (
            <div
              className="mt-8 flex items-center justify-end border-t pt-5"
              style={{ borderColor: "var(--hairline)" }}
            >
              <Button
                className="gap-1.5"
                type="button"
                variant="brand"
                onClick={() => setStep(4)}
              >
                {t("ui.PostSiteWizard.terminar", "Terminar")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
