/**
 * Replayers de la cola offline del CRM — importado una vez por sus efectos
 * (main.tsx). Cada `kind` registrado aquí es una mutación que el CRM permite
 * capturar sin red y reproducir al reconectar.
 *
 * ALCANCE DELIBERADO (fase 1): solo registros operativos que son seguros de
 * diferir — un incidente o una visita que ocurrieron IGUAL aunque no hubiera
 * internet, y cuyo registro tardío no genera conflicto. La lista crece según
 * demanda real; lo que mueve dinero o estado compartido (nómina, aprobaciones,
 * horarios, RBAC, facturación) queda fuera A PROPÓSITO y exige red.
 *
 * `tenantId` llega sellado desde el momento de encolar (multi-empresa: el
 * replay va contra la empresa donde se capturó, no la activa al reconectar).
 */
import { registerReplayer } from "./offlineQueue";

import api from "@/lib/api";
import i18n from "@/i18n";
import { invalidateEntity } from "@/lib/queryClient";

const tid = (sealed?: string): string => {
  const t = sealed || localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      i18n.t(
        "offline.replay.noTenant",
        "Sin empresa para reproducir la mutación",
      ),
    );

  return t;
};

/** Incidente creado sin red (despacho / novedad). Los adjuntos NO viajan en la
 *  cola (ficheros grandes en localStorage no caben) — el formulario avisa y el
 *  operador los agrega después desde el detalle. Perder el adjunto es barato;
 *  perder el REGISTRO del incidente no. */
registerReplayer("incident.create", async (payload: any, tenantId?: string) => {
  // silentError: el replay corre en segundo plano — un rechazo no debe disparar
  // toasts sin contexto ni la redirección del interceptor 402 a facturación.
  await api.post(`/tenant/${tid(tenantId)}/incident`, { data: payload }, {
    toast: { silentError: true },
  } as any);
  invalidateEntity("incidents");
});

/** Visita registrada sin red (bitácora de recepción). */
registerReplayer(
  "visitorLog.create",
  async (payload: any, tenantId?: string) => {
    await api.post(`/tenant/${tid(tenantId)}/visitor-log`, { data: payload }, {
      toast: { silentError: true },
    } as any);
    invalidateEntity("visitors");
  },
);
