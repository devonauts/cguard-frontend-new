/**
 * EL ASISTENTE DE DIVISIÓN — lo primero que ve una empresa al activar Sucursales.
 *
 * Hoy tiene su operación mezclada. El servidor propone una sucursal por ciudad
 * (juntando las formas distintas de escribirla y colocando por cercanía las
 * sedes sin ciudad). Aquí el dueño:
 *   · renombra,
 *   · JUNTA ciudades vecinas en una región (Guayaquil + Durán = «Costa»),
 *   · deja fuera un grupo (sus sedes quedan en «Sin sucursal»).
 * NADA cambia hasta pulsar «Aplicar la división».
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MapPin, Merge } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  sucursalesService,
  type GrupoPropuesto,
  type Propuesta,
} from "@/lib/api/sucursalesService";

interface Grupo {
  clave: string;
  nombre: string;
  ciudades: string[];
  siteIds: string[];
  sedes: number;
  estaciones: number;
  vigilantes: number;
  cercaDe: string[];
  incluido: boolean;
}

const desdePropuesta = (g: GrupoPropuesto): Grupo => ({ ...g, incluido: true });

export function AsistenteDeDivision({
  abierto,
  onCerrar,
  onAplicado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onAplicado: () => void;
}) {
  const { t } = useTranslation();
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setCargando(true);
    setMarcados(new Set());
    sucursalesService
      .propuesta()
      .then((p) => {
        setPropuesta(p);
        setGrupos(p.grupos.map(desdePropuesta));
      })
      .catch(() => toast.error(t("sucursales.errores.propuesta")))
      .finally(() => setCargando(false));
  }, [abierto, t]);

  const nombreDe = useMemo(
    () => new Map(grupos.map((g) => [g.clave, g.nombre])),
    [grupos],
  );

  const cambiar = (clave: string, patch: Partial<Grupo>) =>
    setGrupos((gs) =>
      gs.map((g) => (g.clave === clave ? { ...g, ...patch } : g)),
    );

  const marcar = (clave: string, v: boolean) =>
    setMarcados((m) => {
      const n = new Set(m);

      if (v) n.add(clave);
      else n.delete(clave);

      return n;
    });

  /** Junta los marcados en el primero, que pasa a ser una región. */
  const juntar = (claves: string[]) => {
    if (claves.length < 2) return;
    setGrupos((gs) => {
      const elegidos = gs.filter((g) => claves.includes(g.clave));
      const [primero, ...resto] = elegidos;
      const unido: Grupo = {
        ...primero,
        ciudades: [...new Set(elegidos.flatMap((g) => g.ciudades))],
        siteIds: elegidos.flatMap((g) => g.siteIds),
        sedes: elegidos.reduce((a, g) => a + g.sedes, 0),
        estaciones: elegidos.reduce((a, g) => a + g.estaciones, 0),
        vigilantes: elegidos.reduce((a, g) => a + g.vigilantes, 0),
        cercaDe: [],
        incluido: true,
      };
      const quitar = new Set(resto.map((g) => g.clave));

      return gs
        .filter((g) => !quitar.has(g.clave))
        .map((g) =>
          g.clave === primero.clave
            ? unido
            : { ...g, cercaDe: g.cercaDe.filter((c) => !quitar.has(c)) },
        );
    });
    setMarcados(new Set());
  };

  const incluidos = grupos.filter((g) => g.incluido);
  const fuera =
    grupos.filter((g) => !g.incluido).reduce((a, g) => a + g.sedes, 0) +
    (propuesta?.sinUbicar.length || 0);

  const aplicar = async () => {
    if (!incluidos.length) return;
    if (incluidos.some((g) => !g.nombre.trim())) {
      toast.error(t("sucursales.editor.faltaNombre"));

      return;
    }
    setAplicando(true);
    try {
      const r = await sucursalesService.aplicarDivision(
        incluidos.map((g) => ({
          nombre: g.nombre.trim(),
          ciudades: g.ciudades,
          siteIds: g.siteIds,
        })),
      );

      toast.success(
        t("sucursales.asistente.hecho", {
          count: r.sucursales,
          sedes: r.sedes,
        }),
      );
      onAplicado();
      onCerrar();
    } catch {
      toast.error(t("sucursales.errores.aplicar"));
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("sucursales.asistente.titulo")}</DialogTitle>
          <DialogDescription>
            {t("sucursales.asistente.intro")}
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <p className="py-6 text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("sucursales.asistente.calculando")}
          </p>
        ) : !propuesta || !propuesta.totalSedes ? (
          <p className="py-6 text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("sucursales.asistente.sinSedes")}
          </p>
        ) : (
          <div className="space-y-3">
            {marcados.size >= 2 && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>
                  {t("sucursales.asistente.marcadas", { count: marcados.size })}
                </span>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => juntar([...marcados])}
                >
                  <Merge className="mr-1.5 size-4" />{" "}
                  {t("sucursales.asistente.juntar")}
                </Button>
              </div>
            )}

            {grupos.map((g) => (
              <div
                key={g.clave}
                className="rounded-xl border p-3"
                style={{ opacity: g.incluido ? 1 : 0.55 }}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    aria-label={t("sucursales.asistente.marcar")}
                    checked={marcados.has(g.clave)}
                    disabled={!g.incluido}
                    onCheckedChange={(v) => marcar(g.clave, Boolean(v))}
                  />
                  <Input
                    className="h-9 flex-1"
                    disabled={!g.incluido}
                    maxLength={120}
                    value={g.nombre}
                    onChange={(e) =>
                      cambiar(g.clave, { nombre: e.target.value })
                    }
                  />
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => cambiar(g.clave, { incluido: !g.incluido })}
                  >
                    {g.incluido
                      ? t("sucursales.asistente.dejarFuera")
                      : t("sucursales.asistente.incluir")}
                  </Button>
                </div>
                <p
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" /> {g.ciudades.join(" · ")}
                  </span>
                  <span>
                    {t("sucursales.cifras.sedes", { count: g.sedes })}
                  </span>
                  <span>
                    {t("sucursales.cifras.estaciones", { count: g.estaciones })}
                  </span>
                  <span>
                    {t("sucursales.cifras.vigilantes", { count: g.vigilantes })}
                  </span>
                </p>
                {g.incluido &&
                  g.cercaDe.filter((c) => nombreDe.has(c)).length > 0 && (
                    <p className="mt-1.5 pl-7 text-xs">
                      {t("sucursales.asistente.cerca", {
                        ciudades: g.cercaDe
                          .map((c) => nombreDe.get(c))
                          .join(", "),
                      })}{" "}
                      <button
                        className="underline"
                        type="button"
                        onClick={() =>
                          juntar([
                            g.clave,
                            ...g.cercaDe.filter((c) => nombreDe.has(c)),
                          ])
                        }
                      >
                        {t("sucursales.asistente.juntarEnRegion")}
                      </button>
                    </p>
                  )}
              </div>
            ))}

            {fuera > 0 && (
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {t("sucursales.asistente.quedanSueltas", { count: fuera })}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCerrar}>
            {t("common.cancel", { defaultValue: "Cancelar" })}
          </Button>
          <Button
            disabled={aplicando || cargando || !incluidos.length}
            type="button"
            variant="brand"
            onClick={aplicar}
          >
            {t("sucursales.asistente.aplicar", { count: incluidos.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
