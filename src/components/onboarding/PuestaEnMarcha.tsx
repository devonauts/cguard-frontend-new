import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * PUESTA EN MARCHA DE UN CLIENTE: cliente → sede → puestos → vigilantes → horario.
 *
 * Un solo recorrido, el mismo en todas las pantallas por las que pasa. La ficha
 * del cliente lo enseña como aviso mientras falte algo; el asistente de la
 * sede lo lleva arriba como hilo. Cada paso sabe a dónde ir.
 */
export interface PasoDePuesta {
  clave: "cliente" | "sede" | "puestos" | "vigilantes" | "horario";
  hecho: boolean;
  /** A dónde lleva el paso cuando se toca. */
  href?: string;
  /** Una línea de detalle («2 puestos», «falta el tipo de servicio»). */
  detalle?: string;
}

const TITULOS: Record<PasoDePuesta["clave"], [string, string]> = {
  cliente: ["ui.PuestaEnMarcha.cliente", "Cliente"],
  sede: ["ui.PuestaEnMarcha.sede", "Sede"],
  puestos: ["ui.PuestaEnMarcha.puestos", "Puestos"],
  vigilantes: ["ui.PuestaEnMarcha.vigilantes", "Vigilantes"],
  horario: ["ui.PuestaEnMarcha.horario", "Horario"],
};

/** El hilo compacto: cinco pasos en una línea. */
export function HiloDePuesta({ pasos }: { pasos: PasoDePuesta[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const actual = pasos.findIndex((p) => !p.hecho);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs">
      {pasos.map((p, i) => {
        const esActual = i === actual;
        const estilo = p.hecho
          ? {
              background: "color-mix(in oklab, var(--ok) 16%, transparent)",
              color: "var(--ok-text, var(--ok))",
            }
          : esActual
            ? { background: "var(--brand)", color: "var(--brand-ink)" }
            : { background: "var(--glass-sunken)", color: "var(--ink-soft)" };

        return (
          <li key={p.clave} className="flex items-center gap-1">
            <button
              className="cg-focus inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold disabled:cursor-default"
              disabled={!p.href}
              style={estilo}
              type="button"
              onClick={() => p.href && navigate(p.href)}
            >
              {p.hecho ? (
                <Check size={12} />
              ) : (
                <span
                  className="grid h-4 w-4 place-items-center rounded-full text-[10px]"
                  style={{
                    background:
                      "color-mix(in oklab, currentColor 18%, transparent)",
                  }}
                >
                  {i + 1}
                </span>
              )}
              {t(TITULOS[p.clave][0], TITULOS[p.clave][1])}
            </button>
            {i < pasos.length - 1 && (
              <ChevronRight size={12} style={{ color: "var(--ink-faint)" }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** El aviso de la ficha del cliente: qué falta y un botón para seguir. */
export function AvisoDePuesta({ pasos }: { pasos: PasoDePuesta[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pendiente = pasos.find((p) => !p.hecho);

  if (!pendiente) return null;
  const hechos = pasos.filter((p) => p.hecho).length;
  const TEXTO: Record<PasoDePuesta["clave"], [string, string, string, string]> =
    {
      cliente: [
        "ui.PuestaEnMarcha.faltaCliente",
        "Falta completar el cliente",
        "ui.PuestaEnMarcha.irCliente",
        "Completar cliente",
      ],
      sede: [
        "ui.PuestaEnMarcha.faltaSede",
        "Falta configurar la sede: qué servicio se presta y con qué",
        "ui.PuestaEnMarcha.irSede",
        "Configurar la sede",
      ],
      puestos: [
        "ui.PuestaEnMarcha.faltaPuestos",
        "Falta crear los puestos de vigilancia y decir cuántas horas cubre cada uno",
        "ui.PuestaEnMarcha.irPuestos",
        "Crear los puestos",
      ],
      vigilantes: [
        "ui.PuestaEnMarcha.faltaVigilantes",
        "Falta asignar vigilantes a los puestos",
        "ui.PuestaEnMarcha.irVigilantes",
        "Asignar vigilantes",
      ],
      horario: [
        "ui.PuestaEnMarcha.faltaHorario",
        "Falta cuadrar el horario: rotaciones, francos y quién cubre",
        "ui.PuestaEnMarcha.irHorario",
        "Abrir el Planificador",
      ],
    };
  const [kFalta, falta, kIr, ir] = TEXTO[pendiente.clave];

  return (
    <div
      className="glass flex flex-wrap items-center gap-3 p-4"
      style={{ borderColor: "var(--brand-line)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {t("ui.PuestaEnMarcha.titulo", {
            defaultValue: "Puesta en marcha · {{hechos}} de {{total}}",
            hechos,
            total: pasos.length,
          })}
        </p>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(kFalta, falta)}
          {pendiente.detalle ? ` · ${pendiente.detalle}` : ""}
        </p>
        <div className="mt-2">
          <HiloDePuesta pasos={pasos} />
        </div>
      </div>
      {pendiente.href && (
        <Button
          size="sm"
          variant="brand"
          onClick={() => navigate(pendiente.href!)}
        >
          {t(kIr, ir)} <ChevronRight size={14} />
        </Button>
      )}
    </div>
  );
}
