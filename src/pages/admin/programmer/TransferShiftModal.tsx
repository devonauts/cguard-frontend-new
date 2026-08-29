import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Modal, Segmented } from "@/components/kit";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import coverageService, { coverageErrorCode, stationLabel } from "@/lib/api/coverageService";
import { confirmDialog } from "@/components/ui/confirmDialog";

/**
 * "Trasladar a otra estación" straight from the Horario.
 *
 * Same service the Cobertura board and the supervisor app use, so the rules and
 * the record are identical wherever the decision is made. The traslado is
 * temporary by construction: it moves only the turnos in the chosen range, so
 * the vigilante is back at their own post on the next one.
 */

export interface TransferTarget {
  guardId: string;
  guardName: string;
  /** The turno being moved. Absent ⇒ fall back to the calendar range. */
  shiftId?: string | null;
  stationId?: string | null;
  stationName?: string | null;
  /** YYYY-MM-DD of the cell that was right-clicked. */
  dateStr: string;
}

export default function TransferShiftModal({
  target,
  stations,
  onClose,
  onDone,
}: {
  target: TransferTarget | null;
  stations: Array<{ id: string; stationName: string; nickname?: string | null }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [toStationId, setToStationId] = useState("");
  const [mode, setMode] = useState<"shift" | "range">("shift");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setToStationId(""); setMode("shift"); setUntil(""); setNote("");
    onClose();
  };

  const submit = async () => {
    if (!target || !toStationId) return;

    const payload = {
      guardId: target.guardId,
      toStationId,
      ...(mode === "range" && until
        ? { dateFrom: target.dateStr, dateTo: until }
        : target.shiftId
          ? { shiftIds: [target.shiftId] }
          : { dateFrom: target.dateStr, dateTo: target.dateStr }),
      reasonNote: note.trim() || undefined,
    };

    setBusy(true);
    try {
      // Both refusals the service can raise are real operational decisions, not
      // errors: the guard is on their descanso, or already has a turno that
      // overlaps (doblar turno). Ask, then repeat the call with the
      // confirmation — never dead-end the operator. Each can only be asked
      // once, so a persistent failure surfaces instead of looping.
      const flags = { allowRestDay: false, allowDoubleShift: false };
      const asked = { rest_day: false, double_booking: false };

      for (;;) {
        try {
          await coverageService.transfer({ ...payload, ...flags });
          break;
        } catch (e: any) {
          const code = coverageErrorCode(e);
          if (code === "rest_day" && !asked.rest_day) {
            asked.rest_day = true;
            if (!await confirmDialog("Ese vigilante está en descanso ese día. ¿Asignarlo de todos modos?")) return;
            flags.allowRestDay = true;
            continue;
          }
          if (code === "double_booking" && !asked.double_booking) {
            asked.double_booking = true;
            if (!await confirmDialog("Ya tiene otro turno que se cruza con ese horario. ¿Doblar turno?")) return;
            flags.allowDoubleShift = true;
            continue;
          }
          toast.error(e?.response?.data?.message || "No se pudo trasladar");
          return;
        }
      }

      toast.success(
        mode === "range" && until
          ? `${target.guardName} trasladado hasta el ${until}`
          : `${target.guardName} trasladado`,
      );
      close();
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const dest = stations.find((s) => String(s.id) === toStationId);

  return (
    <Modal
      open={!!target}
      onOpenChange={(o) => !o && close()}
      title={t('ui.TransferShiftModal.trasladarAOtroPuesto')}
      description={`${target?.guardName || ""}${target?.stationName ? ` · desde ${target.stationName}` : ""}`}
      icon={<ArrowRightLeft />}
      footer={
        <>
          <Button variant="outline" onClick={close}>{t('actions.cancel')}</Button>
          <Button onClick={submit} disabled={busy || !toStationId}>Trasladar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="cg-eyebrow mb-1.5 block">{t('comun.puestoDestino')}</label>
          <Select value={toStationId} onValueChange={setToStationId}>
            <SelectTrigger><SelectValue placeholder={t('comun.eligeUnPuesto')} /></SelectTrigger>
            <SelectContent>
              {stations
                .filter((s) => String(s.id) !== String(target?.stationId))
                .map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{stationLabel(s)}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="cg-eyebrow mb-1.5 block">{t("ui.TransferShiftModal.duracion", "Duración")}</label>
          <Segmented<"shift" | "range">
            value={mode}
            onChange={(v) => {
              setMode(v);
              if (v === "range" && !until) setUntil(target?.dateStr || "");
            }}
            options={[
              { value: "shift", label: "Solo este turno" },
              { value: "range", label: "Hasta una fecha" },
            ]}
          />
          {mode === "range" && (
            <input
              type="date"
              value={until}
              min={target?.dateStr}
              onChange={(e) => setUntil(e.target.value)}
              className="cg-input cg-focus mt-2 w-full px-3 py-2 text-sm tabular-nums"
            />
          )}
        </div>

        <div>
          <label className="cg-eyebrow mb-1.5 block">{t('comun.motivoOpcional')}</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder={t('ui.TransferShiftModal.ejCubreFaltaEnEl')} />
        </div>

        {/* The traslado ends by itself — say so, or the natural assumption is
            that it runs until somebody remembers to undo it. */}
        <div className="glass-brand rounded-xl p-3 text-xs">
          <p className="font-semibold">
            {mode === "range" && until
              ? `Cubre ${dest ? stationLabel(dest) : "el destino"} hasta el ${until}.`
              : `Cubre ${dest ? stationLabel(dest) : "el destino"} solo en este turno.`}
          </p>
          <p className="mt-1" style={{ color: "var(--ink-soft)" }}>
            {t("ui.TransferShiftModal.despuesVuelveAutomaticamenteA", "Después vuelve automáticamente a")} <strong>{target?.stationName || "su puesto"}</strong>.
            Podrá marcar entrada en el destino como en cualquier turno normal.
          </p>
        </div>
      </div>
    </Modal>
  );
}
