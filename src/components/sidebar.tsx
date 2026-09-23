/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — BARRA LATERAL DE CRISTAL
 *
 * UN SOLO MENÚ. Un panel de cristal con los seis grupos visibles a la vez:
 * cabecera del tenant, buscador, y debajo la lista completa de destinos con un
 * encabezado diminuto por grupo (RESUMEN, OPERACIÓN, PERSONAL, CLIENTES,
 * ANÁLISIS, SISTEMA). Se desplaza, como cualquier menú de CRM con 20 destinos.
 *
 * La versión anterior partía esto en dos superficies —un riel de secciones de
 * 64 px y un panel que sólo mostraba la sección elegida— y se leía como DOS
 * barras pegadas. Peor: obligaba a un clic de más (elegir sección) antes de ver
 * a dónde podías ir, y con grupos de 2 destinos el panel salía casi vacío.
 * Un menú tiene que enseñar sus destinos, no esconderlos detrás de un
 * conmutador. Los grupos siguen existiendo, pero como ENCABEZADOS de una sola
 * lista, no como pestañas excluyentes.
 *
 * COLAPSADO no es «oculto» ni un riel de secciones: es la MISMA lista en
 * columna de iconos, todos los destinos, con el nombre en el tooltip. Lo
 * desplegable abre su submenú flotando al lado. Sigue siendo navegable entero.
 *
 * ── COLOR ──────────────────────────────────────────────────────────────────
 * Ni un color escrito a mano. Todo sale de las variables de tokens.css, así que
 * esto se ve correcto en claro, en oscuro y con el acento que el usuario elija.
 * Las clases `cgsb-*` se inyectan aquí abajo (y no en glass.css) porque son
 * privadas de este componente.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Shield,
  ChevronRight,
  Gauge,
  Activity,
  Users,
  BarChart3,
  MapPin,
  MessageSquare,
  Clock,
  FileText,
  Calendar,
  DollarSign,
  Receipt,
  Car,
  UserPlus,
  SquareParking,
  UserCog,
  Building2,
  Briefcase,
  Package,
  Cctv,
  Siren,
  Radio,
  GraduationCap,
  Star,
  Search,
  X,
  Sun,
  Moon,
  LayoutGrid,
  ClipboardSignature,
  Puzzle,
  type LucideIcon,
} from "lucide-react";

import sidebarMenuData from "../data/sidebar-menu.json";

import { useAuth } from "@/contexts/AuthContext";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useMessagesUnread } from "@/hooks/useMessagesUnread";
import { useTiendaDeModulos } from "@/hooks/useTiendaDeModulos";
import tenantService from "@/services/tenant.service";
import {
  getStoredTenantBranding,
  getCachedTenantBranding,
  setTenantBranding,
} from "@/lib/tenantBranding";

type SubMenuItem = { id: string; name: string; path: string };
type MenuItem = {
  id: string;
  name: string;
  icon: LucideIcon;
  path?: string;
  active?: boolean;
  expandable?: boolean;
  subItems?: SubMenuItem[];
  // optional allowedRoles controls visibility for global roles (e.g. ['superadmin'])
  allowedRoles?: string[];
  /** «Módulos adicionales»: sólo si la empresa tiene tienda (ver useTiendaDeModulos). */
  tienda?: boolean;
};

// Mapa de nombres de iconos a componentes de iconos
const iconMap: Record<string, LucideIcon> = {
  Shield,
  Gauge,
  Activity,
  Users,
  BarChart3,
  MapPin,
  MessageSquare,
  Clock,
  FileText,
  Calendar,
  DollarSign,
  Receipt,
  Car,
  UserPlus,
  SquareParking,
  UserCog,
  Building2,
  Briefcase,
  Package,
  Cctv,
  Siren,
  Radio,
  GraduationCap,
  Star,
  ClipboardSignature,
  Puzzle,
};

/* ── GRUPOS DEL MENÚ ──────────────────────────────────────────────────────────
   Sólo AGRUPAN los ids que ya vivían en sidebar-menu.json, y se pintan como
   encabezados de una única lista. Un id nuevo en el JSON que no aparezca aquí
   NO se pierde: cae en el grupo «Otros». */
type GroupDef = { id: string; label: string; icon: LucideIcon; ids: string[] };
const GROUPS: GroupDef[] = [
  // «emergencias» va TERCERO, justo debajo de Actividad: es la consola que se
  // abre cuando suena un pánico, y en ese momento nadie va a bajar a buscarla.
  // OJO: esta lista es la que MANDA. Añadir un destino en `sidebar-menu.json`
  // sin añadir su id aquí lo deja caer al grupo «Otros» del fondo — que es
  // exactamente lo que le pasó a esta entrada al moverla.
  {
    id: "resumen",
    label: "Resumen",
    icon: Gauge,
    // «pases-de-turno» va pegado a Estaciones: el pase es el registro del
    // puesto en cada cambio de turno, no una tarea (antes colgaba de Tareas).
    ids: ["panel", "actividad", "emergencias", "estaciones", "pases-de-turno"],
  },
  {
    id: "operacion",
    label: "Operación",
    icon: Siren,
    ids: [
      "despachador",
      "monitoreo-alarmas",
      "videovigilancia",
      "patrulla",
      "radio",
      "inventario",
    ],
  },
  {
    id: "personal",
    label: "Personal",
    icon: Users,
    ids: ["equipo", "programador", "nomina", "tareas", "entrenamiento"],
  },
  {
    id: "clientes",
    label: "Clientes",
    icon: Briefcase,
    ids: [
      "clientes",
      "solicitudes-clientes",
      "control-de-calidad",
      "mensajeria",
    ],
  },
  {
    id: "analisis",
    label: "Análisis",
    icon: BarChart3,
    ids: ["analiticas", "informes"],
  },
  {
    id: "sistema",
    label: "Sistema",
    icon: UserCog,
    /* «superadmin» salió del menú: apuntaba a `/superadmin/tenants`, que vive
       en OTRA app. Quien lo pulsaba —cualquiera cuyo rol normalice a «admin»,
       no sólo un superadmin de plataforma— caía en el 404 de este CRM. */
    ids: ["seguridad-auditoria", "modulos-adicionales"],
  },
];

/* ── ESTILOS PRIVADOS ─────────────────────────────────────────────────────── */
/* Van en una hoja inyectada y no en clases utilitarias porque necesitan
   pseudo-elementos (el filo de acento, la guía de los subitems) y estados
   :hover/:focus-within, que `style={{}}` no puede expresar. */
const CGSB_CSS = `
/* ════════════════════════════════════════════════════════════════════════════
   MENÚ LATERAL — INSTRUMENTO, NO LISTA
   Lo que hacía que no se leyera futurista no era falta de brillo: era falta de
   ESTRUCTURA. Una columna de texto gris sobre fondo oscuro es un panel de
   administración con otros colores.

   Cuatro cosas lo cambian, y ninguna es decorativa:
     · PROFUNDIDAD — cada icono va en su propia placa hundida. Da dos planos
       donde antes había uno, y es lo que separa un tablero de una lista.
     · SEÑAL — el elemento activo se ilumina desde un canto, no se rellena. La
       luz dice «estás aquí» sin tapar el texto.
     · PRECISIÓN — micro-etiquetas en mayúsculas con hilo que llega al borde,
       cifras tabulares. Lee a consola.
     · RESPUESTA — todo lo pulsable reacciona antes de pulsarse.
   ════════════════════════════════════════════════════════════════════════════ */
.cgsb-root { display: flex; flex-direction: column; height: 100%; width: 100%; overflow: visible; }

.cgsb-panel {
  position: relative;
  display: flex; flex-direction: column; height: 100%; min-height: 0; width: 100%;
}
/* Filo de luz en el canto derecho: el panel deja de ser un rectángulo y pasa a
   tener un borde biselado. Se desvanece arriba y abajo. */
.cgsb-panel::after {
  content: ""; position: absolute; top: 0; bottom: 0; right: 0; width: 1px; pointer-events: none;
  background: linear-gradient(180deg, transparent, var(--hairline-lit) 14%, var(--hairline-lit) 62%, transparent);
  opacity: .75;
}

/* ── CABECERA ─────────────────────────────────────────────────────────────── */
.cgsb-head { position: relative; flex: 0 0 auto; padding: 14px 12px 12px; }
.cgsb-head::after {
  content: ""; position: absolute; left: 12px; right: 12px; bottom: 0; height: 1px;
  background: linear-gradient(90deg, var(--hairline), transparent 88%);
}

.cgsb-brand {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 6px 6px 10px; border-radius: var(--r-md);
  transition: background-color .2s var(--ease);
}
.cgsb-brand:hover { background: var(--glass-sunken); }

/* La placa de marca lleva el acento en el canto y un halo: es el único punto de
   la columna que puede permitirse gritar. */
.cgsb-logo {
  position: relative; flex: 0 0 auto;
  width: 34px; height: 34px; border-radius: 11px;
  display: grid; place-items: center; overflow: hidden;
  background: var(--brand-wash);
  border: 1px solid var(--brand-line);
  box-shadow: 0 0 18px -6px var(--brand-glow), inset 0 1px 0 0 var(--hairline-lit);
  color: var(--brand-text); font-weight: 700; font-size: 12px; letter-spacing: .02em;
}
.cgsb-logo img { width: 100%; height: 100%; object-fit: contain; padding: 3px; }

/* ── BUSCADOR ─────────────────────────────────────────────────────────────── */
.cgsb-search {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 10px; border-radius: var(--r-md);
  background: var(--glass-sunken);
  border: 1px solid var(--hairline);
  box-shadow: inset 0 1px 2px oklch(0 0 0 / .10);
  transition: border-color .2s var(--ease), box-shadow .2s var(--ease), background-color .2s var(--ease);
}
.cgsb-search:focus-within {
  border-color: var(--brand);
  background: var(--glass-raised);
  box-shadow: 0 0 0 3px var(--brand-glow), inset 0 1px 2px oklch(0 0 0 / .10);
}
.cgsb-search input {
  flex: 1 1 auto; min-width: 0; background: transparent; border: 0; outline: 0;
  font-size: 12.5px; color: var(--ink);
}
.cgsb-search input::placeholder { color: var(--ink-faint); }

/* ── DESPLAZAMIENTO ───────────────────────────────────────────────────────── */
.cgsb-scroll {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: 12px 10px 8px;
  /* El contenido se desvanece contra los bordes en vez de cortarse en seco. */
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 14px, #000 calc(100% - 18px), transparent);
          mask-image: linear-gradient(180deg, transparent, #000 14px, #000 calc(100% - 18px), transparent);
}
.cgsb-scroll::-webkit-scrollbar { width: 8px; }
.cgsb-scroll::-webkit-scrollbar-track { background: transparent; }
.cgsb-scroll::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 9999px; border: 2px solid transparent; background-clip: content-box; }
.cgsb-scroll:hover::-webkit-scrollbar-thumb { background: var(--ink-faint); background-clip: content-box; }

/* ── ETIQUETA DE GRUPO ────────────────────────────────────────────────────── */
/* Micro-etiqueta + hilo hasta el borde. El hilo es lo que la convierte en un
   separador de sistema en vez de texto suelto flotando. */
.cg-eyebrow.cgsb-group-label {
  display: flex; align-items: center; gap: 8px;
  margin: 0 0 6px; padding: 0 6px;
  font-size: 9.5px; letter-spacing: .14em; color: var(--ink-faint);
}
.cg-eyebrow.cgsb-group-label::after {
  content: ""; flex: 1 1 auto; height: 1px;
  background: linear-gradient(90deg, var(--hairline), transparent);
}
.cgsb-group + .cgsb-group { margin-top: 16px; }

/* ── ELEMENTO ─────────────────────────────────────────────────────────────── */
.cgsb-item {
  position: relative;
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 7px 9px; margin-bottom: 1px; border-radius: var(--r-md);
  font-size: 12.5px; font-weight: 500; color: var(--ink-soft);
  transition: color .18s var(--ease), background-color .18s var(--ease), transform .18s var(--ease);
}
/* El carril de acento vive SIEMPRE, a opacidad 0. Animar la opacidad de algo
   que ya existe es barato; crearlo en hover provoca un salto de composición. */
.cgsb-item::before {
  content: ""; position: absolute; left: 2px; top: 50%;
  width: 3px; height: 16px; border-radius: 9999px;
  transform: translateY(-50%) scaleY(.35);
  background: var(--brand); opacity: 0;
  box-shadow: 0 0 10px 0 var(--brand-glow);
  transition: opacity .2s var(--ease), transform .2s var(--ease);
}
.cgsb-item:hover { color: var(--ink); background: var(--glass-sunken); }
.cgsb-item:hover::before { opacity: .45; transform: translateY(-50%) scaleY(.7); }
.cgsb-item:hover .cgsb-item-icon { color: var(--ink); border-color: var(--hairline-lit); transform: translateY(-1px); }

.cgsb-item.is-active {
  color: var(--brand-text); font-weight: 600;
  background: linear-gradient(90deg, var(--brand-wash), transparent 78%);
}
.cgsb-item.is-active::before { opacity: 1; transform: translateY(-50%) scaleY(1); }
.cgsb-item.is-active .cgsb-item-icon {
  color: var(--brand-ink); background: var(--brand);
  border-color: transparent;
  box-shadow: 0 0 14px -3px var(--brand-glow);
}
.cgsb-item.is-disabled { opacity: .34; cursor: not-allowed; }
.cgsb-item.is-disabled:hover { background: transparent; color: var(--ink-soft); }
.cgsb-item.is-disabled:hover::before { opacity: 0; }

/* La PLACA del icono — el segundo plano que le faltaba a la columna. */
.cgsb-item-icon {
  flex: 0 0 auto; display: grid; place-items: center;
  width: 24px; height: 24px; border-radius: 7px;
  background: var(--glass-sunken);
  border: 1px solid var(--hairline);
  color: var(--ink-faint);
  transition: color .18s var(--ease), background-color .18s var(--ease),
              border-color .18s var(--ease), box-shadow .18s var(--ease), transform .18s var(--ease);
}
.cgsb-item-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }

/* ── AVISO DE MENSAJES SIN LEER ───────────────────────────────────────────── */
/* Cuenta en el menú abierto, punto a secas en el colapsado: ahí no hay sitio
   para un número legible y lo que importa es «hay algo». */
.cgsb-count {
  flex: 0 0 auto; min-width: 18px; height: 18px; padding: 0 5px;
  display: inline-grid; place-items: center;
  border-radius: 9999px;
  background: var(--brand); color: var(--brand-ink);
  font-size: 10.5px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums;
}
.cgsb-orb-dot {
  position: absolute; top: 6px; right: 6px;
  width: 8px; height: 8px; border-radius: 9999px;
  background: var(--brand);
  box-shadow: 0 0 0 2px var(--glass-solid);
}

/* ── SUBELEMENTOS ─────────────────────────────────────────────────────────── */
/* La guía vertical se enciende con el acento cuando el grupo tiene un hijo
   activo: dice a qué rama perteneces sin repetir el nombre del padre. */
.cgsb-subs { position: relative; margin: 2px 0 6px 22px; padding-left: 13px; }
.cgsb-subs::before {
  content: ""; position: absolute; left: 0; top: 2px; bottom: 6px; width: 1px;
  background: linear-gradient(180deg, var(--hairline), transparent);
}
.cgsb-subs:has(.is-active)::before {
  background: linear-gradient(180deg, var(--brand-line), transparent);
  box-shadow: 0 0 8px 0 var(--brand-glow);
}
.cgsb-sub {
  position: relative; display: block; width: 100%; text-align: left;
  padding: 5px 9px; margin-bottom: 1px; border-radius: var(--r-sm);
  font-size: 12px; color: var(--ink-faint);
  transition: color .16s var(--ease), background-color .16s var(--ease), transform .16s var(--ease);
}
/* Muesca de conexión: une el subelemento con la guía. */
.cgsb-sub::before {
  content: ""; position: absolute; left: -13px; top: 50%; width: 8px; height: 1px;
  background: var(--hairline); transition: background-color .16s var(--ease);
}
.cgsb-sub:hover { color: var(--ink); background: var(--glass-sunken); transform: translateX(2px); }
.cgsb-sub.is-active { color: var(--brand-text); font-weight: 600; background: var(--brand-wash); }
.cgsb-sub.is-active::before { background: var(--brand); box-shadow: 0 0 6px 0 var(--brand-glow); }

/* ── PIE ──────────────────────────────────────────────────────────────────── */
.cgsb-foot { position: relative; flex: 0 0 auto; padding: 10px 12px 12px; }
.cgsb-foot::before {
  content: ""; position: absolute; left: 12px; right: 12px; top: 0; height: 1px;
  background: linear-gradient(90deg, var(--hairline), transparent 88%);
}
.cgsb-user {
  display: flex; align-items: center; gap: 9px; padding: 7px 8px;
  border-radius: var(--r-md);
  background: var(--glass-sunken);
  border: 1px solid var(--hairline);
  box-shadow: inset 0 1px 0 0 var(--hairline-lit);
  transition: border-color .2s var(--ease), box-shadow .2s var(--ease);
}
.cgsb-user:hover { border-color: var(--brand-line); box-shadow: inset 0 1px 0 0 var(--hairline-lit), 0 0 18px -8px var(--brand-glow); }
.cgsb-user-link { display: flex; align-items: center; gap: 9px; flex: 1 1 auto; min-width: 0; border-radius: var(--r-sm); }
.cgsb-avatar {
  position: relative; flex: 0 0 auto;
  width: 28px; height: 28px; border-radius: 9px; overflow: hidden;
  display: grid; place-items: center;
  background: var(--brand-wash); border: 1px solid var(--brand-line);
  color: var(--brand-text); font-size: 11px; font-weight: 700;
}
.cgsb-avatar img { width: 100%; height: 100%; object-fit: cover; }

/* ── COLAPSADO: RIEL DE ORBES ─────────────────────────────────────────────── */
.cgsb-rail { display: flex; flex-direction: column; align-items: center; height: 100%; padding: 12px 0; gap: 8px; }
.cgsb-rail-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; }
.cgsb-rail-list::-webkit-scrollbar { width: 0; height: 0; }
.cgsb-orb {
  position: relative; display: grid; place-items: center;
  width: 38px; height: 38px; border-radius: 12px;
  background: var(--glass-sunken); border: 1px solid var(--hairline);
  color: var(--ink-soft);
  box-shadow: inset 0 1px 0 0 var(--hairline-lit);
  transition: color .18s var(--ease), background-color .18s var(--ease),
              border-color .18s var(--ease), box-shadow .18s var(--ease), transform .18s var(--ease);
}
.cgsb-orb:hover { color: var(--ink); border-color: var(--brand-line); transform: translateY(-2px); box-shadow: inset 0 1px 0 0 var(--hairline-lit), 0 6px 18px -8px var(--brand-glow); }
.cgsb-orb:active { transform: translateY(0); transition-duration: .08s; }
.cgsb-orb.is-on {
  color: var(--brand-ink); background: var(--brand); border-color: transparent;
  box-shadow: 0 0 20px -4px var(--brand-glow);
}
/* Marca en el canto del riel, alineada con la orbe activa. */
.cgsb-orb.is-on::after {
  content: ""; position: absolute; left: -9px; top: 50%; transform: translateY(-50%);
  width: 3px; height: 18px; border-radius: 9999px;
  background: var(--brand); box-shadow: 0 0 10px 0 var(--brand-glow);
}
.cgsb-orb-brand { background: var(--brand-wash); border-color: var(--brand-line); color: var(--brand-text); }
.cgsb-orb-brand:hover { color: var(--brand-ink); background: var(--brand); border-color: transparent; }
.cgsb-orb-avatar { padding: 0; overflow: hidden; }
.cgsb-orb-avatar img { width: 100%; height: 100%; object-fit: cover; }

.cgsb-sep { width: 22px; height: 1px; background: var(--hairline); margin: 2px 0; flex: 0 0 auto; }
/* El botón de tema del bloque de usuario. Sin caja propia se quedaba en 16 px
   de ancho —el del icono— dentro de un flex: un objetivo táctil de 16×44
   medido en el navegador, presente en TODAS las pantallas porque el bloque de
   usuario vive en el cajón lateral. Se le da caja cuadrada de 36 px, que es
   el mínimo cómodo, sin tocar su aspecto (sigue sin fondo ni borde). */
.cgsb-ghost {
  background: transparent; border-color: transparent;
  display: grid; place-items: center;
  width: 36px; height: 36px; flex: 0 0 36px;
  border-radius: 9999px;
}

/* ── PANEL FLOTANTE (colapsado) ───────────────────────────────────────────── */
.cgsb-flyout {
  position: fixed; z-index: 60; min-width: 210px; max-width: 260px; padding: 8px;
  border-radius: var(--r-lg);
  background: color-mix(in oklab, var(--glass-solid) 96%, transparent);
  backdrop-filter: blur(calc(var(--blur) * 1.4)) saturate(200%);
  -webkit-backdrop-filter: blur(calc(var(--blur) * 1.4)) saturate(200%);
  border: 1px solid var(--hairline);
  box-shadow: var(--lift-4), inset 0 1px 0 0 var(--hairline-lit);
  animation: cgsb-fly .16s var(--ease) both;
}
@keyframes cgsb-fly { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .cgsb-item, .cgsb-item::before, .cgsb-item-icon, .cgsb-sub, .cgsb-orb, .cgsb-user { transition: none; }
  .cgsb-item:hover, .cgsb-sub:hover, .cgsb-orb:hover { transform: none; }
  .cgsb-flyout { animation: none; }
}
`;

function ensureCgsbStyles() {
  if (typeof document === "undefined") return;
  // Se REESCRIBE si ya existe en vez de salirse: en desarrollo el módulo se
  // reevalúa con cada guardado, y saltarse la actualización dejaría la hoja
  // vieja pegada hasta recargar la página entera.
  const el =
    document.getElementById("cgsb-styles") || document.createElement("style");

  if (el.textContent !== CGSB_CSS) el.textContent = CGSB_CSS;
  if (!el.isConnected) {
    el.id = "cgsb-styles";
    document.head.appendChild(el);
  }
}
ensureCgsbStyles();

/* ── Utilidades ───────────────────────────────────────────────────────────── */
const fold = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function displayName(user: any) {
  const first = user?.firstName?.trim();
  const last = user?.lastName?.trim();

  if (first || last) return [first, last].filter(Boolean).join(" ");
  const email = user?.email || "";

  return email.split("@")[0] || "Usuario";
}
function initials(text: string) {
  const parts = (text || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type SidebarProps = {
  /** Columna de iconos con todos los destinos. Los desplegables abren al lado. */
  collapsed?: boolean;
  /** Se llama al navegar — el contenedor móvil lo usa para cerrarse. */
  onNavigate?: () => void;
};

/** Un grupo ya resuelto y listo para pintar. `forcedSubs` lo usa el buscador
 *  para mostrar sólo los subitems que coinciden. */
type RenderGroup = {
  id: string;
  label: string;
  entries: Array<{ item: MenuItem; forcedSubs?: SubMenuItem[] }>;
};

export default function Sidebar({
  collapsed = false,
  onNavigate,
}: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useThemeContext();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const dur = reduceMotion ? 0 : 0.22;

  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(
    {},
  );
  const [query, setQuery] = useState("");
  /** Submenú flotante del modo colapsado: qué destino y a qué altura. */
  const [flyout, setFlyout] = useState<{ id: string; top: number } | null>(
    null,
  );
  const rootRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const toggleMenu = (menu: string) =>
    setExpandedMenus((prev) => ({ ...prev, [menu]: !prev[menu] }));

  // Tenant branding — seeded synchronously from the stored cache so it renders
  // instantly (no "CG / CGuard" placeholder flash) when AppLayout re-mounts on
  // navigation. We only hit the API once per tenant per session.
  const [tenantName, setTenantName] = useState<string>(
    () => getStoredTenantBranding().name,
  );
  const [tenantLogo, setTenantLogo] = useState<string | null>(
    () => getStoredTenantBranding().logo,
  );

  useEffect(() => {
    const tenantId =
      typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;

    if (!tenantId) return;

    // Already resolved this tenant this session -> use the cache, do NOT refetch.
    const cached = getCachedTenantBranding(tenantId);

    if (cached) {
      setTenantName(cached.name);
      setTenantLogo(cached.logo);

      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res: any = await tenantService.findById(tenantId);

        if (cancelled) return;
        const t =
          res && (res.data || res.tenant) ? res.data || res.tenant : res;
        const name = t?.name || "";
        const logoUrl =
          t?.logoUrl ||
          (Array.isArray(t?.settings)
            ? t.settings[0]?.logoUrl
            : t?.settings?.logoUrl || t?.settings?.logos?.[0]?.publicUrl) ||
          t?.logo?.downloadUrl ||
          null;

        if (name) setTenantName(name);
        setTenantLogo(logoUrl);
        // Persist to the memory + localStorage cache so subsequent re-mounts
        // render synchronously and skip the fetch.
        setTenantBranding({ tenantId, name, logo: logoUrl });
      } catch {
        // silently ignore — fall back to cached/initials
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Convertir los datos JSON a objetos MenuItem con los componentes de iconos correctos
  const menuItems: MenuItem[] = useMemo(
    () =>
      sidebarMenuData.map((item) => ({
        ...item,
        icon: iconMap[item.icon as string] || UserCog,
      })),
    [],
  );

  const tenantIdFromStorage =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const hasTenant = Boolean(
    tenantIdFromStorage ||
      (user &&
        (user.tenant ||
          (Array.isArray(user.tenants) && user.tenants.length > 0))),
  );

  // Determine whether the current user has a global admin role (not tenant-scoped)
  const isGlobalAdmin = useMemo(() => {
    if (!user) return false;
    const raw = user.roles ?? user.role ?? [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const normalized = arr
      .map((r: any) =>
        typeof r === "string"
          ? r.toLowerCase()
          : r && (r.name || r.role)
            ? String(r.name || r.role).toLowerCase()
            : "",
      )
      .filter(Boolean);

    return (
      normalized.includes("admin") ||
      normalized.includes("superadmin") ||
      normalized.includes("super admin")
    );
  }, [user]);

  // «Módulos adicionales» sólo aparece si esta empresa tiene tienda: algo a la
  // venta y la implementación pagada, o algo ya suyo. Ver `tiendaVisible`.
  const { visible: hayTienda } = useTiendaDeModulos();

  // Visibilidad por rol — misma regla que antes, sin cambios de permisos.
  const visibleItems = useMemo(
    () =>
      menuItems.filter((item) => {
        if ((item as any).disabled) return false;
        if (item.tienda && !hayTienda) return false;
        if (!item.allowedRoles || item.allowedRoles.length === 0) return true;
        if (item.allowedRoles.includes("superadmin")) return isGlobalAdmin;
        const raw = user?.roles ?? user?.role ?? [];
        const arr = Array.isArray(raw) ? raw : [raw];
        const normalized = arr
          .map((r: any) =>
            typeof r === "string"
              ? r.toLowerCase()
              : r && (r.name || r.role)
                ? String(r.name || r.role).toLowerCase()
                : "",
          )
          .filter(Boolean);

        return item.allowedRoles.some((ar: string) =>
          normalized.includes(ar.toLowerCase()),
        );
      }),
    [menuItems, user, isGlobalAdmin, hayTienda],
  );

  // Etiquetas i18n — mismo orden de resolución que la versión anterior.
  const labelOf = (item: MenuItem) =>
    t(`sidebar.${item.id}.label`, { defaultValue: "" }) ||
    t(`sidebar.${item.id}`, { defaultValue: "" }) ||
    item.name;
  const subLabelOf = (item: MenuItem, sub: SubMenuItem) =>
    t(`sidebar.${item.id}.${sub.id}`, { defaultValue: "" }) ||
    t(`sidebar.${sub.id}`, { defaultValue: "" }) ||
    sub.name;

  // Agrupación. Lo que no esté mapeado cae en «Otros»: un id nuevo en el JSON
  // aparece igual, nunca se pierde.
  const groups = useMemo(() => {
    const byId = new Map(visibleItems.map((i) => [i.id, i]));
    const used = new Set<string>();
    const out: Array<GroupDef & { items: MenuItem[] }> = [];

    for (const g of GROUPS) {
      const items = g.ids
        .map((id) => byId.get(id))
        .filter(Boolean) as MenuItem[];

      items.forEach((i) => used.add(i.id));
      if (items.length) out.push({ ...g, items });
    }
    const rest = visibleItems.filter((i) => !used.has(i.id));

    if (rest.length)
      out.push({
        id: "otros",
        label: "Otros",
        icon: LayoutGrid,
        ids: [],
        items: rest,
      });

    return out;
  }, [visibleItems]);

  // Ruta activa: gana la coincidencia MÁS LARGA, así /tasks y /tasks/approvals
  // nunca se encienden a la vez y una página de detalle (/clients/42) sigue
  // marcando su sección.
  const active = useMemo(() => {
    const p = location.pathname;
    let bestItem: string | null = null;
    let bestSub: string | null = null;
    let bestLen = -1;

    for (const it of visibleItems) {
      const candidates: Array<{ path: string; sub: string | null }> = [];

      if (it.path) candidates.push({ path: it.path, sub: null });
      (it.subItems || []).forEach((s) =>
        candidates.push({ path: s.path, sub: s.path }),
      );
      for (const c of candidates) {
        if (p === c.path || p.startsWith(c.path + "/")) {
          if (c.path.length > bestLen) {
            bestLen = c.path.length;
            bestItem = it.id;
            bestSub = c.sub;
          }
        }
      }
    }

    return { itemId: bestItem, subPath: bestSub };
  }, [location.pathname, visibleItems]);

  // Abrir el desplegable que contiene la ruta actual.
  useEffect(() => {
    if (!active.itemId) return;
    const item = visibleItems.find((i) => i.id === active.itemId);

    if (item?.expandable)
      setExpandedMenus((prev) =>
        prev[item.id] ? prev : { ...prev, [item.id]: true },
      );
  }, [active.itemId, visibleItems]);

  // Buscador — atraviesa TODOS los grupos e ignora tildes.
  const q = fold(query.trim());
  const renderGroups: RenderGroup[] = useMemo(() => {
    if (!q) {
      return groups.map((g) => ({
        id: g.id,
        label: g.label,
        entries: g.items.map((item) => ({ item })),
      }));
    }

    return groups
      .map((g) => ({
        id: g.id,
        label: g.label,
        entries: g.items
          .map((item) => {
            const hitItem = fold(labelOf(item)).includes(q);
            const subs = (item.subItems || []).filter((s) =>
              fold(subLabelOf(item, s)).includes(q),
            );

            if (!hitItem && !subs.length) return null;

            // Si coincide el destino entero se enseñan todos sus subitems; si
            // sólo coinciden algunos, se enseñan esos.
            return {
              item,
              forcedSubs: hitItem ? item.subItems || undefined : subs,
            };
          })
          .filter(Boolean) as RenderGroup["entries"],
      }))
      .filter((g) => g.entries.length > 0);
  }, [q, groups, t]);

  const firstResultPath = useMemo(() => {
    const first = renderGroups[0]?.entries[0];

    if (!first) return undefined;

    return (
      first.item.path ??
      first.forcedSubs?.[0]?.path ??
      first.item.subItems?.[0]?.path
    );
  }, [renderGroups]);

  // Cerrar el submenú flotante al pulsar fuera / con Escape / al expandirse.
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setFlyout(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFlyout(null);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [flyout]);

  useEffect(() => {
    if (!collapsed) setFlyout(null);
  }, [collapsed]);
  useEffect(() => {
    setFlyout(null);
  }, [location.pathname]);

  // Con los 20 destinos en una sola columna, el activo puede quedar fuera de
  // vista al entrar. `nearest` no mueve nada si ya se ve.
  useEffect(() => {
    if (collapsed || q) return;
    const el = scrollRef.current?.querySelector(".cgsb-item.is-active");

    (el as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  }, [active.itemId, collapsed, q]);

  const go = (path?: string) => {
    if (!path) return;
    setFlyout(null);
    onNavigate?.();
    navigate(path);
  };

  const userName = displayName(user);
  const userEmail = user?.email ?? "";
  const avatar: string | undefined =
    (user as any)?.avatar || (user as any)?.photoURL || undefined;

  /* Mensajes sin leer del buzón del CRM → punto en «Mensajería». Se refresca
     solo cuando entra un mensaje (la campana lo avisa) o al leer un hilo. */
  const mensajesSinLeer = useMessagesUnread(hasTenant);
  const insigniaDe = (itemId: string) =>
    itemId === "mensajeria" ? mensajesSinLeer : 0;

  /* ── Un destino del menú (hoja o desplegable) ───────────────────────────── */
  const renderItem = (
    item: MenuItem,
    opts?: { forcedSubs?: SubMenuItem[] },
  ) => {
    const isExpandable = !!item.expandable;
    const isDisabled = !hasTenant && item.path !== "/dashboard";
    const isActive = active.itemId === item.id;
    const isOpen = !!expandedMenus[item.id] || !!opts?.forcedSubs;
    const subs = opts?.forcedSubs ?? item.subItems ?? [];
    const label = labelOf(item);

    const sinLeer = insigniaDe(item.id);

    const inner = (
      <>
        <item.icon className="cgsb-item-icon h-4 w-4" />
        <span className="cgsb-item-label">{label}</span>
        {sinLeer > 0 && (
          <span
            aria-label={t("sidebar.unreadMessages", {
              count: sinLeer,
              defaultValue: "{{count}} mensajes sin leer",
            })}
            className="cgsb-count"
          >
            {sinLeer > 99 ? "99+" : sinLeer}
          </span>
        )}
        {isExpandable && (
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 transition-transform duration-200"
            style={{
              opacity: 0.55,
              transform: isOpen ? "rotate(90deg)" : "none",
            }}
          />
        )}
      </>
    );

    return (
      <div key={item.id}>
        {isDisabled ? (
          <div aria-disabled className="cgsb-item is-disabled" title={label}>
            {inner}
          </div>
        ) : isExpandable ? (
          <button
            aria-expanded={isOpen}
            className={`cgsb-item cg-focus ${isActive ? "is-active" : ""}`}
            title={label}
            type="button"
            onClick={() => toggleMenu(item.id)}
          >
            {inner}
          </button>
        ) : (
          <NavLink
            className={`cgsb-item cg-focus ${isActive ? "is-active" : ""}`}
            title={label}
            to={item.path || "/dashboard"}
            onClick={() => {
              setFlyout(null);
              onNavigate?.();
            }}
          >
            {inner}
          </NavLink>
        )}

        <AnimatePresence initial={false}>
          {isExpandable && isOpen && subs.length > 0 && hasTenant && (
            <motion.div
              key="subs"
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              initial={{ height: 0, opacity: 0 }}
              style={{ overflow: "hidden" }}
              transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="cgsb-subs">
                {subs.map((sub) => (
                  <NavLink
                    key={sub.id}
                    className={`cgsb-sub cg-focus ${active.subPath === sub.path ? "is-active" : ""}`}
                    title={subLabelOf(item, sub)}
                    to={sub.path}
                    onClick={() => {
                      setFlyout(null);
                      onNavigate?.();
                    }}
                  >
                    {subLabelOf(item, sub)}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  /* ── El mismo destino, en icono (modo colapsado) ────────────────────────── */
  const renderOrb = (item: MenuItem) => {
    const isDisabled = !hasTenant && item.path !== "/dashboard";
    const isActive = active.itemId === item.id;
    const label = labelOf(item);
    const sinLeer = insigniaDe(item.id);
    const icon = (
      <>
        <item.icon className="h-[18px] w-[18px]" />
        {sinLeer > 0 && (
          <span
            aria-label={t("sidebar.unreadMessages", {
              count: sinLeer,
              defaultValue: "{{count}} mensajes sin leer",
            })}
            className="cgsb-orb-dot"
          />
        )}
      </>
    );

    if (isDisabled) {
      return (
        <div
          key={item.id}
          aria-disabled
          className="cgsb-orb is-disabled"
          title={label}
        >
          {icon}
        </div>
      );
    }
    if (item.expandable) {
      return (
        <button
          key={item.id}
          aria-current={isActive ? "true" : undefined}
          aria-expanded={flyout?.id === item.id}
          aria-label={label}
          className={`cgsb-orb cg-focus ${isActive || flyout?.id === item.id ? "is-on" : ""}`}
          title={label}
          type="button"
          onClick={(e) => {
            const rect = (
              e.currentTarget as HTMLElement
            ).getBoundingClientRect();

            setFlyout((prev) =>
              prev?.id === item.id ? null : { id: item.id, top: rect.top },
            );
          }}
        >
          {icon}
        </button>
      );
    }

    return (
      <NavLink
        key={item.id}
        aria-current={isActive ? "true" : undefined}
        aria-label={label}
        className={`cgsb-orb cg-focus ${isActive ? "is-on" : ""}`}
        title={label}
        to={item.path || "/dashboard"}
        onClick={() => {
          setFlyout(null);
          onNavigate?.();
        }}
      >
        {icon}
      </NavLink>
    );
  };

  const brandTile = (
    <span className="cgsb-logo">
      {tenantLogo ? (
        <img alt={tenantName || "Logo"} src={tenantLogo} />
      ) : (
        <span>
          {tenantName ? tenantName.substring(0, 2).toUpperCase() : "CG"}
        </span>
      )}
    </span>
  );

  /* ── MENÚ ÚNICO (expandido) ─────────────────────────────────────────────── */
  const panel = (
    <div className="cgsb-panel">
      {/* Cabecera: logo del tenant + nombre */}
      <div className="cgsb-head">
        <button
          className="cgsb-brand cg-focus"
          title={`${tenantName || "CGuard"} · ${t("sidebar.brandTooltip")}`}
          type="button"
          onClick={() => go("/dashboard")}
        >
          {brandTile}
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-[13.5px] font-semibold leading-tight"
              style={{ color: "var(--ink)" }}
            >
              {tenantName || "CGuard"}
            </span>
            <span
              className="cg-eyebrow mt-1 block truncate"
              style={{ fontSize: 9.5 }}
            >
              {t("sidebar.commandCenter", { defaultValue: "Centro de mando" })}
            </span>
          </span>
        </button>
      </div>

      {/* Buscador de cristal */}
      <div className="cgsb-search glass-sunken">
        <Search
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: "var(--ink-faint)" }}
        />
        <input
          aria-label={t("sidebar.searchPlaceholder", {
            defaultValue: "Buscar en el menú…",
          })}
          autoComplete="off"
          placeholder={t("sidebar.searchPlaceholder", {
            defaultValue: "Buscar en el menú…",
          })}
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");

              return;
            }
            if (e.key === "Enter" && firstResultPath) {
              setQuery("");
              go(firstResultPath);
            }
          }}
        />
        {query && (
          <button
            aria-label={t("sidebar.clearSearch", {
              defaultValue: "Limpiar búsqueda",
            })}
            className="cg-focus shrink-0 rounded-full"
            style={{ color: "var(--ink-faint)" }}
            type="button"
            onClick={() => setQuery("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Los seis grupos, uno detrás de otro: UN solo menú */}
      <nav
        ref={scrollRef}
        aria-label={t("sidebar.mainNav", {
          defaultValue: "Navegación principal",
        })}
        className="cgsb-scroll"
      >
        {q && renderGroups.length === 0 ? (
          <p
            className="px-1 py-6 text-center text-xs"
            style={{ color: "var(--ink-faint)" }}
          >
            {t("sidebar.noResults", { defaultValue: "Sin coincidencias" })}
          </p>
        ) : (
          renderGroups.map((group) => (
            <div key={group.id} className="cgsb-group">
              <div className="cg-eyebrow cgsb-group-label">
                {t(`sidebar.group.${group.id}`, { defaultValue: group.label })}
              </div>
              {group.entries.map(({ item, forcedSubs }) =>
                renderItem(
                  item,
                  forcedSubs?.length ? { forcedSubs } : undefined,
                ),
              )}
            </div>
          ))
        )}
      </nav>

      {/* Pie: ficha de cristal con el usuario + conmutador de tema */}
      <div className="cgsb-foot">
        <div className="cgsb-user glass-flat">
          <NavLink
            className="cgsb-user-link cg-focus"
            title={t("sidebar.accountSettings")}
            to="/setting"
            onClick={() => onNavigate?.()}
          >
            <span className="cgsb-avatar">
              {avatar ? (
                <img alt={userName} src={avatar} />
              ) : (
                initials(userName)
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[12.5px] font-semibold leading-tight"
                style={{ color: "var(--ink)" }}
              >
                {userName}
              </span>
              <span
                className="block truncate text-[10.5px] leading-tight"
                style={{ color: "var(--ink-faint)" }}
              >
                {userEmail}
              </span>
            </span>
          </NavLink>
          <button
            aria-label={t("sidebar.themeToggle")}
            className="cgsb-ghost cg-focus"
            title={
              theme === "dark"
                ? t("sidebar.themeToLight")
                : t("sidebar.themeToDark")
            }
            type="button"
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── EL MISMO MENÚ, EN ICONOS (colapsado) ───────────────────────────────── */
  const rail = (
    <div className="cgsb-rail">
      <button
        aria-label={t("sidebar.goToDashboard")}
        className={`cgsb-orb cg-focus ${tenantLogo ? "cgsb-orb-avatar" : "cgsb-orb-brand"}`}
        title={`${tenantName || "C-GUARD PRO"} · ${t("sidebar.brandTooltip")}`}
        type="button"
        onClick={() => go("/dashboard")}
      >
        {tenantLogo ? (
          <img alt={tenantName || "Logo"} src={tenantLogo} />
        ) : (
          <Shield className="h-[18px] w-[18px]" />
        )}
      </button>
      <div className="cgsb-sep" />

      {/* Al desplazar la columna el submenú flotante se quedaría colgado a la
          altura vieja: se cierra en cuanto la lista se mueve. */}
      <nav
        aria-label={t("ui.sidebar.navegacionPrincipal", "Navegación principal")}
        className="cgsb-rail-list"
        onScroll={() => setFlyout(null)}
      >
        {groups.map((g, gi) => (
          <div key={g.id} className="contents">
            {gi > 0 && (
              <div aria-hidden className="cgsb-sep" role="separator" />
            )}
            {g.items.map(renderOrb)}
          </div>
        ))}
      </nav>

      <div className="cgsb-sep" />
      <button
        aria-label={t("sidebar.themeToggle")}
        className="cgsb-orb cg-focus"
        title={
          theme === "dark"
            ? t("sidebar.themeToLight")
            : t("sidebar.themeToDark")
        }
        type="button"
        onClick={toggleTheme}
      >
        {theme === "dark" ? (
          <Moon className="h-[17px] w-[17px]" />
        ) : (
          <Sun className="h-[17px] w-[17px]" />
        )}
      </button>
      <NavLink
        aria-label={userName}
        className="cgsb-orb cgsb-orb-avatar cg-focus"
        title={userName}
        to="/setting"
        onClick={() => {
          setFlyout(null);
          onNavigate?.();
        }}
      >
        {avatar ? (
          <img alt={userName} src={avatar} />
        ) : (
          <span
            className="text-[11px] font-bold"
            style={{ color: "var(--brand-text)" }}
          >
            {initials(userName)}
          </span>
        )}
      </NavLink>
    </div>
  );

  const flyoutItem = flyout
    ? visibleItems.find((i) => i.id === flyout.id)
    : undefined;
  // Que no se salga por abajo cuando el destino está al final de la columna.
  const flyoutTop = flyout
    ? Math.max(
        8,
        Math.min(
          flyout.top,
          (typeof window !== "undefined" ? window.innerHeight : 800) - 260,
        ),
      )
    : 0;

  return (
    <aside ref={rootRef as any} className="app-sidebar cgsb-root">
      {collapsed ? rail : panel}

      {/* Colapsado: el desplegable se abre flotando junto a su icono. */}
      <AnimatePresence>
        {collapsed && flyoutItem && hasTenant && (
          <motion.div
            key={flyoutItem.id}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className="cgsb-flyout glass-raised"
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.98 }
            }
            initial={reduceMotion ? false : { opacity: 0, x: -8, scale: 0.98 }}
            style={{ position: "fixed", top: flyoutTop, left: 72 }}
            transition={{ duration: dur, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="cg-eyebrow cgsb-group-label">
              {labelOf(flyoutItem)}
            </div>
            <div className="cgsb-subs">
              {(flyoutItem.subItems || []).map((sub) => (
                <NavLink
                  key={sub.id}
                  className={`cgsb-sub cg-focus ${active.subPath === sub.path ? "is-active" : ""}`}
                  title={subLabelOf(flyoutItem, sub)}
                  to={sub.path}
                  onClick={() => {
                    setFlyout(null);
                    onNavigate?.();
                  }}
                >
                  {subLabelOf(flyoutItem, sub)}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
