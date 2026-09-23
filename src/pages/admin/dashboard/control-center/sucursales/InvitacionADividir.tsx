/**
 * Con el módulo Sucursales recién comprado, la empresa aún lo ve todo junto.
 * Esta franja la invita a dividirlo — el asistente propone la división y no
 * aplica nada sin su confirmación.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";

import { Panel } from "../components/Panel";

import { AsistenteDeDivision } from "./AsistenteDeDivision";

import { Button } from "@/components/ui/button";

export function InvitacionADividir() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);

  return (
    <Panel
      action={
        <Button size="sm" type="button" variant="brand" onClick={() => setAbierto(true)}>
          {t("sucursales.invitacion.boton")}
        </Button>
      }
      icon={<Building2 />}
      subtitle={t("sucursales.invitacion.texto")}
      title={t("sucursales.invitacion.titulo")}
    >
      <AsistenteDeDivision
        abierto={abierto}
        onAplicado={() => qc.invalidateQueries({ queryKey: ["sucursales"] })}
        onCerrar={() => setAbierto(false)}
      />
    </Panel>
  );
}
