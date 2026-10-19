import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Megaphone, X, AlertTriangle, Info, Wrench, ExternalLink, Activity } from "lucide-react";

import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import {
  acusar,
  cargarAvisos,
  conMarca,
  EVENTO,
  faseDeMantenimiento,
  type Aviso as AvisoDelServidor,
  type FaseDeMantenimiento,
} from "@/lib/anuncios/anuncios";
import { fechaYHora, soloHora } from "@/lib/horaDeLaEmpresa";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AVISOS DE LA PLATAFORMA — lo que la casa quiere decirle a esta empresa.
 *
 * Mantenimiento del domingo, función nueva, cambio de precio. Llega aquí, al
 * escritorio de quien administra, y no por push al móvil del vigilante: no es
 * el mismo lector ni la misma decisión.
 *
 * Un aviso CRÍTICO no se puede cerrar; los demás sí, y el descarte se recuerda
 * por id en este navegador. Obligar a leer cada mañana el mismo aviso de
 * novedades es la forma más rápida de que dejen de leerse todos.
 *
 * ── CARTAS DE MANTENIMIENTO ───────────────────────────────────────────────
 * Un aviso de tipo `maintenance` no trae texto: trae la ventana (inicio y
 * fin), las piezas afectadas y el motivo. Aquí se redacta en el idioma de
 * quien mira y en la hora de SU empresa, y cambia solo de fase con el reloj:
 * programado → empieza en N min → en curso → terminado. Cada fase se puede
 * cerrar por separado (cerrar «programado» no esconde «en curso»).
 *
 * Falla en silencio: si la plataforma no responde, aquí no se pinta nada. Un
 * aviso roto no puede estropearle la pantalla a nadie.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Aviso = AvisoDelServidor;

const DESCARTADOS = "cg_avisos_descartados";

const leerDescartados = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DESCARTADOS) || "[]");
  } catch {
    return [];
  }
};

/** La llave con la que se recuerda un cierre: por fase en las cartas de mantenimiento, por línea en los incidentes. */
const llaveDeCierre = (a: Aviso, fase?: FaseDeMantenimiento) =>
  a.kind === "maintenance" ? `${a.id}:${fase || a.phase || ""}`
    : a.kind === "incident" ? `${a.id}:${a.lastUpdate?.at || a.status || ""}`
      : a.id;

export default function PlatformAnnouncements() {
  const { t } = useTranslation();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [cerrados, setCerrados] = useState<string[]>(() => leerDescartados());
  // El reloj de las cartas: la fase y la cuenta atrás se recalculan cada 30 s.
  const [ahora, setAhora] = useState(() => Date.now());

  // La marca del anfitrión: en el dominio de un socio, su nombre (nunca el nuestro).
  const marca = useWhiteLabel()?.platformName || "";

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const rows = (await cargarAvisos()).filter((a) => a.format !== "popup");
      if (!vivo) return;
      setAvisos(rows as Aviso[]);
    };
    void cargar();
    // «Enviar ahora» desde el superadmin: aparece sin recargar.
    const alLlegar = () => void cargar();
    window.addEventListener(EVENTO, alLlegar);
    const reloj = window.setInterval(() => setAhora(Date.now()), 30_000);

    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, alLlegar);
      window.clearInterval(reloj);
    };
  }, []);

  const cerrar = (a: Aviso, llave: string) => {
    setCerrados((prev) => [...new Set([...prev, llave])].slice(-80));
    // En el servidor: así no vuelve en otro equipo, y el superadmin sabe quién
    // lo cerró. Una carta de mantenimiento o un incidente no: tienen más
    // fases o líneas por delante, y cada una vuelve a salir.
    if (a.kind !== "maintenance" && a.kind !== "incident") acusar(a.id, "dismissed");
    try {
      const fuera = leerDescartados();

      localStorage.setItem(
        DESCARTADOS,
        JSON.stringify([...new Set([...fuera, llave])].slice(-80)),
      );
    } catch {
      /* privado */
    }
  };

  const visibles = avisos
    .map((a) => {
      if (a.kind === "incident") {
        // Cada línea nueva vuelve a salir; la resuelta se puede cerrar y se va sola a la media hora.
        const llave = llaveDeCierre(a);
        return cerrados.includes(llave) ? null : { a, llave, fase: undefined as FaseDeMantenimiento | undefined, cerrable: true };
      }
      if (a.kind !== "maintenance") {
        const llave = llaveDeCierre(a);
        return a.dismissible && cerrados.includes(llave) ? null : { a, llave, fase: undefined as FaseDeMantenimiento | undefined };
      }
      const fase = faseDeMantenimiento(a.startsAt, a.endsAt, new Date(ahora));
      if (fase === "expired") return null;
      const llave = llaveDeCierre(a, fase);
      // En curso no se cierra: es lo único que explica por qué algo falla.
      const cerrable = fase !== "in_progress" && a.dismissible;
      return cerrable && cerrados.includes(llave) ? null : { a, llave, fase, cerrable };
    })
    .filter(Boolean) as Array<{ a: Aviso; llave: string; fase?: FaseDeMantenimiento; cerrable?: boolean }>;

  if (!visibles.length) return null;

  const textoDeCarta = (a: Aviso, fase: FaseDeMantenimiento) => {
    const inicio = fechaYHora(a.startsAt);
    const fin = soloHora(a.endsAt);
    const finLargo = fechaYHora(a.endsAt);
    const duracion = a.startsAt && a.endsAt
      ? Math.max(1, Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000))
      : 0;
    const minutos = a.startsAt ? Math.max(1, Math.ceil((new Date(a.startsAt).getTime() - ahora) / 60_000)) : 0;
    if (fase === "scheduled") return t("anuncios.mantenimiento.programado", { inicio, fin, duracion });
    if (fase === "starting") return t("anuncios.mantenimiento.empiezaPronto", { minutos, inicio: soloHora(a.startsAt), fin });
    if (fase === "in_progress") return t("anuncios.mantenimiento.enCurso", { fin });
    return t("anuncios.mantenimiento.terminado", { fin: finLargo });
  };

  const piezas = (a: Aviso) =>
    (a.affects || []).map((p) => t(`anuncios.mantenimiento.piezas.${p}`)).join(", ");

  /** El incidente: el paso, qué se afecta y la última línea escrita por la casa. */
  const textoDeIncidente = (a: Aviso) => {
    const partes: string[] = [];
    if (a.status === "resolved") partes.push(t("anuncios.incidente.resuelto", { fecha: fechaYHora(a.resolvedAt || a.lastUpdate?.at) }));
    else partes.push(a.affects?.length ? t("anuncios.incidente.texto", { piezas: piezas(a) }) : t("anuncios.incidente.textoGeneral"));
    if (a.lastUpdate?.text) partes.push(t("anuncios.incidente.linea", { hora: soloHora(a.lastUpdate.at), texto: conMarca(a.lastUpdate.text, marca) }));
    return partes.join(" ");
  };

  return (
    <div className="mb-4 space-y-2">
      {visibles.map(({ a, llave, fase, cerrable }) => {
        const esCarta = a.kind === "maintenance" && !!fase;
        const esIncidente = a.kind === "incident";
        const incidenteAbierto = esIncidente && a.status !== "resolved";
        const critico = a.level === "critical" || (esCarta && fase === "in_progress") || incidenteAbierto;
        const aviso = a.level === "warning" || (esCarta && fase === "starting") || (esIncidente && !incidenteAbierto);
        const puedeCerrar = esCarta || esIncidente ? !!cerrable : a.dismissible;

        return (
          <div
            key={llave}
            className="flex items-start gap-3 rounded-xl border px-4 py-3"
            role={critico ? "alert" : "status"}
            style={{
              borderColor: critico
                ? "var(--danger, #dc2626)"
                : aviso
                  ? "var(--warning, #d97706)"
                  : "var(--hairline)",
              background: critico
                ? "color-mix(in oklab, var(--danger, #dc2626) 8%, transparent)"
                : aviso
                  ? "color-mix(in oklab, var(--warning, #d97706) 8%, transparent)"
                  : "var(--float)",
            }}
          >
            <span className="mt-0.5 shrink-0">
              {esCarta ? (
                <Wrench size={16} />
              ) : esIncidente ? (
                <Activity size={16} />
              ) : critico ? (
                <AlertTriangle size={16} />
              ) : aviso ? (
                <Info size={16} />
              ) : (
                <Megaphone size={16} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {conMarca(a.title, marca)}
                {esIncidente && (
                  <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
                    {t(`anuncios.incidente.estado.${a.status || "investigating"}`)}
                  </span>
                )}
              </p>
              {esIncidente ? (
                <p className="text-sm opacity-80">
                  {textoDeIncidente(a)}
                  {a.statusUrl && (
                    <>
                      {" "}
                      <a
                        href={a.statusUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline opacity-90 hover:opacity-100"
                      >
                        {t("anuncios.mantenimiento.verEstado")} <ExternalLink size={12} />
                      </a>
                    </>
                  )}
                </p>
              ) : esCarta ? (
                <p className="text-sm opacity-80">
                  {textoDeCarta(a, fase!)}
                  {a.affects?.length ? ` ${t("anuncios.mantenimiento.afecta", { piezas: piezas(a) })}` : ""}
                  {a.reason ? ` ${t("anuncios.mantenimiento.motivo", { motivo: conMarca(a.reason, marca) })}` : ""}
                  {a.statusUrl && (
                    <>
                      {" "}
                      <a
                        href={a.statusUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline opacity-90 hover:opacity-100"
                      >
                        {t("anuncios.mantenimiento.verEstado")} <ExternalLink size={12} />
                      </a>
                    </>
                  )}
                </p>
              ) : (
                <p className="whitespace-pre-wrap text-sm opacity-80">{conMarca(a.body, marca)}</p>
              )}
            </div>
            {puedeCerrar && (
              <button
                aria-label={t("ui.PlatformAnnouncements.cerrarAviso", "Cerrar aviso")}
                className="cg-focus shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                onClick={() => cerrar(a, llave)}
              >
                <X size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
