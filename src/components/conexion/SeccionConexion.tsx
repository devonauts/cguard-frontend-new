import { useTranslation } from "react-i18next";

import {
  EstadoDeConexionApp,
  textoDeEpisodio,
} from "@/components/conexion/EstadoDeConexionApp";
import { useConexionApp, useEpisodiosDeConexion } from "@/hooks/useConexionApp";
import { useAccionesRechazadas } from "@/hooks/useAccionesRechazadas";
import { ListaDeRechazadas } from "@/components/conexion/ListaDeRechazadas";

/**
 * Ficha del vigilante / supervisor: su conexión ahora y los huecos sin
 * conexión de las últimas 24 h. Sin teléfono registrado (nunca usó la app) no
 * pinta nada.
 */
export function SeccionConexion({
  userId,
  className = "",
}: {
  userId?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const ids = userId ? [String(userId)] : [];
  const { porUsuario } = useConexionApp(ids);
  const { episodios } = useEpisodiosDeConexion(userId);
  const estado = userId ? porUsuario.get(String(userId)) : undefined;
  const { rechazadas } = useAccionesRechazadas(userId, { activo: !!userId });

  if (!userId || (!estado && !episodios.length && !rechazadas.length)) return null;

  return (
    <section
      className={`glass-flat rounded-2xl p-4 ${className}`}
      aria-label={t("conexionApp.titulo", "Conexión")}
    >
      <h3 className="mb-2 text-sm font-semibold text-[color:var(--ink)]">
        {t("conexionApp.titulo", "Conexión")}
      </h3>
      <EstadoDeConexionApp estado={estado} mostrarConectado />
      <div className="mt-3 text-xs text-[color:var(--ink-soft)]">
        {t("conexionApp.ultimas24h", "Últimas 24 horas")}
      </div>
      {episodios.length ? (
        <ul className="mt-1 space-y-1 text-xs text-[color:var(--ink)]">
          {episodios.map((e) => (
            <li key={`${e.desde}-${e.hasta}`}>
              {textoDeEpisodio(t, e)}
              <span className="text-[color:var(--ink-soft)]">
                {" "}
                · {t("conexionApp.minutos", "{{n}} min", { n: e.minutos })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-1 text-xs text-[color:var(--ink)]">
          {t("conexionApp.sinCortes", "Sin cortes de conexión")}
        </div>
      )}
      {/* Lo que hizo sin señal y NO entró: con su motivo, para corregirlo a
          mano (una entrada fuera de horario, una visita tras la salida…). */}
      {rechazadas.length ? (
        <>
          <div className="mt-3 text-xs text-[color:var(--ink-soft)]">
            {t("conexionApp.rechazadasTitulo", "Acciones que no entraron · últimos 7 días")}
          </div>
          <div className="mt-1">
            <ListaDeRechazadas filas={rechazadas} />
          </div>
        </>
      ) : null}
    </section>
  );
}
