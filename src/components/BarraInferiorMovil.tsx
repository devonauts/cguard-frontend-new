import { NavLink, useLocation } from "react-router-dom";
import { AlertTriangle, CalendarDays, Gauge, Menu, Radio } from "lucide-react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * BARRA INFERIOR — SÓLO EN EL TELÉFONO
 *
 * El CRM tiene un menú de 23 destinos en una barra lateral que en el móvil vive
 * escondida detrás de la hamburguesa, arriba del todo. Para cambiar de pantalla
 * había que estirar el pulgar hasta la esquina más lejana, abrir el cajón,
 * buscar en una lista larga y tocar. Cuatro gestos para ir al sitio al que se
 * va veinte veces al día.
 *
 * Esto es lo que ya hacen las apps del vigilante y del supervisor: los cuatro
 * destinos que de verdad se usan desde la calle, a la altura del pulgar, y el
 * menú completo detrás del quinto. La barra lateral no se toca — sigue siendo
 * la navegación de escritorio y el «Menú» de aquí es quien la abre.
 *
 * Por qué estos cuatro y no otros: son los que responden a lo que se pregunta
 * fuera de la oficina —quién está cubriendo (Panel), quién entra y a qué hora
 * (Horario), qué se ha disparado (Emergencias) y hablar con quien está en el
 * puesto (Radio)—. Todo lo demás es trabajo de escritorio.
 *
 * ── DETALLES QUE NO SE VEN ────────────────────────────────────────────────
 * · `safe-area-inset-bottom`: en un iPhone la franja del indicador se come los
 *   últimos ~34 px. Sin reservarlos, el último destino queda debajo del gesto
 *   de volver al inicio y es imposible de acertar.
 * · Alto de 3,5rem (56 px) en el CONTENEDOR, no en cada destino: una regla
 *   global del kit fija `min-height: 44px` en los enlaces y gana por
 *   especificidad. Por debajo de ese tamaño el objetivo táctil se falla, y una
 *   barra de navegación que se falla es peor que no tenerla.
 * · El `<main>` reserva este alto con `padding-bottom` (ver `app-layout`), o la
 *   barra tapa la última fila de cualquier lista.
 * ════════════════════════════════════════════════════════════════════════════
 */

const DESTINOS = [
  { to: "/dashboard", etiqueta: "Panel", Icono: Gauge },
  { to: "/schedule", etiqueta: "Horario", Icono: CalendarDays },
  { to: "/alarm/queue", etiqueta: "Alertas", Icono: AlertTriangle },
  { to: "/radio", etiqueta: "Radio", Icono: Radio },
];

export default function BarraInferiorMovil({
  onAbrirMenu,
}: {
  onAbrirMenu: () => void;
}) {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Navegación principal"
      className="cg-bottom-bar fixed inset-x-0 bottom-0 z-50 lg:hidden"
    >
      {/* El alto va en el CONTENEDOR: una regla global del kit fija
          `min-height: 44px` en los enlaces y gana por especificidad, así que
          ponerlo en cada destino no servía de nada (medían 44 y no 56). Desde
          aquí los hijos se estiran con `items-stretch` y no hace falta pelearse
          con `!important`. */}
      <div className="glass-raised flex min-h-[3.5rem] items-stretch border-t pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        {DESTINOS.map(({ to, etiqueta, Icono }) => {
          const activo = pathname === to || pathname.startsWith(`${to}/`);

          return (
            <NavLink
              key={to}
              className="cg-focus flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors"
              style={{
                color: activo ? "var(--brand-text)" : "var(--ink-soft)",
              }}
              to={to}
            >
              <Icono size={20} strokeWidth={activo ? 2.4 : 1.9} />
              <span className="text-[10px] font-semibold leading-none">
                {etiqueta}
              </span>
            </NavLink>
          );
        })}
        {/* El resto del CRM: abre la misma barra lateral de siempre. */}
        <button
          className="cg-focus flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors"
          style={{ color: "var(--ink-soft)" }}
          type="button"
          onClick={onAbrirMenu}
        >
          <Menu size={20} strokeWidth={1.9} />
          <span className="text-[10px] font-semibold leading-none">Menú</span>
        </button>
      </div>
    </nav>
  );
}
