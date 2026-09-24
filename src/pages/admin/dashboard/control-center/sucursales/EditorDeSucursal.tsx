/**
 * Crear o editar una sucursal desde el propio panel («Organizar»).
 *
 * Nombre, código corto, color de su tarjeta y las ciudades de su zona. Las
 * ciudades son lo que coloca sola una sede nueva o suelta: si su ciudad está
 * aquí, se le propone esta sucursal. Una sucursal con varias ciudades es una
 * región.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { sucursalesService, type Sucursal } from "@/lib/api/sucursalesService";

export const COLORES = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

export function EditorDeSucursal({
  abierto,
  sucursal,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  /** `null` = crear una nueva. */
  sucursal: Sucursal | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { t } = useTranslation();
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [color, setColor] = useState(COLORES[0]);
  const [ciudades, setCiudades] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setNombre(sucursal?.name || "");
    setCodigo(sucursal?.code || "");
    setColor(sucursal?.color || COLORES[0]);
    setCiudades((sucursal?.cities || []).join(", "));
  }, [abierto, sucursal]);

  const lista = ciudades
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const guardar = async () => {
    if (!nombre.trim()) {
      toast.error(t("sucursales.editor.faltaNombre"));

      return;
    }
    setGuardando(true);
    try {
      const datos = {
        name: nombre.trim(),
        code: codigo.trim() || null,
        color,
        cities: lista,
        kind: (lista.length > 1 ? "region" : "city") as Sucursal["kind"],
      };

      if (sucursal) await sucursalesService.actualizar(sucursal.id, datos);
      else await sucursalesService.crear(datos);
      toast.success(t("sucursales.editor.guardada"));
      onGuardado();
      onCerrar();
    } catch {
      toast.error(t("sucursales.errores.guardar"));
    } finally {
      setGuardando(false);
    }
  };

  const [sincronizando, setSincronizando] = useState(false);
  const canalDeRadio = async () => {
    if (!sucursal) return;
    setSincronizando(true);
    try {
      const r = await sucursalesService.canalDeRadio(sucursal.id);

      toast.success(t("sucursales.radio.hecho", { estaciones: r.estaciones, personas: r.personas }));
    } catch {
      toast.error(t("sucursales.radio.error"));
    } finally {
      setSincronizando(false);
    }
  };

  const archivar = async () => {
    if (!sucursal) return;
    if (sucursal.sedes.length) {
      toast.error(t("sucursales.editor.archivarConSedes", { count: sucursal.sedes.length }));

      return;
    }
    const ok = await confirmDialog({
      title: t("sucursales.editor.archivarTitulo", { nombre: sucursal.name }),
      message: t("sucursales.editor.archivarMensaje"),
      confirmText: t("sucursales.editor.archivar"),
      tone: "danger",
    });

    if (!ok) return;
    try {
      await sucursalesService.archivar(sucursal.id);
      toast.success(t("sucursales.editor.archivada"));
      onGuardado();
      onCerrar();
    } catch {
      toast.error(t("sucursales.errores.guardar"));
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {sucursal ? t("sucursales.editor.editar") : t("sucursales.editor.nueva")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="suc-nombre">{t("sucursales.editor.nombre")}</Label>
              <Input
                id="suc-nombre"
                maxLength={120}
                placeholder={t("sucursales.editor.nombreEjemplo")}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suc-codigo">{t("sucursales.editor.codigo")}</Label>
              <Input
                id="suc-codigo"
                maxLength={12}
                placeholder="GYE"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="suc-ciudades">{t("sucursales.editor.ciudades")}</Label>
            <Input
              id="suc-ciudades"
              placeholder={t("sucursales.editor.ciudadesEjemplo")}
              value={ciudades}
              onChange={(e) => setCiudades(e.target.value)}
            />
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {lista.length > 1
                ? t("sucursales.editor.esRegion", { count: lista.length })
                : t("sucursales.editor.ciudadesAyuda")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("sucursales.editor.color")}</Label>
            <div className="flex flex-wrap gap-2">
              {COLORES.map((c) => (
                <button
                  key={c}
                  aria-label={c}
                  aria-pressed={color === c}
                  className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: color === c ? "var(--ink)" : "transparent",
                  }}
                  type="button"
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {sucursal ? (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={archivar}>
                {t("sucursales.editor.archivar")}
              </Button>
              <Button disabled={sincronizando} type="button" variant="outline" onClick={canalDeRadio}>
                {t("sucursales.radio.boton")}
              </Button>
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCerrar}>
              {t("common.cancel", { defaultValue: "Cancelar" })}
            </Button>
            <Button disabled={guardando} type="button" variant="brand" onClick={guardar}>
              {t("sucursales.editor.guardar")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
