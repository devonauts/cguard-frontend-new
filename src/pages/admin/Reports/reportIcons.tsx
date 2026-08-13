import {
  FileText, AlertTriangle, ClipboardList, Clock, DollarSign, ScrollText,
  LogIn, Route, CheckSquare, Activity, Car, ListChecks, BarChart3, Gauge,
  Siren, MapPin, TriangleAlert, IdCard, Package, Video, PauseCircle, FileCheck,
  ShieldAlert, Flame, Footprints, Eye, Building2, Users, Wrench, Boxes,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Tono de cada familia de informes.
 *
 * Antes cada sección tenía su propio color de Tailwind (cielo, violeta, teal…):
 * seis colores fijos que se peleaban entre sí y con el acento que elija la
 * empresa. Ahora sólo hay dos papeles posibles, y ninguno es decorativo:
 *   · `brand`  → la familia de informes, marcada con el acento del sistema.
 *   · `bad`    → incidentes, que SÍ son severidad y por eso van en rojo fijo.
 * El resto de la distinción la hace el icono, no el color.
 */
export type ReportTone = 'brand' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info';

export const SECTION_THEME: Record<string, { icon: LucideIcon; tone: ReportTone }> = {
  general:  { icon: FileText,      tone: 'brand' },
  incidents:{ icon: AlertTriangle, tone: 'bad' },
  standard: { icon: ClipboardList, tone: 'brand' },
  timecard: { icon: Clock,         tone: 'brand' },
  payroll:  { icon: DollarSign,    tone: 'brand' },
  logs:     { icon: ScrollText,    tone: 'brand' },
};

/**
 * Informes que hablan de un PELIGRO real (pánico, fuego, robo, caída…). Sólo
 * éstos se pintan en `--bad`: la severidad no es decoración, y si todo fuera
 * rojo el rojo dejaría de significar nada.
 */
const DANGER_ID = /panic|pánico|panico|fire|incendio|break-in|robo|vandalism|trespass|police|fall|caída|caida|suspicious|incident/;

const ID_ICON: Array<[RegExp, LucideIcon]> = [
  [/entry-exit|check.?in|check.?out/, LogIn],
  [/site-tour|tour|checkpoint|recorrido/, Route],
  [/task|tarea/, CheckSquare],
  [/dar/, Activity],
  [/vehicle-patrol|patrol/, Car],
  [/vehicle-inspection/, Car],
  [/checklist|verificaci/, ListChecks],
  [/post-kpi/, Gauge],
  [/guard-kpi|kpi/, BarChart3],
  [/parking/, Car],
  [/break-in/, ShieldAlert],
  [/fire/, Flame],
  [/vandalism|trespass/, TriangleAlert],
  [/suspicious/, Eye],
  [/police/, Siren],
  [/incident/, AlertTriangle],
  [/hourly/, Clock],
  [/equipment/, Wrench],
  [/timecard-client|payroll-client/, Building2],
  [/timecard-post|payroll-post/, MapPin],
  [/timecard-guard/, Users],
  [/skillset/, Boxes],
  [/department/, Users],
  [/delivery|passdown|entrega/, Package],
  [/watch-mode|vigilancia/, Video],
  [/idle|inactiv/, PauseCircle],
  [/panic|pánico|panico/, Siren],
  [/geofence|geo-fence|valla/, MapPin],
  [/fall|caída|caida/, TriangleAlert],
  [/order-ack|órdenes/, FileCheck],
  [/document-ack|doc-policy/, FileCheck],
  [/license|licencia/, IdCard],
  [/idle-guard|guard-idle/, Footprints],
];

export function iconForReport(id: string, sectionId: string): LucideIcon {
  for (const [re, icon] of ID_ICON) if (re.test(id)) return icon;
  return SECTION_THEME[sectionId]?.icon || FileText;
}

/** Tono de la ficha de un informe: rojo sólo si el informe trata un peligro. */
export function toneForReport(id: string, sectionId: string): ReportTone {
  if (DANGER_ID.test(id) || sectionId === 'incidents') return 'bad';
  return 'neutral';
}
