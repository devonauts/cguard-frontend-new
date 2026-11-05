import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Gauge, KeyRound, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  COMBUSTIBLE,
  SIN_ODOMETRO,
  lectura,
  propiedadNormal,
  tipoDe,
} from "./flota";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import vehicleService from "@/lib/api/vehicleService";
import userService from "@/lib/api/userService";
import { securityGuardService } from "@/lib/api/securityGuardService";

/**
 * SACAR / DEVOLVER UN VEHÍCULO (flota, 2026-11-04).
 *
 * Sacar: quién lo conduce (un vehículo personal, sólo su dueño), odómetro con
 * foto, combustible y motivo. Devolver: odómetro con foto, combustible, daños
 * y notas; el servidor calcula los km, los compara con el GPS y marca lo raro.
 */
export default function VehicleUseDialog({
  vehicle,
  mode,
  open,
  onOpenChange,
  onDone,
}: {
  vehicle: any | null;
  mode: "checkout" | "checkin";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [odometro, setOdometro] = useState("");
  const [combustible, setCombustible] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [notas, setNotas] = useState("");
  const [danos, setDanos] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [conductor, setConductor] = useState<string>("");
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([]);
  const [guardando, setGuardando] = useState(false);

  const personal = propiedadNormal(vehicle?.ownership) === "personal";
  const conOdometro = !SIN_ODOMETRO.has(String(vehicle?.vehicleType));
  const unidad = vehicle?.odometerUnit === "mi" ? "mi" : "km";
  const Icono = tipoDe(vehicle?.vehicleType).icon;
  const salida = Number(vehicle?.openUse?.startOdometer);

  useEffect(() => {
    if (!open) return;
    setOdometro("");
    setCombustible("");
    setMotivo("");
    setNotas("");
    setDanos("");
    setFoto(null);
    setConductor(personal ? String(vehicle?.ownerUserId || "") : "");
  }, [open, vehicle?.id, mode]);

  // Conductor: para uno de la empresa, cualquier persona del equipo; vacío = yo.
  useEffect(() => {
    if (!open || mode !== "checkout" || personal) return;
    let vivo = true;

    userService
      .listUsers({ limit: 300 })
      .then((rows: any[]) => {
        if (!vivo) return;
        setPersonas(
          (rows || [])
            .map((u: any) => ({
              id: String(u.id),
              name:
                u.fullName ||
                [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                u.email ||
                String(u.id),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {});

    return () => {
      vivo = false;
    };
  }, [open, mode, personal]);

  const km = useMemo(() => {
    const n = Number(odometro);

    if (mode !== "checkin" || !odometro || !Number.isFinite(n) || !Number.isFinite(salida)) return null;

    return n - salida;
  }, [odometro, salida, mode]);

  const guardar = async () => {
    if (!vehicle) return;
    const n = odometro === "" ? null : Number(odometro);

    if (conOdometro && (n === null || !Number.isFinite(n) || n < 0)) {
      toast.error(t("ui.flota.faltaOdometro", "Escribe la lectura del odómetro."));

      return;
    }
    setGuardando(true);
    try {
      const fotos = foto
        ? [await securityGuardService.uploadFileToStorage(foto, "vehicleUsePhoto")]
        : undefined;

      if (mode === "checkout") {
        await vehicleService.checkout(vehicle.id, {
          odometer: n,
          fuel: combustible || null,
          purpose: motivo || null,
          driverUserId: conductor || null,
          photos: fotos,
        });
        toast.success(t("ui.flota.sacado", "Vehículo en uso. Devuélvelo con la lectura del odómetro al terminar."));
      } else {
        const r: any = await vehicleService.checkin(vehicle.openUse.id, {
          odometer: n,
          fuel: combustible || null,
          notes: notas || null,
          damages: danos || null,
          photos: fotos,
        });

        toast.success(
          t("ui.flota.devuelto", {
            defaultValue: "Vehículo devuelto: {{km}} recorridos.",
            km: lectura(r?.distance ?? km, unidad),
          }),
        );
        if (Array.isArray(r?.flags) && r.flags.length)
          toast.warning(t("ui.flota.conAlertas", "Este uso quedó con alertas: revísalo en «Usos»."));
      }
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      // El servidor ya contesta el motivo traducido (en uso por…, odómetro menor…).
      console.error("Error en salida/devolución de vehículo", e);
    } finally {
      setGuardando(false);
    }
  };

  const titulo =
    mode === "checkout"
      ? personal
        ? t("ui.flota.empezarUso", "Empezar a usarlo")
        : t("ui.flota.sacarVehiculo", "Sacar vehículo")
      : personal
        ? t("ui.flota.terminarUso", "Terminar el uso")
        : t("ui.flota.devolverVehiculo", "Devolver vehículo");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icono className="size-5" />
            {titulo}
          </DialogTitle>
          <DialogDescription>
            {[vehicle?.name, vehicle?.licensePlate].filter(Boolean).join(" · ")}
            {conOdometro && vehicle?.currentOdometer != null
              ? ` · ${t("ui.flota.ultimaLectura", "última lectura")} ${lectura(vehicle.currentOdometer, unidad)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "checkout" && !personal && (
            <div className="space-y-1.5">
              <Label>{t("ui.flota.conductor", "Quién lo conduce")}</Label>
              <Select value={conductor || "__yo__"} onValueChange={(v) => setConductor(v === "__yo__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__yo__">{t("ui.flota.yoMismo", "Yo")}</SelectItem>
                  {personas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {personal && (
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {t("ui.flota.personalNota", {
                defaultValue: "Vehículo personal de {{name}}: sólo se registran los kilómetros de trabajo.",
                name: vehicle?.ownerName || "—",
              })}
            </p>
          )}

          {conOdometro && (
            <div className="space-y-1.5">
              <Label htmlFor="odometro" className="flex items-center gap-1.5">
                <Gauge className="size-4" />
                {t("ui.flota.odometro", "Odómetro")} ({unidad})
              </Label>
              <Input
                id="odometro"
                inputMode="decimal"
                min={0}
                placeholder={
                  mode === "checkin" && Number.isFinite(salida)
                    ? t("ui.flota.alSalirMarcaba", { defaultValue: "Al salir marcaba {{n}}", n: lectura(salida, unidad) })
                    : vehicle?.currentOdometer != null
                      ? String(vehicle.currentOdometer)
                      : ""
                }
                type="number"
                value={odometro}
                onChange={(e) => setOdometro(e.target.value)}
              />
              {km != null && (
                <p className="text-xs" style={{ color: km < 0 ? "var(--bad-text)" : "var(--ink-soft)" }}>
                  {km < 0
                    ? t("ui.flota.menorQueSalida", "Es menor que la lectura de salida.")
                    : t("ui.flota.recorrido", { defaultValue: "Recorrido: {{km}}", km: lectura(km, unidad) })}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("ui.flota.combustible.titulo", "Combustible")}</Label>
            <div className="flex flex-wrap gap-1.5" role="group">
              {COMBUSTIBLE.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={combustible === c.id}
                  className="h-9 rounded-md border px-3 text-sm"
                  style={
                    combustible === c.id
                      ? { background: "var(--brand-wash)", borderColor: "var(--brand-line)", color: "var(--brand-text)" }
                      : { borderColor: "var(--hairline)" }
                  }
                  type="button"
                  onClick={() => setCombustible(combustible === c.id ? "" : c.id)}
                >
                  {t(c.key, c.label)}
                </button>
              ))}
            </div>
          </div>

          {mode === "checkout" ? (
            <div className="space-y-1.5">
              <Label htmlFor="motivo">{t("ui.flota.motivo", "Motivo (opcional)")}</Label>
              <Input
                id="motivo"
                maxLength={255}
                placeholder={t("ui.flota.motivoEj", "Ronda nocturna, trámite en el banco…")}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="danos">{t("ui.flota.danos", "Daños (si hay)")}</Label>
                <Textarea id="danos" rows={2} value={danos} onChange={(e) => setDanos(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas">{t("ui.flota.notas", "Notas")}</Label>
                <Textarea id="notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="foto" className="flex items-center gap-1.5">
              <Camera className="size-4" />
              {conOdometro
                ? t("ui.flota.fotoOdometro", "Foto del odómetro")
                : t("ui.flota.fotoVehiculo", "Foto del vehículo")}
            </Label>
            <Input
              accept="image/*"
              capture="environment"
              id="foto"
              type="file"
              onChange={(e) => setFoto(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={guardando} type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button disabled={guardando} type="button" variant="brand" onClick={guardar}>
            {guardando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === "checkout" ? (
              <KeyRound className="size-4" />
            ) : (
              <Undo2 className="size-4" />
            )}
            {titulo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
