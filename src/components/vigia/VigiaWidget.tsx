/**
 * VigIA — el asistente del CRM, en la esquina inferior derecha.
 *
 * El vigía de la operación: chatea, consulta (cobertura, incidentes) y ejecuta
 * acciones (invitar vigilantes, supervisores, clientes) SIEMPRE con
 * confirmación: el modelo propone en una tarjeta, la persona decide.
 *
 * Notas de esta casa:
 *  - `position: fixed` va EN LÍNEA: las clases .glass* fijan position y
 *    glass.css gana a las utilidades (ver su cabecera).
 *  - El panel FLOTA sobre la página entera → fondo `--float`, no un tinte.
 *  - La severidad y la marca salen de los tokens; nada de colores propios.
 *  - La conversación vive en el estado del armazón (persiste al navegar,
 *    muere al recargar — un chat operativo no necesita más memoria que esa).
 */
import { iconoDe, siluetaDe } from "@/lib/formasDelAgente";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Send,
  X,
  Loader2,
  Check,
  Ban,
  Hand,
  MessageSquarePlus,
  History,
  ArrowLeft,
  Trash2,
  Paperclip,
  FileText,
  FileSpreadsheet,
  Download,
} from "lucide-react";

import api from "@/lib/api";
import {
  agenteGuardado,
  cargarAgente,
  siglaDelAgente,
  type AgenteDeMarca,
} from "@/lib/agenteDeMarca";
import { localeActual } from "@/lib/localeActual";
import { hoyEnLaEmpresa, zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

const tenantId = () => localStorage.getItem("tenantId") || "";

/** El hilo sobrevive a una recarga (2 h de vida): repetir el contexto se paga
 *  dos veces — en paciencia y en tokens. */
const HILO_KEY = "vigia_hilo";
const HILO_TTL_MS = 2 * 60 * 60 * 1000;

/** El id del hilo: viaja con cada mensaje para que el servidor guarde la
 *  conversación ENTERA junta y no un hilo suelto por mensaje. Es una clave
 *  opaca acotada a esta empresa y a esta persona en el servidor. */
function nuevoHiloId(): string {
  return `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function cargarHilo(): { msgs: Msg[]; id: string } {
  try {
    const raw = sessionStorage.getItem(HILO_KEY);

    if (!raw) return { msgs: [], id: nuevoHiloId() };
    const { ts, tid, msgs, hid } = JSON.parse(raw);

    if (Date.now() - ts > HILO_TTL_MS || tid !== tenantId())
      return { msgs: [], id: nuevoHiloId() };

    return {
      msgs: Array.isArray(msgs) ? msgs.slice(-24) : [],
      id: hid || nuevoHiloId(),
    };
  } catch {
    return { msgs: [], id: nuevoHiloId() };
  }
}
function guardarHilo(msgs: Msg[], hid: string) {
  try {
    sessionStorage.setItem(
      HILO_KEY,
      JSON.stringify({
        ts: Date.now(),
        tid: tenantId(),
        hid,
        msgs: msgs.slice(-24),
      }),
    );
  } catch {
    /* privado */
  }
}

/** El historial de conversaciones cerradas: hasta 10, viven 7 días, por
 *  empresa. En localStorage — reabrir una conversación de ayer es el punto. */
const CONVOS_KEY = "vigia_convos";
const CONVOS_MAX = 10;
const CONVOS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Convo {
  id: string;
  titulo: string;
  ts: number;
  msgs: Msg[];
}

function cargarConvos(): Convo[] {
  try {
    const raw = localStorage.getItem(CONVOS_KEY);

    if (!raw) return [];
    const { tid, lista } = JSON.parse(raw);

    if (tid !== tenantId() || !Array.isArray(lista)) return [];

    return lista
      .filter((c: Convo) => Date.now() - c.ts < CONVOS_TTL_MS)
      .slice(0, CONVOS_MAX);
  } catch {
    return [];
  }
}
function guardarConvos(lista: Convo[]) {
  try {
    localStorage.setItem(
      CONVOS_KEY,
      JSON.stringify({ tid: tenantId(), lista: lista.slice(0, CONVOS_MAX) }),
    );
  } catch {
    /* privado */
  }
}
function tituloDeConvo(msgs: Msg[]): string {
  const primero = msgs.find((m) => m.role === "user")?.content || "";

  return primero.slice(0, 60) || "";
}

/** El modelo a veces escapa el «sin markdown» del prompt: los restos de
 *  negritas y viñetas se limpian aquí para que no salgan asteriscos crudos. */
function sinMarkdown(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?]|$)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

interface Archivo {
  nombre: string;
  url: string;
  tipo?: string;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  /** Lo que VigIA generó en ese turno (un PDF, un Excel): se pinta como botón. */
  archivos?: Archivo[];
}

/** La respuesta del asistente como mensaje, con sus archivos si los trae. */
function mensajeDeRespuesta(d: any): Msg | null {
  const archivos: Archivo[] = Array.isArray(d?.archivos)
    ? d.archivos.filter((x: any) => x?.url && x?.nombre)
    : [];
  if (!d?.reply && !archivos.length) return null;
  return {
    role: "assistant",
    content: String(d?.reply || ""),
    ...(archivos.length ? { archivos } : {}),
  };
}
interface Propuesta {
  tool: string;
  args: any;
  resumen: string;
  firma: string;
  exp: number;
}

/**
 * La cara del asistente.
 *
 * Si el socio subió una, se pinta esa, redonda. Si no, el escudo de siempre —
 * inline, para no cargar assets. `object-cover` y no `contain`: en un círculo
 * de 18 px, una imagen encajada dentro deja aire por los lados y parece
 * pequeña; recortada, llena.
 */
function LogoVigia({
  size = 18,
  avatarUrl,
  forma = "escudo",
  icono,
}: {
  size?: number;
  avatarUrl?: string | null;
  forma?: string;
  icono?: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        alt=""
        aria-hidden
        /* Sin forma, la imagen se ve entera; con forma, redonda y recortada. */
        className={forma === "ninguna" ? "object-contain" : "rounded-full object-cover"}
        height={size}
        src={avatarUrl}
        style={{ width: size, height: size }}
        width={size}
      />
    );
  }
  /* The partner's chosen icon, as in its bubble. */
  const glifo = iconoDe(icono);

  if (glifo) {
    return (
      <svg
        aria-hidden
        color="currentColor"
        dangerouslySetInnerHTML={{ __html: glifo }}
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        viewBox="0 0 24 24"
        width={size}
      />
    );
  }
  /* A partner's shape: its silhouette, outlined. The shield (ours) keeps its
     pulse line below. */
  if (forma !== "escudo") {
    return (
      <svg
        aria-hidden
        fill="none"
        height={size}
        viewBox="0 0 48 54"
        width={size}
      >
        <path
          d={siluetaDe(forma).d}
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="3.6"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M7.5 12h2l1.5-3 2 6 1.5-3h2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** What counts as "a control the bubble must not swallow the click of". */
const CONTROL_SELECTOR =
  'button, a[href], input, textarea, select, [role="button"], [role="combobox"], [role="tab"], [role="checkbox"], [role="switch"]';

/** Gap kept between the bubble and a control it steps away from. */
const STEP_GAP = 12;
/** Never lift the bubble higher than this share of the window. */
const MAX_LIFT_SHARE = 0.45;

function overlaps(a: DOMRect | { left: number; right: number; top: number; bottom: number }, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Visible interactive controls of the page whose box intersects `box`. */
function controlsUnder(
  bubble: HTMLElement,
  box: { left: number; right: number; top: number; bottom: number },
): DOMRect[] {
  const hits: DOMRect[] = [];

  for (const el of Array.from(document.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))) {
    if (bubble.contains(el) || el.closest("[data-flotante]")) continue;
    const r = el.getBoundingClientRect();

    if (!r.width || !r.height) continue;
    if (!overlaps(box, r)) continue;
    // Hidden or clipped controls (behind a closed drawer, scrolled out of a
    // panel) are not under the bubble: the topmost element at their centre
    // must be the control itself or something inside it.
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
    const cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
    const top = document
      .elementsFromPoint(cx, cy)
      .find((x) => !bubble.contains(x) && !x.closest("[data-flotante]"));

    if (top && (el === top || el.contains(top) || top.contains(el))) hits.push(r);
  }

  return hits;
}

/**
 * Where the bubble should sit so it never covers a control (QA-95, audit
 * 2026-10-31: the «Enviar» of «Nuevo Vigilante» was half under the bubble and
 * the old point probes missed it). Returns how many px to lift it, or "hide"
 * when no clear spot exists within reach.
 */
export function bubblePlacement(bubble: HTMLElement, currentLift: number): number | "hide" {
  const now = bubble.getBoundingClientRect();

  if (!now.width || !now.height) return 0;
  // Where the bubble sits with no lift at all.
  const base = { left: now.left, right: now.right, top: now.top + currentLift, bottom: now.bottom + currentLift };
  let lift = 0;

  for (let i = 0; i < 6; i++) {
    const box = { ...base, top: base.top - lift - STEP_GAP / 2, bottom: base.bottom - lift + STEP_GAP / 2 };
    const hits = controlsUnder(bubble, box);

    if (!hits.length) return lift;
    const highest = Math.min(...hits.map((r) => r.top));

    lift = Math.ceil(base.bottom - highest + STEP_GAP);
    if (lift > window.innerHeight * MAX_LIFT_SHARE || base.top - lift < 8) return "hide";
  }

  return "hide";
}

export default function VigiaWidget() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /* La burbuja se APARTA mientras se desplaza la página. Flota sobre la esquina
     derecha de las listas, que es justo donde viven los estados («Sin cubrir»,
     «Activo»), y en una pantalla de teléfono no hay ningún sitio donde no tape
     algo. Apartarla mientras el dedo recorre la lista y devolverla al soltar es
     lo que hace cualquier botón flotante de iOS; el gesto para invocarla es
     tocarla, no leerla, así que no se pierde nada. */
  const [desplazando, setDesplazando] = useState(false);
  const hiloGuardado = useRef(cargarHilo());
  const [msgs, setMsgs] = useState<Msg[]>(() => hiloGuardado.current.msgs);
  // El id del hilo abierto: acompaña cada mensaje al servidor.
  const [hiloId, setHiloId] = useState<string>(() => hiloGuardado.current.id);
  const [texto, setTexto] = useState("");
  /* Quién es el asistente aquí. Se siembra con lo último que se supo para que
     no parpadee «VigIA» un instante en el CRM de un socio, y se refresca en
     cuanto el servidor contesta. */
  const [agente, setAgente] = useState<AgenteDeMarca>(() =>
    agenteGuardado(tenantId()),
  );
  /* The silhouette. The shield —and its pulse line and panel tip— only when the
     server says so, which is only for our own companies. */
  const silueta = siluetaDe(agente.forma);
  const esEscudo = agente.forma === "escudo";
  /* CON IMAGEN, SIN FORMA. Si el socio subió una imagen, la burbuja ES esa
     imagen, a tamaño completo: antes se dibujaba la forma y la imagen iba
     recortada en un círculo de 18 px dentro, y se veía como un sello diminuto
     sobre un disco de color (queja de un socio, 2026-09-30). La forma sólo se
     dibuja cuando no hay imagen; «ninguna» sin imagen cae al orbe en el
     servidor. */
  const sinForma = !!agente.avatarUrl;
  const icono = iconoDe(agente.icono);

  useEffect(() => {
    if (open) return;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const alDesplazar = () => {
      setDesplazando(true);
      if (temporizador) clearTimeout(temporizador);
      // 420 ms: lo justo para que un desplazamiento con inercia no la haga
      // parpadear entre empujón y empujón.
      temporizador = setTimeout(() => setDesplazando(false), 420);
    };

    // Any scroller, not only <main>: settings pages scroll their own panel, so
    // after scrolling to «Guardar configuración» the bubble never re-checked and
    // sat over the button (QA re-test 2026-11-02, /nomina/settings at 1440×900).
    document.addEventListener("scroll", alDesplazar, { passive: true, capture: true });

    return () => {
      document.removeEventListener("scroll", alDesplazar, { capture: true });
      if (temporizador) clearTimeout(temporizador);
    };
  }, [open]);

  /* STEP ASIDE FROM CONTROLS. The bubble floats over the bottom-right corner,
     which is exactly where the CRM right-aligns «Save», «Send» and «Create»:
     a form that ends there had its main button swallowed by the bubble and
     the click opened the chat instead (QA-95). `apartarDelWidget` fixed that
     screen by screen; this covers every screen. When a control sits under
     the bubble, the bubble goes translucent and lets clicks through — the
     same state it already takes while the page scrolls — and comes back as
     soon as the spot is clear. Re-checked when the page stops scrolling,
     changes, resizes or navigates. */
  const burbujaRef = useRef<HTMLButtonElement | null>(null);
  const [tapaControl, setTapaControl] = useState(false);
  const [lift, setLift] = useState(0);
  const liftRef = useRef(0);

  useEffect(() => {
    if (open || desplazando) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const b = burbujaRef.current;

        if (!b) return;
        const place = bubblePlacement(b, liftRef.current);
        const next = place === "hide" ? 0 : place;

        liftRef.current = next;
        setLift(next);
        setTapaControl(place === "hide");
      });
    };
    // Mutations come in bursts (a list rendering, a form opening) and some
    // pages never stop mutating (clocks, live maps): at most one check every
    // 300 ms, never postponed indefinitely.
    const soon = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        check();
      }, 300);
    };
    // The whole body, not <main>: a lazy route can swap the <main> node after
    // this effect ran, and an observer on the old node never fires again (the
    // bubble then stayed over «Enviar» of the guard form until a resize).
    const obs =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(soon)
        : null;

    obs?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", soon);
    // Pages fade/slide in: a check made mid-animation sees the buttons where
    // they are not going to stay, and the end of an animation mutates nothing.
    document.addEventListener("animationend", soon, true);
    document.addEventListener("transitionend", soon, true);
    soon();
    const later = [800, 2000].map((ms) => setTimeout(check, ms));

    return () => {
      obs?.disconnect();
      window.removeEventListener("resize", soon);
      document.removeEventListener("animationend", soon, true);
      document.removeEventListener("transitionend", soon, true);
      later.forEach(clearTimeout);
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [open, desplazando, pathname]);
  const [ocupado, setOcupado] = useState(false);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vista, setVista] = useState<"chat" | "historial">("chat");
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [convos, setConvos] = useState<Convo[]>(() => cargarConvos());

  /** La conversación actual se guarda en el historial (si tiene algo). */
  const archivarActual = (mensajes: Msg[]): Convo[] => {
    if (!mensajes.length) return convos;
    const lista = [
      {
        id: hiloId,
        titulo: tituloDeConvo(mensajes),
        ts: Date.now(),
        msgs: mensajes.slice(-24),
      },
      ...convos,
    ].slice(0, CONVOS_MAX);

    setConvos(lista);
    guardarConvos(lista);

    return lista;
  };

  const limpiarHilo = () => {
    setMsgs([]);
    // Hilo nuevo, id nuevo: en la transcripción del servidor son dos
    // conversaciones distintas, que es lo que acaba de pedir el usuario.
    setHiloId(nuevoHiloId());
    setPropuesta(null);
    setAviso(null);
    setTexto("");
    try {
      sessionStorage.removeItem(HILO_KEY);
    } catch {
      /* privado */
    }
  };

  /** Guarda la actual en el historial y abre una en limpio. */
  const nuevaConversacion = () => {
    archivarActual(msgs);
    limpiarHilo();
    setVista("chat");
    setTimeout(() => entrada.current?.focus(), 0);
  };

  /** La X: con conversación viva, primero pregunta. */
  const pedirCierre = () => {
    if (!msgs.length) {
      setOpen(false);
      setVista("chat");

      return;
    }
    setConfirmarCierre(true);
  };
  const cerrarConversacion = () => {
    archivarActual(msgs);
    limpiarHilo();
    setConfirmarCierre(false);
    setVista("chat");
    setOpen(false);
  };
  const soloMinimizar = () => {
    setConfirmarCierre(false);
    setOpen(false);
  };

  /** Reabre una conversación pasada (la actual, si hay, se guarda antes). */
  const reabrirConvo = (c: Convo) => {
    const lista = archivarActual(msgs).filter((x) => x.id !== c.id);

    setConvos(lista);
    guardarConvos(lista);
    setMsgs(c.msgs);
    // Reabrir es CONTINUAR: el id vuelve con la conversación para que el
    // servidor siga escribiendo en el mismo hilo y no en uno nuevo.
    setHiloId(c.id);
    setPropuesta(null);
    setAviso(null);
    setVista("chat");
    setTimeout(() => entrada.current?.focus(), 0);
  };
  const borrarConvo = (id: string) => {
    const lista = convos.filter((x) => x.id !== id);

    setConvos(lista);
    guardarConvos(lista);
  };
  const fondo = useRef<HTMLDivElement | null>(null);
  const entrada = useRef<HTMLTextAreaElement | null>(null);
  const botonConfirmar = useRef<HTMLButtonElement | null>(null);

  // El foco vuelve al campo al abrir y tras cada respuesta; cuando aparece una
  // propuesta, va al botón Confirmar — es LA decisión del feature.
  useEffect(() => {
    if (!open) return;
    if (propuesta) botonConfirmar.current?.focus();
    else if (!ocupado) entrada.current?.focus();
  }, [open, ocupado, propuesta]);

  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight });
    guardarHilo(msgs, hiloId);
  }, [msgs, hiloId, propuesta, ocupado, open]);

  /* Quién es el asistente. Al MONTAR y no al abrir: su nombre está en el
     `aria-label` de la burbuja cerrada, que un lector de pantalla anuncia sin
     que nadie la haya abierto. Una petición por sesión — la respuesta la cachea
     el módulo. */
  useEffect(() => {
    let vivo = true;
    cargarAgente(tenantId()).then((a) => {
      if (vivo) setAgente(a);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // El parte matutino: la PRIMERA apertura del día trae el estado de la
  // operación sin gastar un token — el retrato ya lo sabe todo.
  useEffect(() => {
    if (!open) return;
    const hoy = hoyEnLaEmpresa();

    if (localStorage.getItem("vigia_parte") === hoy) return;
    localStorage.setItem("vigia_parte", hoy);
    (async () => {
      try {
        const resp: any = await api.get(
          `/tenant/${tenantId()}/assistant/brief`,
          { toast: { silentError: true } } as any,
        );
        const d = resp && resp.data !== undefined ? resp.data : resp;

        if (d?.lineas?.length) {
          setMsgs((m) => [
            ...m,
            {
              role: "assistant",
              content: `${d.titulo}\n${d.lineas.map((l: string) => `• ${l}`).join("\n")}`,
            },
          ]);
        }
      } catch {
        /* sin parte no pasa nada */
      }
    })();
  }, [open]);

  // Cualquier parte del CRM puede abrir a VigIA con un primer mensaje sembrado:
  // window.dispatchEvent(new CustomEvent('vigia:abrir', { detail: { mensaje } }))
  useEffect(() => {
    const abrir = (e: any) => {
      setOpen(true);
      const mensaje = e?.detail?.mensaje;

      // Se siembra AUNQUE haya hilo: una alerta conversable llega en mitad del
      // día, no solo en el estreno del chat.
      if (mensaje)
        setMsgs((m) => [...m, { role: "assistant", content: String(mensaje) }]);
      const escribir = e?.detail?.escribir;

      if (escribir) setTexto(String(escribir));
    };

    window.addEventListener("vigia:abrir", abrir as any);

    return () => window.removeEventListener("vigia:abrir", abrir as any);
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", esc);

    return () => window.removeEventListener("keydown", esc);
  }, []);

  if (!localStorage.getItem("authToken") || !tenantId()) return null;

  // Lo último que se leyó de una hoja de vida, a la espera de que alguien lo
  // abra en el formulario de alta.
  const [cvPendiente, setCvPendiente] = useState<{
    campos: any;
    archivo: File;
  } | null>(null);
  const cvInput = useRef<HTMLInputElement>(null);

  const llamar = async (body: any): Promise<any> => {
    // 60s: un turno con varias consultas tarda más que los 15s globales de
    // axios — y abortar en el cliente mientras el servidor sigue era el modo
    // de fallo más caro (reintento = pagar el turno dos veces).
    const resp: any = await api.post(
      `/tenant/${tenantId()}/assistant/chat`,
      body,
      { timeout: 60000, toast: { silentError: true } } as any,
    );

    return resp && resp.data !== undefined ? resp.data : resp;
  };

  /**
   * ADJUNTAR UNA HOJA DE VIDA desde el chat.
   *
   * Se lee aquí mismo y el resultado se cuenta en la conversación, con un botón
   * para abrir el alta ya rellena. VigIA NO da de alta a nadie por su cuenta:
   * enseña lo que leyó y deja que una persona lo revise en el formulario, que
   * es donde están las validaciones de verdad.
   */
  const adjuntarHojaDeVida = async (archivo: File) => {
    if (ocupado) return;
    setAviso(null);
    setPropuesta(null);
    setMsgs((m) => [
      ...m,
      {
        role: "user",
        content: t("vigia.cvSent", "Hoja de vida: {{n}}", { n: archivo.name }),
      },
    ]);
    setOcupado(true);
    try {
      const { hojaDeVidaService, aCamposDelFormulario } = await import(
        "@/lib/api/hojaDeVidaService"
      );
      const r = await hojaDeVidaService.leer(archivo);
      const campos = aCamposDelFormulario(r.datos);
      const leidos = Object.values(r.datos).filter(
        (v) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
      ).length;

      if (!leidos) {
        setMsgs((m) => [
          ...m,
          {
            role: "assistant",
            content: t(
              "vigia.cvEmpty",
              "No pude sacar datos de ese archivo. Comprueba que se lea bien, o llena la ficha a mano.",
            ),
          },
        ]);

        return;
      }

      const resumen = [
        campos.firstName || campos.lastName
          ? t("ui.VigiaWidget.cvNombre", {
              defaultValue: "Nombre: {{valor}}",
              valor: [campos.firstName, campos.middleName, campos.lastName]
                .filter(Boolean)
                .join(" "),
            })
          : null,
        campos.identificationNumber
          ? t("ui.VigiaWidget.cvDocumento", {
              defaultValue: "Documento: {{valor}}",
              valor: campos.identificationNumber,
            })
          : null,
        campos.birthDate
          ? t("ui.VigiaWidget.cvNacimiento", {
              defaultValue: "Nacimiento: {{valor}}",
              valor: campos.birthDate,
            })
          : null,
        campos.email
          ? t("ui.VigiaWidget.cvCorreo", {
              defaultValue: "Correo: {{valor}}",
              valor: campos.email,
            })
          : null,
        campos.phone
          ? t("ui.VigiaWidget.cvTelefono", {
              defaultValue: "Teléfono: {{valor}}",
              valor: campos.phone,
            })
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content:
            `${t("vigia.cvRead", "Esto es lo que leí:")}\n\n${resumen}\n\n` +
            (r.faltantes.includes("contacto")
              ? t(
                  "vigia.cvNoContact",
                  "No encontré correo ni teléfono: sin uno de los dos no se le puede invitar.",
                )
              : t("vigia.cvReview", "Ábrelo para revisarlo y guardarlo.")),
        },
      ]);

      // Los datos viajan en memoria hasta la pantalla de alta: no se guardan en
      // ningún sitio mientras tanto, que es dato personal de alguien que
      // todavía no es empleado.
      setCvPendiente({ campos, archivo });
    } catch (e: any) {
      setAviso(
        e?.message || t("vigia.cvError", "No pudimos leer la hoja de vida."),
      );
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async () => {
    const contenido = texto.trim();

    if (!contenido || ocupado) return;
    setTexto("");
    setAviso(null);
    setPropuesta(null);
    // El servidor solo mira los últimos 16: mandar más es ancho de banda.
    const historia: Msg[] = [
      ...msgs,
      { role: "user" as const, content: contenido },
    ].slice(-16);

    setMsgs(historia);
    setOcupado(true);
    try {
      // Al servidor sólo viaja la conversación: los archivos son de esta pantalla.
      const d = await llamar({
        messages: historia.map(({ role, content }) => ({ role, content })),
        conversationId: hiloId,
      });

      if (d?.error) {
        setAviso(d.error);

        return;
      }
      {
        const nuevo = mensajeDeRespuesta(d);
        if (nuevo) setMsgs((m) => [...m, nuevo]);
        // Antes de navegar: ver `confirmar`.
        if (d?.navigate) guardarHilo(nuevo ? [...historia, nuevo] : historia, hiloId);
      }
      if (d?.proposal) setPropuesta(d.proposal);
      if (d?.navigate) {
        navigate(d.navigate);
        if (!d?.proposal) setOpen(false);
      }
    } catch (e: any) {
      setAviso(
        e?.message ||
          t(
            "vigia.netError",
            "No pudimos hablar con {{agente}}. Inténtalo de nuevo.",
            {
              agente: agente.nombre,
            },
          ),
      );
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async (si: boolean) => {
    if (!propuesta || ocupado) return;
    const p = propuesta;

    if (!si) {
      setPropuesta(null);
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          content: t("vigia.cancelled", "Entendido, no lo hago. ¿Algo más?"),
        },
      ]);

      return;
    }
    setOcupado(true);
    try {
      // La firma viaja de vuelta: el servidor solo ejecuta propuestas que ÉL
      // emitió, frescas y una sola vez — reintentar con la misma firma devuelve
      // el mismo resultado en vez de ejecutar dos veces.
      const d = await llamar({
        messages: msgs.slice(-16),
        conversationId: hiloId,
        confirm: { tool: p.tool, args: p.args, firma: p.firma, exp: p.exp },
      });

      if (d?.error) {
        setAviso(d.error);
        setPropuesta(null);

        return;
      }
      setPropuesta(d?.proposal || null);
      {
        const nuevo = mensajeDeRespuesta(d);
        if (nuevo) setMsgs((m) => [...m, nuevo]);
        /* GUARDAR ANTES DE NAVEGAR. Tras confirmar, VigIA lleva a la pantalla
           de lo que acaba de hacer; si esa pantalla monta otro armazón, este
           chat se desmonta en el MISMO render y el efecto que guarda el hilo
           no llega a correr. Al volver se recuperaba un hilo que acababa en la
           propuesta, sin el «hecho»: el siguiente «sí, ahora llénalo» volvía a
           proponer lo ya hecho. */
        if (d?.navigate) guardarHilo(nuevo ? [...msgs, nuevo] : msgs, hiloId);
      }
      if (d?.navigate) navigate(d.navigate);
    } catch (e: any) {
      // La tarjeta SIGUE AHÍ: si fue un corte de red, reintentar con la misma
      // firma es seguro (idempotente en el servidor).
      setAviso(
        e?.message ||
          t(
            "vigia.confirmError",
            "No se pudo confirmar (¿se cortó la señal?). Vuelve a pulsar Confirmar: es seguro.",
          ),
      );
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      {/* ── La burbuja ──────────────────────────────────────────────────── */}
      {!open && (
        <button
          aria-expanded={open}
          aria-label={t("vigia.openAria", "Abrir {{agente}}, el asistente", {
            agente: agente.nombre,
          })}
          style={{
            // z-45: los diálogos del sistema (z-50) tapan la burbuja, no al
            // revés. La botonera de guardar de algunas páginas vive en
            // bottom-6 right-6 — la burbuja se levanta por encima de ella.
            position: "fixed",
            right: "clamp(1rem, 4vw, 1.75rem)",
            bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
            zIndex: 45,
            // Lifted above a control it would otherwise cover (see bubblePlacement).
            translate: lift ? `0 ${-lift}px` : undefined,
            // drop-shadow y no box-shadow: la sombra sigue la silueta del escudo.
            background: "transparent",
            filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.30))",
          }}
          onClick={() => setOpen(true)}
          className="vigia-burbuja cg-focus transition-transform hover:scale-105"
          ref={burbujaRef}
          data-apartada={desplazando || undefined}
          data-oculta={(!desplazando && tapaControl) || undefined}
          data-elevada={lift > 0 || undefined}
          /* `data-flotante`: así `apartarDelWidget` puede MEDIR lo que ocupa en
             vez de suponerlo. La onda animada hace que su caja real sean 83 px
             de alto arrancando a 159 del borde, bastante más que los 56 de la
             silueta — y un botón «despejado» según la cuenta seguía comiéndose
             el clic. */
          data-flotante
        >
          {/* La animación vive aquí y no en glass.css: es exclusiva del widget. */}
          <style>{`
            @keyframes vigia-wave { 0%, 55%, 100% { transform: rotate(0) } 10% { transform: rotate(-20deg) } 22% { transform: rotate(14deg) } 34% { transform: rotate(-9deg) } 44% { transform: rotate(5deg) } }
            .vigia-wave { animation: vigia-wave 2.8s ease-in-out infinite; transform-origin: 72% 82%; }
            @keyframes vigia-online { 0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--ok) 60%, transparent) } 70% { box-shadow: 0 0 0 9px transparent } 100% { box-shadow: 0 0 0 0 transparent } }
            .vigia-online { animation: vigia-online 2.8s ease-out infinite; }
            @media (prefers-reduced-motion: reduce) { .vigia-wave, .vigia-online { animation: none } }
            /* En el teléfono el escudo mide 74x83 y flota sobre la esquina
               derecha de las listas: tapa justo la columna donde viven los
               estados («Sin cubrir», «Activo»). Encogido tapa un tercio menos
               y sigue siendo un blanco de 58 px, por encima del mínimo. */
            @media (max-width: 767.98px) { .vigia-burbuja { transform: scale(0.78); transform-origin: 100% 100%; } }
            .vigia-burbuja { transition: opacity .22s ease, transform .22s ease, translate .22s ease; }
            .vigia-burbuja[data-apartada] { opacity: .18; pointer-events: none; }
            .vigia-burbuja[data-oculta] { opacity: 0; pointer-events: none; }
            @media (prefers-reduced-motion: reduce) { .vigia-burbuja { transition: none } }
          `}</style>
          <span className="relative block">
            {sinForma ? (
              /* Con imagen: la imagen del socio sola, sin silueta ni recorte,
                 ocupando todo el tamaño de la burbuja (también un GIF animado). */
              <img
                alt=""
                aria-hidden
                className="block"
                height={74}
                src={agente.avatarUrl!}
                style={{ width: 74, height: 74, objectFit: "contain" }}
                width={74}
              />
            ) : (
            <svg aria-hidden height={83} viewBox="0 0 48 54" width={74}>
              <path d={silueta.d} fill="var(--brand)" />
              {/* Con cara, la cara; sin ella, el nombre —o su sigla, si no
                  cabe—. El `clipPath` la recorta en círculo dentro del escudo:
                  una imagen cuadrada encima del escudo rompe la silueta, que es
                  justo lo que hace reconocible la burbuja de lejos. */}
              {agente.avatarUrl ? (
                <>
                  <defs>
                    <clipPath id="vigia-cara">
                      <circle cx="24" cy={silueta.cy} r="9" />
                    </clipPath>
                  </defs>
                  <image
                    clipPath="url(#vigia-cara)"
                    height="18"
                    href={agente.avatarUrl}
                    preserveAspectRatio="xMidYMid slice"
                    width="18"
                    x="15"
                    y={silueta.cy - 9}
                  />
                </>
              ) : icono ? (
                /* The partner's icon inside its shape (instead of the initials). */
                <g
                  color="var(--brand-ink)"
                  dangerouslySetInnerHTML={{ __html: icono }}
                  fill="none"
                  stroke="var(--brand-ink)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.9}
                  transform={`translate(13 ${silueta.cy - 11}) scale(0.92)`}
                />
              ) : (
                <text
                  fill="var(--brand-ink)"
                  fontSize="11"
                  fontWeight="800"
                  style={{ fontFamily: "var(--font-display)" }}
                  textAnchor="middle"
                  x="24"
                  y={silueta.cy + 4}
                >
                  {siglaDelAgente(agente.nombre)}
                </text>
              )}
              {esEscudo && (
                <path
                  d="M13 33h5l3-6 4 12 3-6h7"
                  fill="none"
                  stroke="var(--brand-ink)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.4"
                />
              )}
            </svg>
            )}
            {/* En línea y listo: la manita saluda dentro de un anillo de presencia. */}
            <span
              className="vigia-online absolute grid place-items-center rounded-full border"
              style={{
                top: -4,
                right: -6,
                width: 28,
                height: 28,
                background: "var(--float)",
                borderColor: "var(--hairline)",
              }}
            >
              <Hand
                className="vigia-wave"
                size={15}
                style={{ color: "var(--brand-text)" }}
              />
            </span>
          </span>
        </button>
      )}

      {/* ── El panel ───────────────────────────────────────────────────── */}
      {open && (
        <div
          data-flotante
          className="flex flex-col"
          style={{
            position: "fixed",
            right: "clamp(1rem, 4vw, 1.75rem)",
            bottom:
              "calc(clamp(1rem, 3vh, 1.5rem) + env(safe-area-inset-bottom, 0px))",
            zIndex: 45,
            // 100dvh y no 100vh: con la barra de Safari desplegada, la fila de
            // entrada quedaba fuera de pantalla.
            width: "min(24rem, calc(100vw - 2 * clamp(1rem, 4vw, 1.75rem)))",
            height: "min(34rem, calc(100dvh - 6.5rem))",
          }}
        >
          <div
            aria-label={t(
              "vigia.dialogAria",
              "{{agente}}, asistente de la operación",
              {
                agente: agente.nombre,
              },
            )}
            className="flex min-h-0 flex-1 flex-col overflow-hidden border shadow-2xl"
            role="dialog"
            style={{
              // La silueta del escudo: esquinas superiores de tarjeta, base que
              // se afila hacia la punta central (el tip vive justo debajo).
              borderRadius: esEscudo
                ? "1.25rem 1.25rem 2.75rem 2.75rem"
                : "1.25rem",
              background: "var(--float)",
              borderColor: "var(--hairline)",
              // La receta de .glass-raised: --float sin blur transparenta el
              // dashboard de atrás (números fantasma dentro del chat).
              backdropFilter: "blur(calc(var(--blur) * 1.4)) saturate(200%)",
              WebkitBackdropFilter:
                "blur(calc(var(--blur) * 1.4)) saturate(200%)",
            }}
          >
            {/* Cabecera */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
            >
              <div className="flex items-center gap-2">
                <button
                  aria-label={t("vigia.history", "Conversaciones pasadas")}
                  className="cg-focus rounded p-1 opacity-80 hover:opacity-100"
                  title={t("vigia.history", "Conversaciones pasadas")}
                  onClick={() =>
                    setVista(vista === "historial" ? "chat" : "historial")
                  }
                >
                  {vista === "historial" ? (
                    <ArrowLeft size={16} />
                  ) : (
                    <History size={16} />
                  )}
                </button>
                <LogoVigia
                  avatarUrl={agente.avatarUrl}
                  forma={agente.forma}
                  icono={agente.icono}
                />
                <div>
                  <p
                    className="text-sm font-bold leading-none"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {agente.nombre}
                  </p>
                  <p className="text-[11px] opacity-80">
                    {vista === "historial"
                      ? t("vigia.history", "Conversaciones pasadas")
                      : t("vigia.tagline", "El vigía de tu operación")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  aria-label={t("vigia.newChat", "Conversación nueva")}
                  className="cg-focus rounded p-1 opacity-80 hover:opacity-100"
                  title={t("vigia.newChat", "Conversación nueva")}
                  onClick={nuevaConversacion}
                >
                  <MessageSquarePlus size={16} />
                </button>
                <button
                  aria-label={t("actions.close", "Cerrar")}
                  className="cg-focus rounded p-1 opacity-80 hover:opacity-100"
                  onClick={pedirCierre}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* ¿Cerrar la conversación? La X pregunta antes de tirar el hilo. */}
            {confirmarCierre && (
              <div
                className="border-b px-4 py-3"
                style={{
                  borderColor: "var(--hairline)",
                  background:
                    "color-mix(in oklab, var(--brand) 10%, transparent)",
                }}
              >
                <p className="mb-2 text-sm font-semibold">
                  {t("vigia.confirmClose", "¿Cerrar esta conversación?")}
                </p>
                <p
                  className="mb-3 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t(
                    "vigia.confirmCloseHint",
                    "Se guarda en tu historial y puedes reabrirla desde el menú.",
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    className="cg-focus flex-1 rounded-xl py-1.5 text-sm font-bold transition-[filter] hover:brightness-110"
                    style={{
                      background: "var(--brand)",
                      color: "var(--brand-ink)",
                    }}
                    onClick={cerrarConversacion}
                  >
                    {t("vigia.closeConvo", "Cerrar y guardar")}
                  </button>
                  <button
                    className="cg-focus flex-1 rounded-xl border py-1.5 text-sm font-semibold"
                    style={{ borderColor: "var(--hairline)" }}
                    onClick={soloMinimizar}
                  >
                    {t("vigia.minimize", "Solo minimizar")}
                  </button>
                  <button
                    aria-label={t("actions.cancel", "Cancelar")}
                    className="cg-focus rounded p-1 opacity-70 hover:opacity-100"
                    onClick={() => setConfirmarCierre(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* El historial: conversaciones cerradas, listas para reabrir. */}
            {vista === "historial" && (
              <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {convos.length === 0 && (
                  <p
                    className="px-2 py-6 text-center text-sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t(
                      "vigia.historyEmpty",
                      "Aún no hay conversaciones guardadas. Al cerrar una con la X, queda aquí 7 días.",
                    )}
                  </p>
                )}
                {convos.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 rounded-xl border px-3 py-2"
                    style={{
                      borderColor: "var(--hairline)",
                      background: "var(--glass-raised)",
                    }}
                  >
                    <button
                      className="cg-focus min-w-0 flex-1 text-left"
                      onClick={() => reabrirConvo(c)}
                    >
                      <p
                        className="truncate text-sm"
                        style={{ color: "var(--ink)" }}
                      >
                        {c.titulo || t("vigia.untitled", "Conversación")}
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {new Date(c.ts).toLocaleString(localeActual(), {
                          timeZone: zonaDeLaEmpresa(),
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {c.msgs.length} {t("vigia.messages", "mensajes")}
                      </p>
                    </button>
                    <button
                      aria-label={t("vigia.deleteConvo", "Borrar conversación")}
                      className="cg-focus rounded p-1 opacity-60 hover:opacity-100"
                      title={t("vigia.deleteConvo", "Borrar conversación")}
                      onClick={() => borrarConvo(c.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Mensajes */}
            {vista === "chat" && (
              <div
                ref={fondo}
                aria-live="polite"
                className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
                role="log"
              >
                {msgs.length === 0 && (
                  <div
                    className="px-2 py-4 text-sm"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <p
                      className="mb-2 font-semibold"
                      style={{ color: "var(--ink)" }}
                    >
                      {/* Si el socio escribió un saludo, manda el suyo. Es el
                          único texto libre suyo de todo esto, y por eso se
                          pinta aquí y NO llega al modelo: es interfaz. */}
                      {agente.saludo ||
                        t("vigia.emptyTitle", "¿En qué te ayudo?")}
                    </p>
                    <p>{t("vigia.emptyHint", "Puedo, por ejemplo:")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[
                        t(
                          "ui.VigiaWidget.ejemploCobertura",
                          "¿Cómo va la cobertura ahora?",
                        ),
                        t(
                          "ui.VigiaWidget.ejemploIncidentes",
                          "¿Qué incidentes hubo hoy?",
                        ),
                        t(
                          "ui.VigiaWidget.ejemploAgregarVigilante",
                          "Agrega un vigilante nuevo",
                        ),
                        t(
                          "ui.VigiaWidget.ejemploHorario",
                          "Llévame al horario",
                        ),
                      ].map((ej) => (
                        <button
                          key={ej}
                          className="cg-focus rounded-full border px-2.5 py-1 text-xs transition-[filter] hover:brightness-110"
                          style={{
                            borderColor: "var(--hairline)",
                            color: "var(--ink)",
                          }}
                          onClick={() => {
                            setTexto(ej);
                            setTimeout(() => entrada.current?.focus(), 0);
                          }}
                        >
                          {ej}
                        </button>
                      ))}
                    </div>
                    <p
                      className="mt-2 text-xs"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {t(
                        "vigia.emptyNote",
                        "Toda acción te la muestro antes y la ejecuto solo si confirmas.",
                      )}
                    </p>
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "flex justify-end"
                        : "flex justify-start"
                    }
                  >
                    <div
                      className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm"
                      style={
                        m.role === "user"
                          ? {
                              background:
                                "color-mix(in oklab, var(--brand) 16%, transparent)",
                              color: "var(--ink)",
                            }
                          : {
                              background: "var(--glass-raised)",
                              color: "var(--ink)",
                            }
                      }
                    >
                      {m.role === "assistant"
                        ? sinMarkdown(m.content)
                        : m.content}
                      {m.archivos?.length ? (
                        <div className="mt-2 flex flex-col gap-1.5 whitespace-normal">
                          {m.archivos.map((a) => {
                            const esExcel =
                              a.tipo === "excel" || /\.xlsx?$/i.test(a.nombre);
                            const Icono = esExcel ? FileSpreadsheet : FileText;

                            return (
                              <a
                                key={a.url}
                                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium no-underline"
                                download={a.nombre}
                                href={a.url}
                                rel="noopener noreferrer"
                                style={{
                                  borderColor: "var(--brand)",
                                  color: "var(--ink)",
                                  background:
                                    "color-mix(in oklab, var(--brand) 8%, transparent)",
                                }}
                                target="_blank"
                              >
                                <Icono aria-hidden size={16} />
                                <span className="flex-1 truncate">
                                  {esExcel
                                    ? t("vigia.downloadExcel", "Descargar Excel")
                                    : t("vigia.downloadPdf", "Descargar PDF")}
                                  <span className="ml-1 opacity-60">
                                    {a.nombre}
                                  </span>
                                </span>
                                <Download aria-hidden size={14} />
                              </a>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}

                {/* Tarjeta de propuesta: el modelo propone, la persona decide. */}
                {/* Lo leído de una hoja de vida, con la única acción que tiene
                sentido: abrirlo en el formulario donde se revisa y se guarda.
                Deliberadamente NO hay un «crear» aquí — el alta tiene reglas
                (cliente, puesto, tipo de vigilante) que este panel no pregunta. */}
                {cvPendiente && (
                  <div
                    className="rounded-2xl border px-3 py-3"
                    style={{
                      borderColor: "var(--brand)",
                      background:
                        "color-mix(in oklab, var(--brand) 8%, transparent)",
                    }}
                  >
                    <p
                      className="mb-2 text-xs font-bold uppercase tracking-wide"
                      style={{ color: "var(--brand-text)" }}
                    >
                      {t("vigia.cvTitle", "Hoja de vida leída")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="cg-focus flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-[filter] hover:brightness-110"
                        style={{
                          background: "var(--brand)",
                          color: "var(--brand-ink)",
                        }}
                        onClick={() => {
                          const pendiente = cvPendiente;

                          setCvPendiente(null);
                          setOpen(false);
                          navigate("/security-guards/new", {
                            state: {
                              hojaDeVida: pendiente.campos,
                              hojaDeVidaArchivo: pendiente.archivo,
                            },
                          });
                        }}
                      >
                        <Check size={15} />
                        {t("vigia.cvOpen", "Abrir el alta con estos datos")}
                      </button>
                      <button
                        className="cg-focus rounded-xl px-3 py-2 text-sm"
                        style={{ color: "var(--muted-foreground)" }}
                        onClick={() => setCvPendiente(null)}
                      >
                        {t("actions.discard", "Descartar")}
                      </button>
                    </div>
                  </div>
                )}

                {propuesta && (
                  <div
                    className="rounded-2xl border px-3 py-3"
                    style={{
                      borderColor: "var(--brand)",
                      background:
                        "color-mix(in oklab, var(--brand) 8%, transparent)",
                    }}
                  >
                    <p
                      className="mb-2 text-xs font-bold uppercase tracking-wide"
                      style={{ color: "var(--brand-text)" }}
                    >
                      {t("vigia.proposalTitle", "Acción por confirmar")}
                    </p>
                    <p className="mb-3 text-sm">{propuesta.resumen}</p>
                    <div className="flex gap-2">
                      <button
                        ref={botonConfirmar}
                        className="cg-focus flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-[filter] hover:brightness-110 disabled:opacity-50"
                        disabled={ocupado}
                        style={{
                          background: "var(--brand)",
                          color: "var(--brand-ink)",
                        }}
                        onClick={() => confirmar(true)}
                      >
                        <Check size={15} /> {t("actions.confirm", "Confirmar")}
                      </button>
                      <button
                        className="cg-focus flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold disabled:opacity-50"
                        disabled={ocupado}
                        style={{
                          borderColor: "var(--hairline)",
                          color: "var(--ink)",
                        }}
                        onClick={() => confirmar(false)}
                      >
                        <Ban size={15} /> {t("actions.cancel", "Cancelar")}
                      </button>
                    </div>
                  </div>
                )}

                {ocupado && (
                  <div
                    className="flex items-center gap-2 px-2 text-xs"
                    role="status"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <Loader2 className="animate-spin" size={13} />{" "}
                    {t("vigia.working", "{{agente}} está trabajando…", {
                      agente: agente.nombre,
                    })}
                  </div>
                )}
                {aviso && (
                  <div
                    className="rounded-xl px-3 py-2 text-xs"
                    style={{
                      background:
                        "color-mix(in oklab, var(--warn) 14%, transparent)",
                      color: "var(--warn-text, var(--ink))",
                    }}
                  >
                    {aviso}
                  </div>
                )}
              </div>
            )}

            {/* Entrada */}
            {vista === "chat" && (
              <div
                className="flex items-center gap-2 border-t px-4 pb-3 pt-2"
                style={{ borderColor: "var(--hairline)" }}
              >
                <textarea
                  ref={entrada}
                  aria-label={t("vigia.inputAria", "Mensaje para {{agente}}", {
                    agente: agente.nombre,
                  })}
                  className="cg-input max-h-28 flex-1 resize-none px-3 py-2 text-sm"
                  disabled={ocupado}
                  placeholder={t(
                    "vigia.placeholder",
                    "Escríbele a {{agente}}…",
                    { agente: agente.nombre },
                  )}
                  rows={1}
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(112, e.target.scrollHeight) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                />
                <input
                  ref={cvInput}
                  accept=".pdf,image/*"
                  className="hidden"
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];

                    e.target.value = ""; // permite volver a elegir el mismo archivo
                    if (f) void adjuntarHojaDeVida(f);
                  }}
                />
                <button
                  aria-label={t("vigia.attachCv", "Adjuntar hoja de vida")}
                  className="cg-focus rounded-xl p-2 transition-colors hover:bg-[var(--glass-hover)] disabled:opacity-40"
                  disabled={ocupado}
                  style={{ color: "var(--muted-foreground)" }}
                  title={t("vigia.attachCv", "Adjuntar hoja de vida")}
                  onClick={() => cvInput.current?.click()}
                >
                  <Paperclip size={16} />
                </button>
                <button
                  aria-label={t("actions.send", "Enviar")}
                  className="cg-focus rounded-xl p-2 transition-[filter] hover:brightness-110 disabled:opacity-40"
                  disabled={ocupado || !texto.trim()}
                  style={{
                    background: "var(--brand)",
                    color: "var(--brand-ink)",
                  }}
                  onClick={enviar}
                >
                  <Send size={16} />
                </button>
              </div>
            )}
          </div>
          {/* La punta del escudo: remata la silueta bajo el panel. El relleno es
            un div recortado (clip-path) para poder llevar el MISMO blur del
            panel — un fill de SVG no desenfoca lo que tiene detrás. */}
          {esEscudo && (
            <div
              aria-hidden
              className="relative mx-auto shrink-0"
              style={{ width: 48, height: 14, marginTop: -1.5 }}
            >
              <div
                className="absolute inset-0"
                style={{
                  clipPath: 'path("M1 0 C10 2 19 5 24 13 C29 5 38 2 47 0 Z")',
                  background: "var(--float)",
                  backdropFilter:
                    "blur(calc(var(--blur) * 1.4)) saturate(200%)",
                  WebkitBackdropFilter:
                    "blur(calc(var(--blur) * 1.4)) saturate(200%)",
                }}
              />
              <svg
                className="absolute inset-0"
                height={14}
                viewBox="0 0 48 14"
                width={48}
              >
                <path
                  d="M1 0 C10 2 19 5 24 13 C29 5 38 2 47 0"
                  fill="none"
                  stroke="var(--hairline)"
                  strokeWidth="1"
                />
              </svg>
            </div>
          )}
        </div>
      )}
    </>
  );
}
