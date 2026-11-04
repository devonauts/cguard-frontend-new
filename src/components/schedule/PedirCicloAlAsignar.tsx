import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Repeat, UserPlus } from "lucide-react";

import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import SecuenciaPropiaSelect from "@/components/schedule/SecuenciaPropiaSelect";

/**
 * ASK FOR THE REST CYCLE WHEN THE POST HAS NONE (AIE / ENTEC, 2026-11-03).
 *
 * A post is created without a rest cycle on purpose: the cycle is chosen when
 * the first guard is assigned, and the station overview says exactly that
 * («se elige al asignar al primer vigilante»). Only the Horario assign dialog
 * asked, though. The guard list, the guard's own «asignar estación» page and
 * the client's schedule card sent the assignment without a cycle, the server
 * refused it with «configúralo en Horario del turno», and that screen had
 * nothing to configure. Each screen sent the operator to the other one.
 *
 * Every assign path now goes through `conCiclo`: it sends as usual and, only
 * when the server answers that the post has no cycle, asks «¿Cada cuántos días
 * libra?» and sends again with the chosen one (which becomes the post's cycle,
 * like in the Horario dialog). The server stays the judge of whether a cycle is
 * missing, so a post whose slots carry their own cycle never asks.
 */

/** Server answer when the post has no cycle and the request brought none. */
export const CODIGO_SIN_CICLO = "server.assignment.stationWithoutRotation";

/** Is this error the «post without a rest cycle» refusal? Both HTTP clients. */
export function esFaltaDeCiclo(e: any): boolean {
  const codigos = [
    e?.data?.messageCode,
    e?.details?.messageCode,
    e?.response?.data?.messageCode,
    e?.messageCode,
  ];

  return codigos.includes(CODIGO_SIN_CICLO);
}

export function usePedirCiclo() {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState("");
  /* A sacafranco runs its own cycle (it covers the rest days of several
     posts), so the post keeps none from it: the text must not promise that. */
  const [esSacafranco, setEsSacafranco] = useState(false);
  const resolver = useRef<((id: string | null) => void) | null>(null);
  const tenantId = localStorage.getItem("tenantId") || "";

  const cerrar = (id: string | null) => {
    const r = resolver.current;

    resolver.current = null;
    setAbierto(false);
    r?.(id);
  };

  const pedirCiclo = useCallback(
    (sacafranco: boolean) =>
      new Promise<string | null>((resolve) => {
        resolver.current = resolve;
        setValor("");
        setEsSacafranco(sacafranco);
        setAbierto(true);
      }),
    [],
  );

  /**
   * Runs `enviar()`; if the server says the post has no cycle, asks for one and
   * runs `enviar(rotationStyleId)`. Resolves `null` when the operator cancels.
   * Any other error is re-thrown untouched for the caller's own message.
   */
  const conCiclo = useCallback(
    async <T,>(
      enviar: (rotationStyleId?: string) => Promise<T>,
      opciones: { sacafranco?: boolean } = {},
    ): Promise<T | null> => {
      try {
        return await enviar();
      } catch (e) {
        if (!esFaltaDeCiclo(e)) throw e;
        const id = await pedirCiclo(!!opciones.sacafranco);

        if (!id) return null;

        return await enviar(id);
      }
    },
    [pedirCiclo],
  );

  const dialogoDeCiclo = (
    <Modal
      description={
        esSacafranco
          ? t(
              "ui.PedirCicloAlAsignar.cicloDelSacafranco",
              "Es el ciclo de este sacafranco: cada cuántos días trabaja y cuántos libra. El puesto no cambia.",
            )
          : t(
              "ui.ShiftAssignModal.puestoSinCiclo",
              "Este puesto todavía no tiene ciclo. El que elijas aquí pasa a ser el del puesto, y sus compañeros lo heredan.",
            )
      }
      footer={
        <>
          <Button variant="outline" onClick={() => cerrar(null)}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button disabled={!valor} onClick={() => cerrar(valor)}>
            <UserPlus size={14} />
            {t("station.guards.assignBtn", "Asignar")}
          </Button>
        </>
      }
      icon={<Repeat className="h-5 w-5" />}
      open={abierto}
      size="sm"
      title={t("ui.ShiftAssignModal.cadaCuantosDiasLibra", "¿Cada cuántos días libra?")}
      onOpenChange={(o) => {
        if (!o) cerrar(null);
      }}
    >
      <SecuenciaPropiaSelect
        obligatorio
        tenantId={tenantId}
        value={valor}
        onChange={setValor}
      />
    </Modal>
  );

  return { conCiclo, dialogoDeCiclo };
}
