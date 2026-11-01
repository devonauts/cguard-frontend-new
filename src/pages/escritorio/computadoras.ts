/**
 * The pure part of the desktop screens: how the list of computers is split,
 * how each one is described, and where the person is in the 3-step guide.
 * No React here, so it is tested without a browser.
 */
import type { DesktopDevice, DesktopDownload } from "@/lib/api/desktopService";
import type { ChipDelMac, SistemaDelEquipo } from "@/lib/sistemaDelEquipo";

export interface Grupos {
  pendientes: DesktopDevice[];
  aprobadas: DesktopDevice[];
  cerradas: DesktopDevice[];
  mias: DesktopDevice[];
}

const fecha = (v: string | null) => (v ? Date.parse(v) || 0 : 0);

/** Newest first, by the most meaningful moment of each status. */
function momento(d: DesktopDevice): number {
  if (d.status === "approved")
    return fecha(d.lastSeenAt) || fecha(d.decidedAt) || fecha(d.requestedAt);
  if (d.status === "revoked") return fecha(d.revokedAt) || fecha(d.decidedAt);
  if (d.status === "rejected")
    return fecha(d.decidedAt) || fecha(d.requestedAt);

  return fecha(d.requestedAt);
}

const porMomento = (a: DesktopDevice, b: DesktopDevice) =>
  momento(b) - momento(a);

export function agrupar(
  lista: DesktopDevice[],
  miUsuario: string | null | undefined,
): Grupos {
  const ordenada = [...lista].sort(porMomento);
  const yo = String(miUsuario ?? "");

  return {
    // The oldest request first: it has been waiting longest.
    pendientes: ordenada.filter((d) => d.status === "pending").reverse(),
    aprobadas: ordenada.filter((d) => d.status === "approved"),
    cerradas: ordenada.filter(
      (d) => d.status === "rejected" || d.status === "revoked",
    ),
    // The server's `mine` wins; the user id is the fallback.
    mias: ordenada.filter((d) =>
      d.mine !== null && d.mine !== undefined
        ? d.mine
        : !!yo && d.userId === yo,
    ),
  };
}

/** «macOS 14.5 · Apple silicon», «Windows 11 · x64». Product names, not text. */
export function describirSistema(
  d: Pick<DesktopDevice, "platform" | "osVersion" | "arch">,
): string {
  const so =
    d.platform === "darwin"
      ? "macOS"
      : d.platform === "win32"
        ? "Windows"
        : d.platform || "";
  const arq =
    d.platform === "darwin"
      ? d.arch === "arm64"
        ? "Apple silicon"
        : d.arch === "x64"
          ? "Intel"
          : d.arch
      : d.arch;

  return [[so, d.osVersion].filter(Boolean).join(" "), arq]
    .filter(Boolean)
    .join(" · ");
}

/** What a person may do with a row. The server checks it again. */
export function accionesPermitidas(
  d: DesktopDevice,
  o: { administra: boolean; esMia: boolean },
): Array<"approve" | "reject" | "revoke"> {
  if (d.status === "pending") return o.administra ? ["approve", "reject"] : [];
  if (d.status === "approved") return o.administra || o.esMia ? ["revoke"] : [];

  return [];
}

/* ── The 3-step guide ───────────────────────────────────────────────────── */

export type EstadoDePaso = "hecho" | "actual" | "pendiente";

export interface Asistente {
  pasos: [EstadoDePaso, EstadoDePaso, EstadoDePaso];
  /** The request waiting for approval, if any (its code is shown on step 3). */
  pendiente: DesktopDevice | null;
  /** A computer of this person already approved. */
  lista: boolean;
}

/**
 * Where this person is:
 *   · an approved computer        → all three done;
 *   · a request waiting           → install + sign-in done, approval current;
 *   · running inside the app      → install done, sign-in current;
 *   · nothing yet                 → install current.
 * Rejected/revoked computers do not count: they start over.
 */
export function estadoDelAsistente(
  mias: DesktopDevice[],
  enEscritorio = false,
): Asistente {
  const aprobada = mias.find((d) => d.status === "approved") ?? null;
  const pendiente = mias.find((d) => d.status === "pending") ?? null;

  if (aprobada)
    return { pasos: ["hecho", "hecho", "hecho"], pendiente: null, lista: true };
  if (pendiente)
    return { pasos: ["hecho", "hecho", "actual"], pendiente, lista: false };
  if (enEscritorio)
    return {
      pasos: ["hecho", "actual", "pendiente"],
      pendiente: null,
      lista: false,
    };

  return {
    pasos: ["actual", "pendiente", "pendiente"],
    pendiente: null,
    lista: false,
  };
}

/* ── The hero's download choice ─────────────────────────────────────────── */

export interface Eleccion {
  /** The installer to offer first, or null when this computer has none. */
  principal: DesktopDownload | null;
  /** On a Mac whose chip could not be told: both, Apple silicon first. */
  alternativa: DesktopDownload | null;
  /** The rest, as secondary options. */
  otras: DesktopDownload[];
}

const clave = (d: Pick<DesktopDownload, "platform" | "arch">) =>
  `${d.platform}/${d.arch}`;

/** The three installers the program ships, in display order. */
export const CATALOGO: Array<Pick<DesktopDownload, "platform" | "arch">> = [
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "win32", arch: "x64" },
];

/** Every installer of the catalog, filled with what the server said (missing = not available). */
export function completarCatalogo(
  descargas: DesktopDownload[],
): DesktopDownload[] {
  const por = new Map(descargas.map((d) => [clave(d), d]));

  return CATALOGO.map(
    (c) =>
      por.get(clave(c)) ?? {
        ...c,
        version: null,
        size: null,
        available: false,
      },
  ) as DesktopDownload[];
}

export function elegirDescarga(
  descargas: DesktopDownload[],
  sistema: SistemaDelEquipo,
  chip: ChipDelMac,
): Eleccion {
  const todas = completarCatalogo(descargas);
  const buscar = (platform: string, arch: string) =>
    todas.find((d) => d.platform === platform && d.arch === arch) ?? null;
  let principal: DesktopDownload | null = null;
  let alternativa: DesktopDownload | null = null;

  if (sistema === "mac") {
    if (chip === "x64") principal = buscar("darwin", "x64");
    else if (chip === "arm64") principal = buscar("darwin", "arm64");
    else {
      principal = buscar("darwin", "arm64");
      alternativa = buscar("darwin", "x64");
    }
  } else if (sistema === "windows") {
    principal = buscar("win32", "x64");
  }
  const usadas = new Set(
    [principal, alternativa].filter(Boolean).map((d) => clave(d!)),
  );

  return {
    principal,
    alternativa,
    otras: todas.filter((d) => !usadas.has(clave(d))),
  };
}

/** Nothing downloadable yet (the server has no installer published). */
export function sinDescargas(descargas: DesktopDownload[]): boolean {
  return !descargas.some((d) => d.available);
}

/* ── Why the downloads could not be offered ─────────────────────────────── */

export type FalloDeDescargas = "suspendida" | "noElegible" | "red";

/**
 * The server refuses downloads to a company that is not active (paywall,
 * suspended: 402, or 403 with a subscription/payment code) and to accounts
 * that are not office users (403). Anything else is a connection problem.
 */
export function clasificarFallo(
  status: unknown,
  code?: unknown,
): FalloDeDescargas {
  const s = Number(status);
  const c = String(code ?? "");

  if (s === 402 || /subscription|payment|suspend|blocked|paused/i.test(c))
    return "suspendida";
  if (s === 403 || s === 401) return "noElegible";

  return "red";
}

/** 409 `desktop.invalidTransition` (in `code` or `messageCode`). */
export function esCambioDeEstado(e: any): boolean {
  const d = e?.data ?? e?.details;

  return (
    Number(e?.status) === 409 &&
    !!d &&
    (d.code === "desktop.invalidTransition" ||
      d.messageCode === "desktop.invalidTransition")
  );
}
