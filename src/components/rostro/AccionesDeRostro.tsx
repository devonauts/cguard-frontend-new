import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, RotateCcw, ScanFace, X } from "lucide-react";

import { FIELD_CLS_LG, FormField, Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { rostrosService, type RostroRegistrado } from "@/lib/api/rostrosService";

/**
 * Aprobar, rechazar o reiniciar la cara registrada de UNA persona. Lo usan la
 * lista «Caras registradas» y la ficha del vigilante, así que las dos dicen lo
 * mismo y refrescan lo mismo (todo cuelga de la clave `["rostros"]`, también
 * la cifra del menú).
 *
 * Rechazar pide un motivo opcional; reiniciar se confirma, porque borra la cara
 * y el vigilante tiene que volver a registrarse desde la app.
 */
export default function AccionesDeRostro({
  rostro,
  onCambio,
  size = "sm",
}: {
  rostro: RostroRegistrado;
  onCambio?: (r: RostroRegistrado) => void;
  size?: "sm" | "default";
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const [ocupado, setOcupado] = useState<null | "aprobar" | "rechazar" | "reiniciar">(null);
  const [rechazando, setRechazando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (!hasPermission("securityGuardEdit") || rostro.estado === "sin_registro") return null;

  const nombre = rostro.nombre || t("comun.vigilante", "Vigilante");

  const correr = async (
    accion: "aprobar" | "rechazar" | "reiniciar",
    fn: () => Promise<RostroRegistrado | { userId: string; estado: "sin_registro" }>,
    ok: string,
  ) => {
    setOcupado(accion);
    try {
      const r = await fn();

      toast.success(ok);
      onCambio?.({ ...rostro, ...r } as RostroRegistrado);
      await qc.invalidateQueries({ queryKey: ["rostros"] });

      return true;
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("rostros.acciones.error", "No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo."),
      );

      return false;
    } finally {
      setOcupado(null);
    }
  };

  const aprobar = () =>
    correr("aprobar", () => rostrosService.aprobar(rostro.userId), t("rostros.acciones.aprobada", "Cara aprobada: {{nombre}} ya puede fichar con ella.", { nombre }));

  const rechazar = async () => {
    const hecho = await correr(
      "rechazar",
      () => rostrosService.rechazar(rostro.userId, motivo),
      t("rostros.acciones.rechazada", "Cara rechazada. {{nombre}} tendrá que registrarla de nuevo.", { nombre }),
    );

    if (hecho) {
      setRechazando(false);
      setMotivo("");
    }
  };

  const reiniciar = async () => {
    const hecho = await correr(
      "reiniciar",
      () => rostrosService.reiniciar(rostro.userId),
      t("rostros.acciones.reiniciada", "Cara borrada. {{nombre}} la registrará otra vez desde la app.", { nombre }),
    );

    if (hecho) setReiniciando(false);
  };

  return (
    <>
      <div className="cg-acciones flex flex-wrap gap-2">
        {rostro.estado !== "aprobado" && (
          <Button disabled={!!ocupado} size={size} variant="brand" onClick={aprobar}>
            <Check />
            {t("rostros.acciones.aprobar", "Aprobar")}
          </Button>
        )}
        {rostro.estado !== "rechazado" && (
          <Button disabled={!!ocupado} size={size} variant="outline" onClick={() => setRechazando(true)}>
            <X />
            {t("rostros.acciones.rechazar", "Rechazar")}
          </Button>
        )}
        <Button disabled={!!ocupado} size={size} variant="danger-ghost" onClick={() => setReiniciando(true)}>
          <RotateCcw />
          {t("rostros.acciones.reiniciar", "Reiniciar")}
        </Button>
      </div>

      <Modal
        description={nombre}
        footer={
          <>
            <Button disabled={ocupado === "rechazar"} variant="outline" onClick={() => setRechazando(false)}>
              {t("comun.cancelar", "Cancelar")}
            </Button>
            <Button disabled={ocupado === "rechazar"} variant="destructive" onClick={rechazar}>
              {t("rostros.acciones.rechazar", "Rechazar")}
            </Button>
          </>
        }
        icon={<ScanFace />}
        open={rechazando}
        size="sm"
        title={t("rostros.rechazar.titulo", "Rechazar la cara")}
        onOpenChange={(o) => !ocupado && setRechazando(o)}
      >
        <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "rostros.rechazar.desc",
            "La app le pedirá que registre su cara otra vez. Si le dices por qué, lo verá al intentarlo.",
          )}
        </p>
        <FormField
          hint={t("rostros.rechazar.pista", "Por ejemplo: «La foto está a contraluz» o «No es la persona».")}
          htmlFor="rostro-motivo"
          label={t("rostros.rechazar.motivo", "Motivo (opcional)")}
        >
          <textarea
            className={FIELD_CLS_LG}
            id="rostro-motivo"
            maxLength={300}
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </FormField>
      </Modal>

      <Modal
        description={nombre}
        footer={
          <>
            <Button disabled={ocupado === "reiniciar"} variant="outline" onClick={() => setReiniciando(false)}>
              {t("comun.cancelar", "Cancelar")}
            </Button>
            <Button disabled={ocupado === "reiniciar"} variant="destructive" onClick={reiniciar}>
              {t("rostros.reiniciar.confirmar", "Borrar y reiniciar")}
            </Button>
          </>
        }
        icon={<RotateCcw />}
        open={reiniciando}
        size="sm"
        title={t("rostros.reiniciar.titulo", "¿Reiniciar la cara registrada?")}
        onOpenChange={(o) => !ocupado && setReiniciando(o)}
      >
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "rostros.reiniciar.desc",
            "Se borra la cara de {{nombre}}. La próxima vez que abra la app tendrá que registrarla de nuevo y, hasta que la apruebes, al fichar no se podrá comprobar su cara.",
            { nombre },
          )}
        </p>
      </Modal>
    </>
  );
}
