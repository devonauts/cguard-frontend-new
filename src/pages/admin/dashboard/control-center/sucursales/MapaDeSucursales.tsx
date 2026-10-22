import type { MapEntity } from "../types";
import type { DashboardPrefs } from "../prefs";
import type { MapCenter } from "../defaultCenter";
import type {
  ListaDeSucursales,
  ResumenDeSucursales,
} from "@/lib/api/sucursalesService";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Globe2,
  LogIn,
  Map as MapIcon,
  Settings2,
} from "lucide-react";

import { OperationsMap } from "../components/OperationsMap";
import { Panel } from "../components/Panel";

import { CarruselDeSucursales } from "./CarruselDeSucursales";
import { GLOBAL, useParadas, type Parada } from "./paradas";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useEspacio } from "@/hooks/useEspacio";
import { sucursalElegida } from "@/lib/sucursalElegida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL MAPA DE SUCURSALES — UN mapa que viaja (Sucursales 2.0, fase 3)
 *
 * Mike: «el mapa debe tener el mapa global, y cuando hacemos swipe sale la
 * ciudad uno, ciudad dos». Arranca en la VISTA GLOBAL (todas las sedes) y, al
 * deslizar la tira de abajo, la cámara vuela a cada ciudad. También con las
 * flechas del panel, los puntos, las teclas ← → o tocando una tarjeta.
 *
 * ── POR QUÉ UN SOLO MAPA ─────────────────────────────────────────────────
 * El carrusel de antes montaba un mapa por tarjeta y el panel ya se congeló
 * una vez por exceso de nodos. Aquí hay UN mapa con TODO pintado y sólo se
 * mueve la cámara (`encuadre`, con la transición del motor del mapa).
 *
 * Dentro de una sucursal (espacio elegido en la barra) no hay paradas: el mapa
 * se queda en ella. Organizar (crear, editar, mover sedes, accesos) abre el
 * carrusel de siempre en su modo organizar, y «Listo» vuelve aquí.
 *
 * La parada puede llevarla quien está fuera (la comparativa de abajo mueve el
 * mapa al tocar una fila): `parada` + `onParada`.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function MapaDeSucursales({
  lista,
  resumen,
  entities,
  prefs,
  defaultCenter,
  live,
  className,
  parada,
  onParada,
}: {
  lista: ListaDeSucursales;
  resumen?: ResumenDeSucursales;
  entities: MapEntity[];
  prefs: DashboardPrefs;
  defaultCenter?: MapCenter;
  live?: boolean;
  className?: string;
  parada?: string;
  onParada?: (clave: string) => void;
}) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { entrar } = useEspacio();
  const [organizando, setOrganizando] = useState(false);
  const todas = useParadas(lista, resumen, entities);
  // Trabajando dentro de una sucursal: sólo ella.
  const elegida = sucursalElegida();
  const paradas =
    elegida && todas.some((p) => p.clave === elegida)
      ? todas.filter((p) => p.clave === elegida)
      : todas;

  const [propia, setPropia] = useState<string>(GLOBAL);
  const clave = parada ?? propia;
  const indice = Math.max(
    0,
    paradas.findIndex((p) => p.clave === clave),
  );
  const actual: Parada | undefined = paradas[indice];
  const ir = (k: string) => (onParada ? onParada(k) : setPropia(k));
  const mover = (d: 1 | -1) => {
    if (!paradas.length) return;
    ir(paradas[(indice + d + paradas.length) % paradas.length].clave);
  };

  // ← → desde cualquier cosa enfocada dentro del mapa (tarjetas, puntos).
  const caja = useRef<HTMLDivElement>(null);
  const moverRef = useRef(mover);

  moverRef.current = mover;
  useEffect(() => {
    const el = caja.current;

    if (!el) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moverRef.current(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moverRef.current(-1);
      }
    };

    el.addEventListener("keydown", tecla);

    return () => el.removeEventListener("keydown", tecla);
  }, [organizando]);

  // La tira sigue a la parada (si cambió desde fuera, desde una flecha o un punto).
  const tira = useRef<HTMLDivElement>(null);
  const deslizando = useRef(false);
  const primera = useRef(true);
  /* Sólo un dedo, un ratón o un trackpad mueven la parada al deslizar. Un
     desplazamiento que no viene de la persona (el anclaje del navegador al
     cargar, el desplazamiento de las flechas) no cambia de ciudad: al cargar,
     la tira acababa al final y el panel arrancaba en la última ciudad. */
  const tocado = useRef(0);
  const marcarToque = () => {
    tocado.current = Date.now();
  };

  useEffect(() => {
    const cont = tira.current;
    const el = cont?.children[indice] as HTMLElement | undefined;

    if (!cont || !el || deslizando.current) return;
    // Sin `scrollIntoView`: movería también la página entera.
    const destino = el.offsetLeft + el.offsetWidth / 2 - cont.clientWidth / 2;

    cont.scrollTo({
      left: Math.max(0, destino),
      behavior: primera.current ? "auto" : "smooth",
    });
    primera.current = false;
  }, [indice]);

  // Y la parada sigue a la tira cuando se desliza con el dedo o el trackpad.
  const reloj = useRef<number | null>(null);
  const alDeslizar = () => {
    if (Date.now() - tocado.current > 1500) return;
    deslizando.current = true;
    if (reloj.current) window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => {
      const el = tira.current;

      if (el) {
        const centro = el.scrollLeft + el.clientWidth / 2;
        let mejor = 0;
        let dist = Infinity;

        Array.from(el.children).forEach((c, i) => {
          const h = c as HTMLElement;
          const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - centro);

          if (d < dist) {
            dist = d;
            mejor = i;
          }
        });
        if (paradas[mejor] && paradas[mejor].clave !== actual?.clave)
          ir(paradas[mejor].clave);
      }
      deslizando.current = false;
    }, 140);
  };

  if (organizando) {
    return (
      <CarruselDeSucursales
        organizarAlAbrir
        className={className}
        defaultCenter={defaultCenter}
        entities={entities}
        lista={lista}
        live={live}
        prefs={prefs}
        resumen={resumen}
        onSalir={() => setOrganizando(false)}
      />
    );
  }

  const nombre = (p: Parada) =>
    p.global ? t("sucursales.espacio.global") : p.nombre;

  return (
    <Panel
      action={
        <div className="flex items-center gap-1.5">
          {hasPermission("settingsEdit") && (
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setOrganizando(true)}
            >
              <Settings2 className="mr-1.5 size-3.5" />
              {t("sucursales.organizar.boton")}
            </Button>
          )}
          {paradas.length > 1 && (
            <>
              <button
                aria-label={t("sucursales.anterior")}
                className="cg-btn-glass cg-focus grid size-8 place-items-center rounded-full"
                type="button"
                onClick={() => mover(-1)}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                aria-label={t("sucursales.siguiente")}
                className="cg-btn-glass cg-focus grid size-8 place-items-center rounded-full"
                type="button"
                onClick={() => mover(1)}
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          )}
        </div>
      }
      bodyClassName="flex flex-col"
      className={className}
      icon={<MapIcon />}
      live={live}
      subtitle={
        actual
          ? actual.global
            ? t("sucursales.subtitulo", { count: paradas.length - 1 })
            : nombre(actual)
          : undefined
      }
      title={t("sucursales.mapa.titulo")}
    >
      <div
        ref={caja}
        aria-label={t("sucursales.mapa.titulo")}
        aria-roledescription="carousel"
        className="relative mt-3 flex-1 overflow-hidden rounded-2xl outline-none"
        role="group"
        style={{ minHeight: 560 }}
      >
        <div className="absolute inset-0 [&>div]:!h-full">
          <OperationsMap
            area="sucursales"
            defaultCenter={defaultCenter}
            encuadre={
              actual ? { clave: actual.clave, puntos: actual.puntos } : null
            }
            entities={entities}
            height={560}
            hud={false}
            prefs={prefs}
          />
        </div>

        {/* La tira de paradas: se desliza con el dedo; la tarjeta centrada manda. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] pb-3">
          <div
            ref={tira}
            className="pointer-events-auto flex snap-x snap-mandatory gap-3 overflow-x-auto px-[max(1rem,calc(50%-8.5rem))]"
            style={{ scrollbarWidth: "none" }}
            onPointerDown={marcarToque}
            onScroll={alDeslizar}
            onTouchStart={marcarToque}
            onWheel={marcarToque}
          >
            {paradas.map((p, i) => (
              <TarjetaDeParada
                key={p.clave}
                activa={i === indice}
                nombre={nombre(p)}
                parada={p}
                puedeEntrar={!p.global && paradas.length > 1}
                onElegir={() => ir(p.clave)}
                onEntrar={() => entrar(p.clave)}
              />
            ))}
          </div>
          {paradas.length > 1 && (
            <div className="pointer-events-auto mt-2 flex justify-center gap-1.5">
              {paradas.map((p, i) => (
                <button
                  key={p.clave}
                  aria-current={i === indice || undefined}
                  aria-label={nombre(p)}
                  className="cg-focus h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: i === indice ? 20 : 6,
                    background:
                      i === indice
                        ? p.color
                        : "color-mix(in oklab, var(--ink) 30%, transparent)",
                  }}
                  type="button"
                  onClick={() => ir(p.clave)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function TarjetaDeParada({
  parada: p,
  nombre,
  activa,
  puedeEntrar,
  onElegir,
  onEntrar,
}: {
  parada: Parada;
  nombre: string;
  activa: boolean;
  puedeEntrar: boolean;
  onElegir: () => void;
  onEntrar: () => void;
}) {
  const { t } = useTranslation();
  const c = p.cifras;

  return (
    <div
      className="cc-map-card w-[17rem] shrink-0 snap-center cursor-pointer px-3 py-2.5 transition-[transform,opacity,box-shadow] duration-300"
      role="button"
      style={{
        opacity: activa ? 1 : 0.78,
        transform: activa ? "translateY(0)" : "translateY(4px)",
        boxShadow: activa ? `inset 0 0 0 2px ${p.color}` : undefined,
      }}
      tabIndex={-1}
      onClick={onElegir}
    >
      <div className="flex items-center gap-2">
        {p.global ? (
          <Globe2
            className="size-4 shrink-0"
            style={{ color: "var(--brand-text, var(--brand))" }}
          />
        ) : (
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: p.color }}
          />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {nombre}
        </span>
        {p.principal && (
          <span
            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              background: "color-mix(in oklab, var(--brand) 16%, transparent)",
              color: "var(--brand-text, var(--brand))",
            }}
          >
            {t("sucursales.principal")}
          </span>
        )}
        {p.emergencias > 0 && (
          <span
            aria-label={t("sucursales.cifras.panicos", {
              count: p.emergencias,
            })}
            className="size-2.5 shrink-0 animate-pulse rounded-full"
            style={{ background: "var(--bad)" }}
          />
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Cifra
          etiqueta={t("sucursales.cifras.cobertura")}
          valor={p.cobertura == null ? "—" : `${p.cobertura}%`}
        />
        <Cifra
          etiqueta={t("sucursales.cifras.enTurno")}
          valor={c ? String(c.enTurno) : "—"}
        />
        <Cifra
          etiqueta={t("sucursales.cifras.estacionesCorto")}
          valor={c ? String(c.estaciones) : "—"}
        />
      </div>
      <div className="mt-1.5 flex min-h-6 items-center justify-between gap-2 text-xs">
        <span
          className="truncate"
          style={{
            color: c && c.uncovered > 0 ? "var(--bad)" : "var(--ink-faint)",
          }}
        >
          {c && c.uncovered > 0
            ? t("sucursales.cifras.sinCubrir", { count: c.uncovered })
            : t("sucursales.cifras.incidentes", {
                count: c?.incidentesAbiertos ?? 0,
              })}
        </span>
        {puedeEntrar && activa && (
          <button
            className="cg-focus inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
            style={{ color: "var(--brand-text, var(--brand))" }}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEntrar();
            }}
          >
            <LogIn className="size-3.5" />
            {t("sucursales.mapa.entrar")}
          </button>
        )}
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <div className="text-base font-semibold tabular-nums leading-tight">
        {valor}
      </div>
      <div
        className="truncate text-[10.5px]"
        style={{ color: "var(--ink-faint)" }}
      >
        {etiqueta}
      </div>
    </div>
  );
}
