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

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invalidateEntity } from "@/lib/queryClient";
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
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

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { stationService } from '@/lib/api/stationService';
import { ApiService } from '@/services/api/apiService';
import { clientService } from '@/lib/api/clientService';
import { ServiceTypePicker } from '@/components/post-sites/ServiceTypeBadge';
import AddressAutocomplete, { AddressComponents } from '@/components/maps/AddressAutocomplete';
import { useClientSelection } from '@/contexts/ClientSelectionContext';
import { getServiceType } from '@/lib/serviceTypes';
import { ImagePlus, Upload } from 'lucide-react';
import { Section, EmptyState, IconTile } from '@/components/kit';

// ─── types ────────────────────────────────────────────────────────────────────

export type WizardClient = { id: string; name: string };

interface WizardProps {
  clients?: WizardClient[];
  mode?: 'create' | 'edit';
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
  tipo: 'matutina' | 'nocturna' | 'sacafranco' | 'personalizada';
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
interface FileAsset { downloadUrl?: string; publicUrl?: string }
// A raw station row from stationService.list, read in edit mode.
interface StationApiRow {
  id?: string;
  stationName?: string;
  name?: string;
  description?: string;
  scheduleType?: string;
  stationSchedule?: string;
}

// Map the station's turnos (jornadas) to the scheduling engine's scheduleType.
// Day = matutina, night = nocturna; both → 24h; otherwise custom. Sacafranco
// jornadas are relief, not a station coverage type.
function deriveScheduleType(jornadas: JornadaDraft[]): '24h' | '12h-day' | '12h-night' | 'custom' | null {
  const hasDay = jornadas.some((j) => j.tipo === 'matutina');
  const hasNight = jornadas.some((j) => j.tipo === 'nocturna');
  if (hasDay && hasNight) return '24h';
  if (hasNight) return '12h-night';
  if (hasDay) return '12h-day';
  if (jornadas.length) return 'custom';
  return null;
}

// ─── tiny helpers ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['Tipo', 'Sitio', 'Config.', 'Estaciones', 'Crear'];
const SCHEDULES = ['1 hora', '4 horas', '8 horas', '10 horas', '12 horas', '14 horas', '16 horas', '24 horas'];

const JORNADA_PRESETS: { tipo: JornadaDraft['tipo']; label: string; startTime: string; endTime: string }[] = [
  { tipo: 'matutina',     label: 'Matutina',     startTime: '06:00', endTime: '18:00' },
  { tipo: 'nocturna',     label: 'Nocturna',     startTime: '18:00', endTime: '06:00' },
  { tipo: 'sacafranco',   label: 'Sacafranco',   startTime: '06:00', endTime: '18:00' },
  { tipo: 'personalizada',label: 'Personalizada',startTime: '',      endTime: ''      },
];

// El tinte de cada jornada sale de los semánticos del sistema: matutina = día
// (warn), nocturna = noche (info), sacafranco = relevo (ok). Nada escrito a mano
// para que el acento del usuario no choque con la píldora.
const JORNADA_TONE: Record<JornadaDraft['tipo'], 'warn' | 'info' | 'ok' | 'neutral'> = {
  matutina: 'warn',
  nocturna: 'info',
  sacafranco: 'ok',
  personalizada: 'neutral',
};

function jornadaFill(tipo: JornadaDraft['tipo']) {
  const t = JORNADA_TONE[tipo] ?? 'neutral';
  return t === 'neutral' ? 'var(--ink-faint)' : `var(--${t})`;
}

/** Píldora de la jornada — fondo, borde y tinta del mismo semántico. */
function jornadaChip(tipo: JornadaDraft['tipo']): React.CSSProperties {
  const t = JORNADA_TONE[tipo] ?? 'neutral';
  const fill = jornadaFill(tipo);
  return {
    background: `color-mix(in oklab, ${fill} 14%, transparent)`,
    borderColor: `color-mix(in oklab, ${fill} 32%, transparent)`,
    color: t === 'neutral' ? 'var(--ink-soft)' : `var(--${t}-text)`,
  };
}

/** Canto teñido de la fila de jornada. */
function jornadaEdge(tipo: JornadaDraft['tipo']): React.CSSProperties {
  return { borderColor: `color-mix(in oklab, ${jornadaFill(tipo)} 30%, transparent)` };
}

const DEPLOY_CHECKS: { key: string; label: string; defaultOn?: boolean }[] = [
  { key: 'armedService',    label: 'Vigilante armado' },
  { key: 'uniformRequired', label: 'Uniforme obligatorio', defaultOn: true },
  { key: 'periodicPatrol',  label: 'Patrullaje perimetral' },
  { key: 'k9Service',       label: 'Canes / K9' },
  { key: 'vehicleControl',  label: 'Control acceso vehicular' },
  { key: 'cctvMonitoring',  label: 'Monitoreo CCTV' },
  { key: 'visitorLog',      label: 'Registro de visitantes' },
  { key: 'incidentLog',     label: 'Libro de novedades' },
  { key: 'formalHandover',  label: 'Entrega de turno formal' },
  { key: 'keyCustody',      label: 'Custodia de llaves' },
  { key: 'alarmResponse',   label: 'Respuesta a alarmas' },
  { key: 'radioComms',      label: 'Comunicación por radio' },
];

const SERVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, BellAlert: BellElectric, Camera, Car, Lock,
};

// ─── CheckboxGroup with custom-item support ───────────────────────────────────

interface ChipGroupProps {
  options: { value: string; label: string }[];
  value: string[];
  customItems: string[];
  onChange: (selected: string[], custom: string[]) => void;
  placeholder?: string;
}

function ChipGroup({ options, value, customItems, onChange, placeholder = 'Agregar personalizado…' }: ChipGroupProps) {
  const [input, setInput] = useState('');

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
    setInput('');
  };

  const removeCustom = (item: string) => {
    onChange(value, customItems.filter((x) => x !== item));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleKnown(opt.value)}
              className="cg-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all"
              style={
                checked
                  ? { background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }
                  : { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }
              }
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
            style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }}
          >
            <Tag className="h-3 w-3 shrink-0" />
            {item}
            <button
              type="button"
              onClick={() => removeCustom(item)}
              aria-label={`Quitar ${item}`}
              className="cg-focus ml-0.5 rounded-full transition-colors"
              style={{ color: 'var(--bad-text)' }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Custom add row */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!input.trim()}
          className="cg-btn-brand cg-focus flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
          Agregar
        </button>
      </div>
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEP_LABELS.map((label, i) => {
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
                    ? { background: 'var(--ok)', borderColor: 'var(--ok)', color: 'var(--brand-ink)' }
                    : active
                    ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'var(--brand-ink)', boxShadow: '0 0 18px -6px var(--brand-glow)' }
                    : { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-faint)' }
                }
              >
                {done ? <Check className="h-3.5 w-3.5" /> : idx}
              </div>
              <span
                className="hidden sm:block text-[10px] font-medium leading-none"
                style={{ color: active ? 'var(--brand-text)' : done ? 'var(--ok-text)' : 'var(--ink-faint)' }}
              >
                {label}
              </span>
            </div>
            {i < total - 1 && (
              <div
                className="h-0.5 flex-1 rounded transition-all duration-500"
                style={{ background: idx < current ? 'var(--ok)' : 'var(--glass-sunken)' }}
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
  return (
    /* La fila (etiqueta + nombre + dos horas + vigilantes + quitar) pide unos
       300 px de ancho fijo: en un teléfono se parte en dos líneas. */
    <div className="glass-flat flex flex-wrap items-center gap-2 px-3 py-2" style={jornadaEdge(jornada.tipo)}>
      {/* Type badge */}
      <span
        className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
        style={jornadaChip(jornada.tipo)}
      >
        {jornada.tipo === 'sacafranco' ? 'SF' : jornada.tipo.slice(0, 3).toUpperCase()}
      </span>
      {/* Editable name */}
      <Input
        value={jornada.nombre}
        onChange={(e) => onChange({ nombre: e.target.value })}
        className="h-7 min-w-32 flex-1 text-xs font-medium border-0 bg-transparent px-0 focus-visible:ring-0 shadow-none"
        placeholder="Nombre del turno"
      />
      {/* Times */}
      <div className="flex items-center gap-1 shrink-0">
        <Input
          value={jornada.startTime}
          onChange={(e) => onChange({ startTime: e.target.value })}
          placeholder="HH:MM"
          className="h-7 w-16 text-[11px] font-mono text-center px-1"
        />
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <Input
          value={jornada.endTime}
          onChange={(e) => onChange({ endTime: e.target.value })}
          placeholder="HH:MM"
          className="h-7 w-16 text-[11px] font-mono text-center px-1"
        />
      </div>
      {/* Guards */}
      <div className="flex items-center gap-1 shrink-0">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="number" min={1}
          value={jornada.guardsCount}
          onChange={(e) => onChange({ guardsCount: e.target.value })}
          className="h-7 w-10 text-[11px] text-center px-1"
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar jornada"
        className="cg-focus shrink-0 rounded-md transition-colors"
        style={{ color: 'var(--bad-text)' }}
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
  const addJornada = (preset: typeof JORNADA_PRESETS[number]) => {
    const j: JornadaDraft = {
      id: Math.random().toString(36).slice(2),
      nombre: preset.label,
      tipo: preset.tipo,
      startTime: preset.startTime,
      endTime: preset.endTime,
      guardsCount: '1',
    };
    onChange({ jornadas: [...draft.jornadas, j] });
  };

  const updateJornada = (id: string, delta: Partial<JornadaDraft>) => {
    onChange({ jornadas: draft.jornadas.map((j) => (j.id === id ? { ...j, ...delta } : j)) });
  };

  const removeJornada = (id: string) => {
    onChange({ jornadas: draft.jornadas.filter((j) => j.id !== id) });
  };

  return (
    <div className="glass-flat overflow-hidden">
      {/* Station name + delete */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre del puesto *"
          className="font-semibold flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar puesto"
          className="cg-focus shrink-0 rounded-md transition-colors"
          style={{ color: 'var(--bad-text)' }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pb-3">
        <Input
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={t("ui.PostSiteWizard.descripcionDelPuestoOpcional", "Descripción del puesto (opcional)")}
          className="text-sm text-muted-foreground"
        />
      </div>

      {/* Jornadas section */}
      <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="cg-eyebrow flex items-center gap-1">
            <Clock className="h-3 w-3" /> Jornadas / Turnos
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {JORNADA_PRESETS.map((p) => (
              <button
                key={p.tipo}
                type="button"
                onClick={() => addJornada(p)}
                className="cg-focus flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-70"
                style={jornadaChip(p.tipo)}
              >
                <Plus className="h-2.5 w-2.5" />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {draft.jornadas.length === 0 ? (
          <p className="py-3 text-center text-xs italic" style={{ color: 'var(--ink-faint)' }}>
            Sin turnos — añade Matutina, Nocturna o Sacafranco con los botones de arriba.
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
          <p className="pt-1 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
            Cada jornada se guarda como un registro independiente en el puesto.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function PostSiteWizard({ clients = [], mode = 'create', id, presetClientId, presetClientName }: WizardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectedClient } = useClientSelection();
  const isEdit = mode === 'edit' && !!id;

  /**
   * `?step=N` — para poder entrar DIRECTO al paso que falta.
   *
   * El aviso de «falta la configuración operativa» enlaza aquí con `step=1`: lo
   * que falta es el tipo de servicio, y el paso 3 se dibuja entero a partir de
   * él, así que mandar a alguien al paso 2 (donde arranca la edición) le
   * obligaría a adivinar hacia dónde ir. Se acota al rango real de pasos.
   */
  const pasoPedido = (() => {
    const n = Number(searchParams.get('step'));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.trunc(n) : null;
  })();

  // ── form state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState(pasoPedido ?? (isEdit ? 2 : 1));
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);

  // Step 1
  const [serviceType, setServiceType] = useState<string | undefined>(undefined);

  // Step 2
  const [clientId, setClientId] = useState(presetClientId || (selectedClient?.id ? String(selectedClient.id) : ''));
  const [address, setAddress] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');
  const [description, setDescription] = useState('');
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
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

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
    if (presetClientId) { setClientId(presetClientId); return; }
    if (selectedClient?.id) setClientId(String(selectedClient.id));
  }, [selectedClient, presetClientId]);

  // Fetch client details when client changes (for address toggle)
  useEffect(() => {
    if (!clientId) { setClientData(null); return; }
    (async () => {
      try {
        const data = await clientService.getClient(clientId);
        setClientData(data as ClientDetail);
      } catch { setClientData(null); }
    })();
  }, [clientId]);

  // Nombre del cliente elegido. La lista corta del asistente no siempre lo
  // contiene (cuando llega fijado desde su ficha ni siquiera se pide la
  // lista), así que caemos al dato de navegación y luego al detalle cargado.
  const resolvedClientName = useMemo(() => {
    if (!clientId) return null;
    return (
      clients.find((c) => c.id === clientId)?.name
      || presetClientName
      || clientData?.commercialName
      || [clientData?.name, clientData?.lastName].filter(Boolean).join(' ').trim()
      || null
    );
  }, [clients, clientId, presetClientName, clientData]);

  // Load existing site data in edit mode
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const data = await stationService.get(id!);
        const d = data as any;
        setServiceType(d.serviceType ?? undefined);
        setClientId(d.clientAccountId ?? d.clientId ?? '');
        setAddress(d.address ?? '');
        setAddressLine2(d.secondAddress ?? d.addressLine2 ?? '');
        setCity(d.city ?? '');
        setCountry(d.country ?? '');
        setPostalCode(d.postalCode ?? '');
        setLatitud(String(d.latitud ?? d.latitude ?? ''));
        setLongitud(String(d.longitud ?? d.longitude ?? ''));
        setDescription(d.description ?? '');
        setStatus(typeof d.active === 'boolean' ? (d.active ? 'active' : 'inactive') : (d.status ?? 'active'));
        if (d.serviceConfig && typeof d.serviceConfig === 'object') {
          const { specialEquipment, trainingRequired, ...rest } = d.serviceConfig;
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
          const stationsResp = await stationService.list({ postSite: id } as any, { limit: 100, offset: 0 });
          const loadedStations: StationDraft[] = ((stationsResp.rows || []) as unknown as StationApiRow[]).map((r: StationApiRow) => {
            let jornadas: JornadaDraft[] = [];
            try {
              const raw = r.stationSchedule;
              if (raw && typeof raw === 'string' && raw.trim().startsWith('[')) {
                // Normalize the stored tipo: "Crear Estación" writes
                // 'Diurno'/'Nocturno'/'Personalizado' while this wizard uses
                // matutina/nocturna/sacafranco/personalizada — an unknown key
                // crashed JORNADA_STYLE[tipo].ring and killed the whole editor.
                const normTipo = (t: any): JornadaDraft['tipo'] => {
                  const v = String(t || '').toLowerCase();
                  if (v.startsWith('diur') || v.startsWith('matut')) return 'matutina';
                  if (v.startsWith('noct')) return 'nocturna';
                  if (v.startsWith('saca') || v === 'sf') return 'sacafranco';
                  return 'personalizada';
                };
                jornadas = JSON.parse(raw).map((j: any, idx: number) => ({
                  id: String(idx),
                  nombre: j.nombre || j.tipo || '',
                  tipo: normTipo(j.tipo),
                  startTime: j.startTime || '',
                  endTime: j.endTime || '',
                  guardsCount: j.guardsCount || '1',
                }));
              }
            } catch {}
            return {
              name: r.stationName || r.name || '',
              description: r.description || '',
              jornadas,
              existingId: r.id,
              existingScheduleType: r.scheduleType || undefined,
            };
          });
          originalStationIdsRef.current = loadedStations.map((s) => s.existingId!).filter(Boolean);
          if (loadedStations.length > 0) setStations(loadedStations);
        } catch {}
      } catch (e) {
        toast.error('Error al cargar el sitio');
        navigate('/post-sites');
      } finally {
        setLoadingEdit(false);
      }
    })();
  }, [isEdit, id]);

  // ── step validation ──────────────────────────────────────────────────────────
  const canGoNext = () => {
    if (step === 2) return !!address.trim();
    return true; // other steps are optional-ish
  };

  // ── service config helpers ───────────────────────────────────────────────────
  const cfgSet = (key: string, val: any) =>
    setServiceConfig((prev) => ({ ...prev, [key]: val }));
  const cfgGet = (key: string, fallback: any = '') =>
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
    const autoName = address.trim() || (resolvedClientName ? `Sitio de ${resolvedClientName}` : 'Sitio sin nombre');

    const finalConfig = {
      ...serviceConfig,
      specialEquipment: [...equipment, ...customEquipment],
      trainingRequired: [...training, ...customTraining],
    };

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
      latitud,
      longitud,
      serviceType,
      serviceConfig: finalConfig,
      status,
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
      stationSchedule: s.jornadas.length > 0
        ? JSON.stringify(s.jornadas.map((j) => ({
            nombre: j.nombre,
            tipo: j.tipo,
            startTime: j.startTime,
            endTime: j.endTime,
            guardsCount: j.guardsCount || '1',
          })))
        : undefined,
    };
  };

  const syncStationRecords = async (postSiteId: string) => {
    const valid = stations.filter((s) => s.name.trim());
    const tenantId = localStorage.getItem('tenantId') || '';
    const currentIds = new Set(valid.map((s) => s.existingId).filter(Boolean) as string[]);

    // Delete stations that were removed
    const toDelete = originalStationIdsRef.current.filter((sid) => !currentIds.has(sid));
    await Promise.all(
      toDelete.map((sid) => ApiService.delete(`/tenant/${tenantId}/station/${sid}`)),
    );

    // Update existing or create new, then link the turno to the scheduling
    // engine (Programador › Horario) by setting scheduleType + rebuilding the
    // turno positions via /auto-positions. We only fire auto-positions when the
    // turno actually changed (or the station is new), because that rebuild also
    // clears the station's existing guard assignments.
    for (const s of valid) {
      const payload = buildStationPayload(s, postSiteId);
      let stationId = s.existingId || '';
      if (s.existingId) {
        await ApiService.put(`/tenant/${tenantId}/station/${s.existingId}`, { data: payload });
      } else {
        const created: any = await ApiService.post(`/tenant/${tenantId}/station`, { data: payload });
        stationId = created?.id || created?.data?.id || '';
      }

      const desired = deriveScheduleType(s.jornadas);
      const changed = !s.existingId || (desired && desired !== (s.existingScheduleType || ''));
      if (stationId && desired && changed) {
        const first = s.jornadas[0];
        try {
          await ApiService.post(`/tenant/${tenantId}/station/${stationId}/auto-positions`, {
            data: { scheduleType: desired, startTime: first?.startTime || undefined, endTime: first?.endTime || undefined },
          });
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
      const obj = await clientService.uploadFile(placeFile, 'businessInfoLogo');
      const tenantId = localStorage.getItem('tenantId') || '';
      await ApiService.put(`/tenant/${tenantId}/post-site/${postSiteId}`, { data: { logo: [obj] } });
      invalidateEntity("stations");
    } catch {
      toast.error('La foto del sitio no se pudo guardar');
    }
  };

  const handleCreateSite = async () => {
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await stationService.update(id!, payload as any);
        try { await syncStationRecords(id!);
      invalidateEntity("stations"); } catch { toast.error('Cambios guardados, pero algunas estaciones fallaron'); }
        try { await uploadSitePhoto(id!); } catch { /* already toasted inside */ }
        toast.success('Cambios guardados');
        setStep(6);
        return;
      }
      const data = await stationService.create(payload as any);
      const newId = (data as any).id || (data as any).data?.id;
      setCreatedId(newId);
      if (newId) {
        try { await syncStationRecords(newId);
      invalidateEntity("stations"); } catch { toast.error('El sitio fue creado pero algunas estaciones fallaron'); }
        try { await uploadSitePhoto(newId); } catch { /* already toasted inside */ }
      }
      toast.success('Puesto de vigilancia creado');
      setStep(6);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Error al crear el sitio');
    } finally {
      setSubmitting(false);
    }
  };

  const addStationDraft = () => {
    setStations((prev) => [
      ...prev,
      { name: '', description: '', jornadas: [] },
    ]);
  };

  const updateStation = (i: number, delta: Partial<StationDraft>) => {
    setStations((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...delta } : s)));
  };

  const removeStation = (i: number) => {
    setStations((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ── selected client label ────────────────────────────────────────────────────
  const selectedClientLabel = resolvedClientName;

  // ── equipment / training option lists ────────────────────────────────────────
  const equipmentOptions = [
    { value: 'radio', label: 'Radio comunicador' },
    { value: 'metalDetector', label: 'Detector de metales' },
    { value: 'flashlight', label: 'Linterna táctica' },
    { value: 'vehicle', label: 'Vehículo asignado' },
    { value: 'bodycam', label: 'Bodycam' },
    { value: 'baton', label: 'Bastón' },
    { value: 'handcuffs', label: 'Esposas' },
    { value: 'gloves', label: 'Guantes anticorte' },
    { value: 'firstAidKit', label: 'Botiquín de primeros auxilios' },
    { value: 'umbrella', label: 'Impermeable / paraguas' },
    { value: 'torch', label: 'Linterna de búsqueda' },
    { value: 'binoculars', label: 'Binoculares' },
  ];

  const trainingOptions = [
    { value: 'firstAid', label: 'Primeros auxilios' },
    { value: 'crowdControl', label: 'Control de multitudes' },
    { value: 'firearms', label: 'Manejo de armas' },
    { value: 'evacuation', label: 'Evacuación' },
    { value: 'accessControl', label: 'Control de acceso' },
    { value: 'cctv', label: 'Circuito cerrado (CCTV)' },
    { value: 'customerService', label: 'Servicio al cliente' },
    { value: 'defensiveTactics', label: 'Tácticas defensivas' },
    { value: 'fireExtinguisher', label: 'Manejo de extintores' },
    { value: 'panicProtocol', label: 'Protocolo antipánico' },
    { value: 'communication', label: 'Comunicación por radio' },
    { value: 'reportWriting', label: 'Redacción de informes' },
  ];

  // ── render step content ───────────────────────────────────────────────────────
  const renderStep = () => {
    // ── Step 6: Éxito ─────────────────────────────────────────────────────────
    if (step === 6) {
      const stationCount = stations.filter((s) => s.name.trim()).length;
      const targetId = isEdit ? id! : (createdId ?? '');
      return (
        <div className="flex flex-col items-center gap-6 py-8 text-center">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full"
            style={{
              background: 'color-mix(in oklab, var(--ok) 16%, transparent)',
              boxShadow: '0 0 0 8px color-mix(in oklab, var(--ok) 8%, transparent)',
              color: 'var(--ok-text)',
            }}
          >
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">{isEdit ? '¡Cambios guardados!' : '¡Puesto creado!'}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--ink-soft)' }}>
              {isEdit
                ? 'El sitio fue actualizado correctamente.'
                : stationCount > 0
                  ? `${stationCount} estación${stationCount !== 1 ? 'es' : ''} configurada${stationCount !== 1 ? 's' : ''} y lista${stationCount !== 1 ? 's' : ''}.`
                  : 'El sitio fue creado. Puedes añadir estaciones desde su perfil.'}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(clientLocked ? `/clients/${presetClientId}/post-sites` : '/post-sites')}
            >
              {clientLocked ? 'Volver al cliente' : 'Ver todos los sitios'}
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={() => navigate(`/post-sites/${targetId}/profile`)}
              className="gap-2"
            >
              <MapPin className="h-4 w-4" />
              Ir al perfil
            </Button>
          </div>
        </div>
      );
    }

    // ── Step 1: Service type ───────────────────────────────────────────────────
    if (step === 1) {
      return (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="font-display text-xl font-bold">{t("ui.PostSiteWizard.queTipoDeServicioEs", "¿Qué tipo de servicio es este sitio?")}</h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Esto nos permite preparar los campos de configuración adecuados. Puede cambiar después.
            </p>
          </div>
          <ServiceTypePicker
            value={serviceType ?? null}
            onChange={(v) => { setServiceType(v); setStep(2); }}
          />
          <div className="text-center">
            <button
              type="button"
              onClick={() => { setServiceType(undefined); setStep(2); }}
              className="cg-btn-link cg-focus rounded-md text-sm underline underline-offset-4 transition-colors"
            >
              Continuar sin seleccionar tipo
            </button>
          </div>
        </div>
      );
    }

    // ── Step 2: Site info + address ────────────────────────────────────────────
    if (step === 2) {
      const selectedClientObj = resolvedClientName ? { id: clientId, name: resolvedClientName } : null;
      const coordsLabel = latitud && longitud
        ? `${Number(latitud).toFixed(5)}, ${Number(longitud).toFixed(5)}`
        : null;

      return (
        <div className="space-y-5">
          <div>
            <h2 className="font-display mb-0.5 text-xl font-bold">{t("ui.PostSiteWizard.ubicacionDelSitio", "Ubicación del sitio")}</h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {clientLocked
                ? 'Busca la dirección de la sede en el mapa. El cliente ya está asignado.'
                : 'Busca la dirección en el mapa y asigna el sitio a un cliente.'}
            </p>
          </div>

          {/* ── Client selector — card style ─────────────────────────── */}
          <div className="glass overflow-hidden">
            <div className="flex items-center gap-3 border-b px-4 py-2.5" style={{ borderColor: 'var(--hairline)' }}>
              <IconTile size="sm"><Building2 /></IconTile>
              <span className="cg-eyebrow">Cliente</span>
            </div>
            <div className="px-4 py-3">
              {selectedClientObj ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                      style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }}
                    >
                      {selectedClientObj.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold">{selectedClientObj.name}</span>
                  </div>
                  {!clientLocked && (
                    <button
                      type="button"
                      onClick={() => setClientId('')}
                      className="cg-focus flex items-center gap-1 rounded-md text-xs transition-colors"
                      style={{ color: 'var(--ink-soft)' }}
                    >
                      <Edit3 className="h-3 w-3" /> Cambiar
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="cg-input cg-focus flex h-9 w-full px-3 py-1 text-sm"
                >
                  <option value="">— Seleccionar cliente —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            {/* ── Same address as client toggle ── */}
            {clientId && clientData?.address && (
              <div className="border-t px-4 py-2.5" style={{ borderColor: 'var(--hairline)' }}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useClientAddress}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseClientAddress(checked);
                      if (checked && clientData) {
                        setAddress(clientData.address || '');
                        setAddressLine2(clientData.addressLine2 || '');
                        setCity(clientData.city || '');
                        setCountry(clientData.country || '');
                        setPostalCode(clientData.postalCode || '');
                        if (clientData.latitude) setLatitud(String(clientData.latitude));
                        if (clientData.longitude) setLongitud(String(clientData.longitude));
                        setAddressConfirmed(true);
                      }
                    }}
                    className="cg-focus h-4 w-4 rounded"
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{t("ui.PostSiteWizard.mismaDireccionDelCliente", "Misma dirección del cliente")}</span>
                    <p className="truncate text-[11px]" style={{ color: 'var(--ink-soft)' }}>{clientData.address}</p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* ── Map hero block ──────────────────────────────────────── */}
          <div className="glass">
            <div className="px-4 pt-4 pb-0">
              <AddressAutocomplete
                onAddressSelect={handleAddressSelect}
                defaultValue={address}
                placeholder={t("ui.PostSiteWizard.buscarCalleNumeroCiudadLugar", "Buscar calle, número, ciudad, lugar…")}
                showMap
                mapHeight="300px"
                initialLat={latitud ? Number(latitud) : undefined}
                initialLng={longitud ? Number(longitud) : undefined}
                suppressInitialReverse
              />
            </div>
          </div>

          {/* ── Address confirmation card — appears after selection ─── */}
          {addressConfirmed && (address || city) && (
            <div
              className="glass overflow-hidden"
              style={{
                borderColor: 'color-mix(in oklab, var(--ok) 32%, transparent)',
                background: 'color-mix(in oklab, var(--ok) 10%, transparent)',
              }}
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'var(--ok)', color: 'var(--brand-ink)' }}
                >
                  <Check className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-snug">
                    {address || city}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {city && (
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--ok-text)' }}>
                        <Globe className="h-3 w-3" />
                        {[city, country].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {postalCode && (
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--ok-text)' }}>
                        <Hash className="h-3 w-3" />
                        CP {postalCode}
                      </span>
                    )}
                    {coordsLabel && (
                      <span className="inline-flex items-center gap-1 font-mono text-xs" style={{ color: 'var(--ok-text)' }}>
                        <Navigation2 className="h-3 w-3" />
                        {coordsLabel}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddressFields((v) => !v)}
                  className="cg-focus flex shrink-0 items-center gap-1 rounded-md text-xs transition-colors"
                  style={{ color: 'var(--ok-text)' }}
                >
                  <Edit3 className="h-3 w-3" />
                  Editar
                  {showAddressFields ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>

              {/* Collapsible manual fields */}
              {showAddressFields && (
                <div
                  className="space-y-3 border-t px-4 py-4"
                  style={{ borderColor: 'color-mix(in oklab, var(--ok) 28%, transparent)', background: 'var(--glass-sunken)' }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-foreground/70 mb-1">{t("ui.PostSiteWizard.direccion", "Dirección")}</label>
                      <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("ui.PostSiteWizard.calleYNumero", "Calle y número")} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-foreground/70 mb-1">Complemento</label>
                      <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Apto., piso, referencia…" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground/70 mb-1">Ciudad</label>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground/70 mb-1">{t("ui.PostSiteWizard.pais", "País")}</label>
                      <Input value={country} onChange={(e) => setCountry(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground/70 mb-1">{t("ui.PostSiteWizard.codigoPostal", "Código postal")}</label>
                      <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-foreground/70 mb-1">Latitud</label>
                        <Input value={latitud} onChange={(e) => setLatitud(e.target.value)} placeholder="0.000000" className="font-mono text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground/70 mb-1">Longitud</label>
                        <Input value={longitud} onChange={(e) => setLongitud(e.target.value)} placeholder="0.000000" className="font-mono text-xs" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fallback: show bare fields if no address confirmed yet */}
          {!addressConfirmed && address && (
            <div className="glass-sunken space-y-3 px-4 py-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-foreground/70 mb-1">{t("ui.PostSiteWizard.direccion2", "Dirección")}</label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("ui.PostSiteWizard.calleYNumero2", "Calle y número")} />
              </div>
            </div>
          )}

          {/* ── Description ─────────────────────────────────────────── */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold">{t("ui.PostSiteWizard.descripcionDelSitio", "Descripción del sitio")}</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("ui.PostSiteWizard.descripcionGeneralIndicacionesEspeciales", "Descripción general, indicaciones especiales…")}
              rows={3}
            />
          </div>

          {/* ── Site Photo ────────────────────────────────────────── */}
          <div className="glass overflow-hidden">
            <div className="flex items-center gap-3 border-b px-4 py-2.5" style={{ borderColor: 'var(--hairline)' }}>
              <IconTile size="sm"><ImagePlus /></IconTile>
              <span className="cg-eyebrow">Foto del sitio</span>
            </div>
            <div className="px-4 py-4">
              <label className="cursor-pointer block">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setPlaceFile(f);
                  setPlacePrev(URL.createObjectURL(f));
                }} />
                <div
                  className="relative flex aspect-video w-full max-w-[280px] items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
                >
                  {placePreview ? (
                    <img src={placePreview} className="h-full w-full object-cover" alt="Foto del sitio" />
                  ) : (
                    <div className="flex flex-col items-center gap-1" style={{ color: 'var(--ink-faint)' }}>
                      <Upload size={20} />
                      <span className="text-[11px]">Subir foto del sitio</span>
                    </div>
                  )}
                </div>
              </label>
              {placePreview && (
                <button
                  type="button"
                  onClick={() => { setPlaceFile(null); setPlacePrev(null); setPlaceExisting(null); }}
                  className="cg-focus mt-1 rounded-md text-[11px] hover:underline"
                  style={{ color: 'var(--bad-text)' }}
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── Step 3: Config (equipment / training + type-specific) ─────────────────
    if (step === 3) {
      const typeDef = serviceType ? getServiceType(serviceType) : null;

      return (
        <div className="space-y-6">
          <div>
            <h2 className="font-display mb-1 text-xl font-bold">
              Configuración operativa
              {typeDef && (
                <span className="ml-2 text-base font-normal" style={{ color: 'var(--brand-text)' }}>— {typeDef.label}</span>
              )}
            </h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t("ui.PostSiteWizard.equipamientoCapacitacionYParametrosDel", "Equipamiento, capacitación y parámetros del servicio.")}</p>
          </div>

          {/* Equipment */}
          <Section title="Equipamiento" icon={<Zap />} contentClassName="space-y-3">
            <ChipGroup
              options={equipmentOptions}
              value={equipment}
              customItems={customEquipment}
              onChange={(sel, cust) => { setEquipment(sel); setCustomEquipment(cust); }}
              placeholder="Agregar otro equipo…"
            />
          </Section>

          {/* Training */}
          <Section title={t("ui.PostSiteWizard.capacitacionRequerida", "Capacitación requerida")} icon={<Star />} contentClassName="space-y-3">
            <ChipGroup
              options={trainingOptions}
              value={training}
              customItems={customTraining}
              onChange={(sel, cust) => { setTraining(sel); setCustomTraining(cust); }}
              placeholder={t("ui.PostSiteWizard.agregarOtraCapacitacion", "Agregar otra capacitación…")}
            />
          </Section>

          {/* Deployment checks */}
          <Section title="Despliegue operativo" icon={<Shield />} contentClassName="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="cg-eyebrow mb-1 block">Nivel de riesgo</label>
                <select
                  value={cfgGet('riskLevel')}
                  onChange={(e) => cfgSet('riskLevel', e.target.value)}
                  className="cg-input cg-focus flex h-9 w-full px-3 py-1 text-sm"
                >
                  <option value="">Seleccionar…</option>
                  {[['low','Bajo'],['medium','Medio'],['high','Alto'],['critical','Crítico']].map(([v,l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="cg-eyebrow mb-1 block">{t("ui.PostSiteWizard.minimoDeEstaciones", "Mínimo de estaciones")}</label>
                <Input
                  type="number" min={1}
                  placeholder="Ej. 2"
                  value={cfgGet('stationsRequired')}
                  onChange={(e) => cfgSet('stationsRequired', e.target.value ? Number(e.target.value) : '')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DEPLOY_CHECKS.map(({ key, label, defaultOn = false }) => {
                const on = !!cfgGet(key, defaultOn);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => cfgSet(key, !on)}
                    className="cg-focus flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors"
                    style={
                      on
                        ? { background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }
                        : { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }
                    }
                  >
                    <span
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2"
                      style={on
                        ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'var(--brand-ink)' }
                        : { borderColor: 'var(--hairline)' }}
                    >
                      {on && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="text-xs font-medium leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* SOP field */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4" style={{ color: 'var(--warn-text)' }} />
              Instrucciones del puesto (SOP)
            </label>
            <Textarea
              placeholder={t("ui.PostSiteWizard.protocoloDeAccesoManejoDe", "Protocolo de acceso, manejo de visitantes, emergencias, comunicación con supervisores…")}
              rows={3}
              value={cfgGet('postInstructions')}
              onChange={(e) => cfgSet('postInstructions', e.target.value)}
            />
          </div>
        </div>
      );
    }

    // ── Step 4: Estaciones + Contacto ──────────────────────────────────────────
    if (step === 4) {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="font-display mb-1 text-xl font-bold">Estaciones de vigilancia</h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              Define los puestos de vigilante. Cada estación tiene su propio horario y número de vigilantes.
            </p>
          </div>

          {/* Station builder */}
          <div className="space-y-3">
            {stations.length === 0 ? (
              <EmptyState
                icon={<Shield />}
                title="Sin estaciones definidas"
                description="Puedes añadirlas ahora o desde el perfil del sitio."
              />
            ) : (
              stations.map((s, i) => (
                <StationRow
                  key={i}
                  draft={s}
                  onChange={(d) => updateStation(i, d)}
                  onRemove={() => removeStation(i)}
                />
              ))
            )}
            <button
              type="button"
              onClick={addStationDraft}
              className="cg-focus flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 text-sm font-medium transition-colors"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}
            >
              <Plus className="h-4 w-4" />
              Añadir estación
            </button>
          </div>

          {/* Status */}
          <Section title="Estado del sitio">
            <div className="flex max-w-xs gap-2">
              {(['active', 'inactive'] as const).map((s) => {
                const sel = status === s;
                const fill = s === 'active' ? 'var(--ok)' : 'var(--ink-faint)';
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => setStatus(s)}
                    className="cg-focus h-9 flex-1 rounded-md border text-sm font-medium transition-colors"
                    style={
                      sel
                        ? {
                            background: `color-mix(in oklab, ${fill} 14%, transparent)`,
                            borderColor: `color-mix(in oklab, ${fill} 34%, transparent)`,
                            color: s === 'active' ? 'var(--ok-text)' : 'var(--ink-soft)',
                          }
                        : { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-faint)' }
                    }
                  >
                    {s === 'active' ? 'Activo' : 'Inactivo'}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>
      );
    }

    // ── Step 5: Review & Create ────────────────────────────────────────────────
    if (step === 5) {
      const typeDef = serviceType ? getServiceType(serviceType) : null;
      const allEquip = [...equipment, ...customEquipment];
      const allTraining = [...training, ...customTraining];

      const SummaryRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) =>
        value ? (
          <div className="flex items-start gap-3 border-b py-2 last:border-0" style={{ borderColor: 'var(--hairline)' }}>
            <span className="mt-0.5 shrink-0" style={{ color: 'var(--brand-text)' }}>{icon}</span>
            <span className="w-28 shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>{label}</span>
            <span className="text-sm font-medium">{value}</span>
          </div>
        ) : null;

      return (
        <div className="space-y-5">
          <div>
            <h2 className="font-display mb-1 text-xl font-bold">Revisar y crear</h2>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t("ui.PostSiteWizard.compruebaLaInformacionAntesDe", "Comprueba la información antes de crear el puesto de vigilancia.")}</p>
          </div>

          {/* Summary card */}
          <div className="glass overflow-hidden">
            {typeDef && (
              <div
                className="flex items-center gap-3 border-b px-5 py-3"
                style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)' }}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full border"
                  style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }}
                >
                  {React.createElement(SERVICE_ICONS[typeDef.icon] ?? Shield, { className: 'h-4 w-4' })}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--brand-text)' }}>{typeDef.label}</span>
              </div>
            )}
            <div className="px-5 py-4 space-y-0">
              <SummaryRow icon={<Building2 className="h-4 w-4" />} label="Cliente" value={selectedClientLabel ?? undefined} />
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label={t("ui.PostSiteWizard.direccion", "Dirección")} value={address || undefined} />
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Ciudad" value={city || undefined} />
              <SummaryRow icon={<Shield className="h-4 w-4" />} label="Estaciones" value={stations.filter(s => s.name.trim()).length > 0 ? `${stations.filter(s => s.name.trim()).length} definida${stations.filter(s => s.name.trim()).length !== 1 ? 's' : ''}` : undefined} />
            </div>
          </div>

          {/* Equipment & training chips */}
          {(allEquip.length > 0 || allTraining.length > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {allEquip.length > 0 && (
                <Section title="Equipamiento" icon={<Zap />}>
                  <div className="flex flex-wrap gap-1.5">
                    {allEquip.map((e) => {
                      const opt = equipmentOptions.find((o) => o.value === e);
                      return (
                        <span
                          key={e}
                          className="rounded-full border px-2 py-0.5 text-[11px]"
                          style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }}
                        >
                          {opt?.label ?? e}
                        </span>
                      );
                    })}
                  </div>
                </Section>
              )}
              {allTraining.length > 0 && (
                <Section title={t("ui.PostSiteWizard.capacitacion", "Capacitación")} icon={<Star />}>
                  <div className="flex flex-wrap gap-1.5">
                    {allTraining.map((t) => {
                      const opt = trainingOptions.find((o) => o.value === t);
                      return (
                        <span
                          key={t}
                          className="rounded-full border px-2 py-0.5 text-[11px]"
                          style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }}
                        >
                          {opt?.label ?? t}
                        </span>
                      );
                    })}
                  </div>
                </Section>
              )}
            </div>
          )}

          {/* Stations summary */}
          {stations.filter((s) => s.name.trim()).length > 0 && (
            <div className="glass overflow-hidden">
              <div className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: 'var(--hairline)' }}>
                <Shield className="h-4 w-4" style={{ color: 'var(--brand-text)' }} />
                <span className="text-sm font-semibold">
                  Estaciones ({stations.filter((s) => s.name.trim()).length})
                </span>
              </div>
              <div>
                {stations.filter((s) => s.name.trim()).map((s, i) => (
                  <div key={i} className="border-b px-5 py-3 last:border-0" style={{ borderColor: 'var(--hairline)' }}>
                    <p className="text-sm font-medium">{s.name}</p>
                    {s.description && <p className="mb-1 text-xs" style={{ color: 'var(--ink-soft)' }}>{s.description}</p>}
                    {s.jornadas.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {s.jornadas.map((j) => (
                          <span
                            key={j.id}
                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                            style={jornadaChip(j.tipo)}
                          >
                            {j.nombre}
                            {j.startTime && j.endTime && <span className="ml-1 font-mono opacity-70">{j.startTime}–{j.endTime}</span>}
                            <span className="ml-1 flex items-center gap-0.5 opacity-70"><Users className="h-2.5 w-2.5" />{j.guardsCount||'1'}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs" style={{ color: 'var(--ink-faint)' }}>Sin jornadas definidas</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // ── nav ────────────────────────────────────────────────────────────────────
  const isLastMainStep = step === 5;
  const isStationStep = step === 6;
  const TOTAL_MAIN_STEPS = isEdit ? 4 : 5; // edit skips step 1

  return (
    <div className="max-w-2xl mx-auto">
      {loadingEdit ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--brand-text)' }} />
        </div>
      ) : (
        <>
        {/* Progress bar (only on main steps) */}
        {!isStationStep && (
          <div className="mb-8">
            <StepBar current={isEdit ? step - 1 : step} total={TOTAL_MAIN_STEPS} />
          </div>
        )}

      {/* Content */}
      <div className="min-h-[420px]">
        {renderStep()}
      </div>

      {/* Navigation footer (not shown on station step — has own buttons) */}
      {!isStationStep && (
        <div className="mt-8 flex items-center justify-between border-t pt-5" style={{ borderColor: 'var(--hairline)' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              // Cancelar devuelve al sitio de donde se vino: la ficha del
              // cliente si se entró desde ahí, si no la lista.
              if (step <= (isEdit ? 2 : 1)) {
                navigate(isEdit
                  ? `/post-sites/${id}`
                  : clientLocked ? `/clients/${presetClientId}/post-sites` : '/post-sites');
              } else setStep((s) => s - 1);
            }}
            className="gap-1.5 text-foreground/70"
          >
            <ChevronLeft className="h-4 w-4" />
            {step <= (isEdit ? 2 : 1) ? 'Cancelar' : 'Atrás'}
          </Button>

          {isLastMainStep ? (
            <Button
              type="button"
              variant="brand"
              onClick={handleCreateSite}
              disabled={submitting || !address.trim()}
              className="gap-2 min-w-36"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {isEdit ? 'Guardando…' : 'Creando…'}</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> {isEdit ? 'Guardar cambios' : 'Crear Sitio'}</>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="brand"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canGoNext()}
              className="gap-1.5"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
