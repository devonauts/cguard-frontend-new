import type { MapEntity } from "../types";

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Panel } from "./Panel";

import { useConexionApp } from "@/hooks/useConexionApp";
import { useAccionesRechazadas } from "@/hooks/useAccionesRechazadas";
import { ListaDeRechazadas } from "@/components/conexion/ListaDeRechazadas";
import { textoDePendientes } from "@/components/conexion/EstadoDeConexionApp";
import { soloHora } from "@/lib/horaDeLaEmpresa";

/** Quién es cada persona de las apps en el mapa, para nombrarla aquí. */
function personasDelMapa(
  entities: MapEntity[],
): Map<string, { nombre: string; ruta: string }> {
  const m = new Map<string, { nombre: string; ruta: string }>();

  for (const e of entities) {
    if (e.kind === "guard" && e.meta?.userId) {
      const gid = e.meta?.entityId || e.id.replace(/^g-/, "");

      m.set(String(e.meta.userId), {
        nombre: e.label,
        ruta: `/guards/${gid}/dispositivo`,
      });
    } else if (e.kind === "supervisor" && e.id.startsWith("sup-")) {
      const uid = e.id.slice(4);

      m.set(uid, { nombre: e.label, ruta: `/supervisors/${uid}` });
    }
  }

  return m;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SIN SEÑAL — lo que la central tiene que saber de los teléfonos sin cobertura
 *
 *  · Quién de los que están EN EL MAPA (en turno) perdió la conexión (venía
 *    mandando GPS y calló; la app cerrada no cuenta), desde cuándo, y cuántas
 *    acciones lleva guardadas en el teléfono.
 *  · Lo que llegó tarde y NO entró (rechazado por el servidor, con su motivo)
 *    o que la persona quitó del teléfono sin enviar. Antes se perdía sin
 *    rastro; ahora operaciones lo ve y lo corrige a mano.
 *
 * Se actualiza con `presencia:update` y con el reloj del umbral (ver
 * useConexionApp): sin sondeos.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function PanelSinSenal({ entities }: { entities: MapEntity[] }) {
  const { t } = useTranslation();
  const { porUsuario } = useConexionApp();
  const { rechazadas } = useAccionesRechazadas();
  const personas = useMemo(() => personasDelMapa(entities), [entities]);

  const sinConexion = useMemo(
    () =>
      Array.from(porUsuario.values())
        .filter((e) => e.perdioConexion && personas.has(String(e.userId)))
        .sort(
          (a, b) => new Date(a.desde).getTime() - new Date(b.desde).getTime(),
        ),
    [porUsuario, personas],
  );
  const conPendientes = useMemo(
    () =>
      Array.from(porUsuario.values()).filter(
        (e) =>
          e.conectado &&
          (e.pendientes || 0) > 0 &&
          personas.has(String(e.userId)),
      ),
    [porUsuario, personas],
  );

  if (!sinConexion.length && !conPendientes.length && !rechazadas.length)
    return null;

  return (
    <Panel
      icon={<WifiOff />}
      subtitle={t(
        "conexionApp.panelSub",
        "Teléfonos sin conexión y lo que no entró",
      )}
      title={t("conexionApp.panelTitulo", "Sin señal")}
      tone={sinConexion.length || rechazadas.length ? "bad" : undefined}
    >
      {sinConexion.length || conPendientes.length ? (
        <ul className="space-y-1.5 text-xs">
          {[...sinConexion, ...conPendientes].map((e) => {
            const p = personas.get(String(e.userId))!;
            const pend = textoDePendientes(t, e.pendientes);

            return (
              <li
                key={e.userId}
                className="flex flex-wrap items-baseline gap-x-1"
              >
                <Link
                  className="font-semibold text-[color:var(--ink)] hover:underline"
                  to={p.ruta}
                >
                  {p.nombre}
                </Link>
                <span
                  style={{
                    color: e.conectado ? "var(--ink-soft)" : "var(--bad-text)",
                  }}
                >
                  {e.conectado
                    ? t("conexionApp.conConexion", "Con conexión")
                    : t(
                        "conexionApp.sinConexionDesde",
                        "Sin conexión desde {{hora}}",
                        { hora: soloHora(e.desde) },
                      )}
                </span>
                {pend ? (
                  <span className="font-semibold text-[color:var(--warn-text)]">
                    · {pend}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="text-xs text-[color:var(--ink-soft)]">
          {t(
            "conexionApp.todosConectados",
            "Todos los teléfonos en turno tienen conexión",
          )}
        </div>
      )}
      {rechazadas.length ? (
        <>
          <div className="mt-3 mb-1 text-xs text-[color:var(--ink-soft)]">
            {t(
              "conexionApp.rechazadasTitulo",
              "Acciones que no entraron · últimos 7 días",
            )}
          </div>
          <ListaDeRechazadas conNombre filas={rechazadas} max={8} />
        </>
      ) : null}
    </Panel>
  );
}
