import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Repeat } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ApiService } from "@/services/api/apiService";
import { localToday } from "@/lib/utils";
import {
  FIELD_CLS_LG,
  LabeledField,
} from "@/pages/admin/clientes/components/_shared/tab-kit";

import BuscadorDeVigilante, {
  useVigilantesDisponibles,
} from "./BuscadorDeVigilante";

/**
 * CAMBIAR A LA PERSONA DE UNA PLAZA, sin tocar la plaza ni su ciclo: la
 * asignación actual se cierra la víspera y la nueva arranca en la fecha
 * elegida, heredando la fase (es `POST guard-assignment/:id/replace`, el
 * mismo reemplazo de la ficha). Quien sale queda disponible.
 */
export default function CambiarVigilanteModal({
  open,
  onClose,
  onSaved,
  tenantId,
  assignmentId,
  nombreActual,
  guardIdActual,
  puesto,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  tenantId: string;
  assignmentId: string;
  nombreActual: string;
  guardIdActual?: string;
  puesto: string;
}) {
  const { t } = useTranslation();
  const { disponibles, cargando } = useVigilantesDisponibles(tenantId, open);
  const [guardId, setGuardId] = useState("");
  const [desde, setDesde] = useState(() => localToday());
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGuardId("");
    setDesde(localToday());
    setMotivo("");
  }, [open]);

  const guardar = async () => {
    if (!guardId) {
      toast.error(
        t("ui.ShiftAssignModal.seleccionarVigilante", "Elige al vigilante"),
      );

      return;
    }
    setGuardando(true);
    try {
      await ApiService.post(
        `/tenant/${tenantId}/guard-assignment/${assignmentId}/replace`,
        {
          data: {
            replacementGuardId: guardId,
            effectiveDate: desde,
            reason: motivo.trim() || null,
          },
        },
      );
      toast.success(
        t("ui.CambiarVigilante.hecho", {
          defaultValue: "{{nombre}} sale del puesto desde el {{fecha}}.",
          nombre: nombreActual,
          fecha: desde,
        }),
      );
      onSaved();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "Error");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      description={t("ui.CambiarVigilante.descripcion", {
        defaultValue:
          "{{nombre}} deja {{puesto}}; quien entre hereda su plaza y su ciclo desde la fecha que elijas.",
        nombre: nombreActual,
        puesto,
      })}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button
            disabled={guardando || !guardId}
            variant="brand"
            onClick={guardar}
          >
            <Repeat className="mr-1.5 h-4 w-4" />
            {t("ui.CambiarVigilante.cambiar", "Cambiar vigilante")}
          </Button>
        </div>
      }
      icon={<Repeat className="h-5 w-5" />}
      open={open}
      size="md"
      title={t("ui.CambiarVigilante.titulo", "Cambiar vigilante")}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="space-y-4">
        <LabeledField
          label={t("ui.CambiarVigilante.quienEntra", "Quién entra")}
        >
          <BuscadorDeVigilante
            cargando={cargando}
            excluir={guardIdActual ? [guardIdActual] : []}
            opciones={disponibles}
            value={guardId}
            onChange={setGuardId}
          />
        </LabeledField>
        <LabeledField label={t("ui.CambiarVigilante.desde", "Desde")}>
          <input
            className={FIELD_CLS_LG}
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </LabeledField>
        <LabeledField
          label={t("ui.CambiarVigilante.motivo", "Motivo (opcional)")}
        >
          <input
            className={FIELD_CLS_LG}
            placeholder={t(
              "ui.CambiarVigilante.motivoEjemplo",
              "Baja, traslado, el cliente lo pidió…",
            )}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </LabeledField>
      </div>
    </Modal>
  );
}
