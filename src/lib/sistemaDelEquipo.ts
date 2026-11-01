/**
 * Which installer fits the computer this page is open on.
 *
 * The operating system is easy (user agent / `navigator.platform`). The Mac's
 * chip is not: every browser on an Apple-silicon Mac still says «Intel Mac OS
 * X». Two hints exist and both are best-effort:
 *   · Chromium's `userAgentData.getHighEntropyValues(["architecture"])` → "arm";
 *   · the WebGL renderer name ("Apple M1", "Apple GPU"), which Intel Macs do not
 *     report.
 * When neither says anything the page asks the person (Apple silicon is the
 * default choice: every Mac sold since 2021).
 */

export type SistemaDelEquipo = "mac" | "windows" | "otro";
export type ChipDelMac = "arm64" | "x64" | null;

/** Operating system from the user agent and `navigator.platform`. */
export function sistemaDesdeAgente(
  ua: string,
  plataforma = "",
): SistemaDelEquipo {
  const a = `${ua} ${plataforma}`;

  // iPhone/iPad also say «Mac OS X»: they cannot install a desktop program.
  if (/iPhone|iPad|iPod|Android/i.test(a)) return "otro";
  if (/Mac/i.test(a)) return "mac";
  if (/Win/i.test(a)) return "windows";

  return "otro";
}

/**
 * The Mac's chip from the two hints. `arquitectura` = the high-entropy value
 * ("arm" | "x86" | ""), `renderer` = the unmasked WebGL renderer name.
 */
export function chipDesdePistas(
  arquitectura: string | null | undefined,
  renderer: string | null | undefined,
): ChipDelMac {
  const arq = String(arquitectura || "").toLowerCase();

  if (arq === "arm") return "arm64";
  if (arq === "x86") {
    // Rosetta-translated Chromium reports x86 on Apple silicon; the GPU does not lie.
    return /Apple (M\d|GPU)/i.test(String(renderer || "")) ? "arm64" : "x64";
  }
  const r = String(renderer || "");

  if (/Apple (M\d|GPU)/i.test(r)) return "arm64";
  if (/Intel|AMD|Radeon|NVIDIA/i.test(r)) return "x64";

  return null;
}

function rendererWebGL(): string | null {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") ||
      c.getContext("experimental-webgl")) as WebGLRenderingContext | null;

    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");

    return ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "")
      : null;
  } catch {
    return null;
  }
}

/** Reads this browser's hints (async: the high-entropy values are). */
export async function detectarEquipo(): Promise<{
  sistema: SistemaDelEquipo;
  chip: ChipDelMac;
}> {
  const nav: any = typeof navigator !== "undefined" ? navigator : {};
  const sistema = sistemaDesdeAgente(
    String(nav.userAgent || ""),
    String(nav.platform || ""),
  );

  if (sistema !== "mac")
    return { sistema, chip: sistema === "windows" ? "x64" : null };
  let arquitectura: string | null = null;

  try {
    const v = await nav.userAgentData?.getHighEntropyValues?.(["architecture"]);

    arquitectura = typeof v?.architecture === "string" ? v.architecture : null;
  } catch {
    arquitectura = null;
  }

  return { sistema, chip: chipDesdePistas(arquitectura, rendererWebGL()) };
}

/** «85 MB» — sizes of installers, never smaller than 1 MB. */
export function tamanoLegible(
  bytes: number | null | undefined,
  locale = "es",
): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = Math.max(1, Math.round(bytes / (1024 * 1024)));

  return `${mb.toLocaleString(locale)} MB`;
}
