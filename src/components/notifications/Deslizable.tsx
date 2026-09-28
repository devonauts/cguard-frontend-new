import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";

import { alSoltar, desplazamiento, ejeDelGesto, type Eje } from "@/lib/deslizar";

/**
 * Una fila que se desliza a la IZQUIERDA para quitarla, como en el iPhone.
 * Funciona con el dedo y con el ratón (punteros), y deja pasar el desplazamiento
 * vertical de la lista (`touch-action: pan-y`).
 *
 * Mientras se arrastra aparece detrás el fondo rojo con «Borrar». Al soltar,
 * `alSoltar` decide: se va por la izquierda y se llama a `onQuitar`, o vuelve.
 * Si hubo arrastre, el clic que el navegador dispara al soltar se anula: quitar
 * un aviso no puede abrirlo a la vez.
 */
export function Deslizable({
  onQuitar,
  children,
}: {
  onQuitar: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [dx, setDx] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [yendose, setYendose] = useState(false);
  const inicio = useRef<{ x: number; y: number; t: number; ancho: number } | null>(null);
  const eje = useRef<Eje>(null);
  const huboArrastre = useRef(false);

  const soltar = (x: number) => {
    const i = inicio.current;

    inicio.current = null;
    setArrastrando(false);
    if (!i || eje.current !== "horizontal") return;
    const d = desplazamiento(x - i.x);

    if (alSoltar(d, i.ancho, performance.now() - i.t) === "quitar") {
      setYendose(true);
      setDx(-i.ancho);
      window.setTimeout(onQuitar, 180);
    } else {
      setDx(0);
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Lo que asoma detrás al arrastrar. */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end gap-1.5 pr-5 text-xs font-semibold"
        style={{
          background: "var(--bad)",
          color: "oklch(1 0 0)",
          opacity: dx < 0 ? 1 : 0,
        }}
      >
        <Trash2 className="h-4 w-4" />
        {t("ui.NotificationsPanel.borrar", "Borrar")}
      </div>
      <div
        style={{
          transform: `translateX(${dx}px)`,
          transition: arrastrando ? "none" : "transform 180ms ease-out",
          touchAction: "pan-y",
          background: "var(--glass-solid)",
          opacity: yendose ? 0.6 : 1,
        }}
        onClickCapture={(e) => {
          if (huboArrastre.current) {
            e.preventDefault();
            e.stopPropagation();
            huboArrastre.current = false;
          }
        }}
        onPointerCancel={() => {
          inicio.current = null;
          setArrastrando(false);
          setDx(0);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          inicio.current = {
            x: e.clientX,
            y: e.clientY,
            t: performance.now(),
            ancho: e.currentTarget.getBoundingClientRect().width,
          };
          eje.current = null;
          huboArrastre.current = false;
        }}
        onPointerMove={(e) => {
          const i = inicio.current;

          if (!i) return;
          if (!eje.current) {
            eje.current = ejeDelGesto(e.clientX - i.x, e.clientY - i.y);
            if (eje.current === "vertical") {
              inicio.current = null;

              return;
            }
            if (eje.current === "horizontal") {
              e.currentTarget.setPointerCapture(e.pointerId);
              setArrastrando(true);
            }
          }
          if (eje.current === "horizontal") {
            huboArrastre.current = true;
            setDx(desplazamiento(e.clientX - i.x));
          }
        }}
        onPointerUp={(e) => soltar(e.clientX)}
      >
        {children}
      </div>
    </div>
  );
}

export default Deslizable;
