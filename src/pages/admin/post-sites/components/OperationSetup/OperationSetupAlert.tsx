import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ClipboardList, ArrowRight } from "lucide-react";

import { InfoNote, StatusBadge } from "@/components/kit";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * «A ESTA SEDE LE FALTA LA OPERACIÓN»
 *
 * Cuando se da de alta un cliente, la plataforma le crea su primera sede sola,
 * con los datos del formulario del cliente. Ahorra reescribir la dirección —
 * pero esa sede nace SIN tipo de servicio y sin configuración operativa, porque
 * en el alta del cliente no se pregunta nada de eso.
 *
 * Y como nada lo decía, lo normal era seguir adelante y colgarle estaciones y
 * vigilantes encima. Este aviso es lo que faltaba: dice qué hueco hay y lleva
 * directo a taparlo.
 *
 * AVISA, NO BLOQUEA — a propósito. En producción hay 17 sedes sin tipo de
 * servicio que YA tienen estaciones funcionando: un candado aquí las dejaría sin
 * poder operar mañana por una regla que llega tarde. Se señala el hueco y se
 * ofrece el camino; seguir o no es de quien opera.
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface PostSiteSetupState {
  pending?: boolean;
  missing?: string[];
}

/** La sede tal como llega de cualquiera de los endpoints que la traen. */
export interface SiteWithSetup {
  id?: string | number;
  setup?: PostSiteSetupState | null;
  serviceType?: string | null;
}

/**
 * ¿Le falta la operación a esta sede?
 *
 * Se prefiere `setup.pending` (lo calcula el servidor, misma regla para todos)
 * y se cae a mirar `serviceType` sólo si la respuesta viniera de un endpoint que
 * aún no lo adjunta — así una pantalla nunca deja de avisar por un payload
 * antiguo.
 */
export function needsOperationSetup(site?: SiteWithSetup | null): boolean {
  if (!site) return false;
  if (site.setup && typeof site.setup.pending === "boolean")
    return site.setup.pending;
  const t = site.serviceType;

  return t === null || t === undefined || String(t).trim() === "";
}

/** Píldora corta para listas y tablas. */
export function OperationSetupBadge({ site }: { site?: SiteWithSetup | null }) {
  const { t } = useTranslation();

  if (!needsOperationSetup(site)) return null;

  return (
    <StatusBadge dot={false} tone="warn">
      {t("ui.OperationSetupAlert.faltaConfigurar", "Falta configurar")}
    </StatusBadge>
  );
}

export default function OperationSetupAlert({
  site,
  siteId,
  context = "site",
  className,
}: {
  site?: SiteWithSetup | null;
  /** Cuando la sede llega sin `id` (vistas que la aplanan). */
  siteId?: string | number | null;
  /** Dónde se está enseñando: cambia lo que hay que decir, no el diagnóstico. */
  context?: "site" | "station" | "guard" | "client";
  className?: string;
}) {
  const { t } = useTranslation();

  if (!needsOperationSetup(site)) return null;

  const id = String(siteId ?? site?.id ?? "");

  const cuerpo =
    context === "station"
      ? t(
          "ui.OperationSetupAlert.cuerpoStation",
          "Estás por crear un puesto en una sede que todavía no dice qué servicio se presta ni con qué equipamiento y capacitación. Puedes continuar, pero el puesto quedará sin esas reglas hasta que la configures.",
        )
      : context === "guard"
        ? t(
          "ui.OperationSetupAlert.cuerpoGuard",
          "Estás por asignar personal a una sede que todavía no dice qué servicio se presta ni con qué equipamiento y capacitación. Puedes continuar, pero el vigilante no tendrá esas reglas hasta que la configures.",
        )
        : context === "client"
          ? t(
          "ui.OperationSetupAlert.cuerpoClient",
          "Esta sede se creó automáticamente al dar de alta al cliente, con sus datos de contacto. Falta lo operativo: qué servicio se presta, con qué equipamiento y qué capacitación. Conviene configurarlo antes de crear puestos y asignar vigilantes.",
        )
          : t(
          "ui.OperationSetupAlert.cuerpoSite",
          "Esta sede no tiene configuración operativa: falta indicar qué servicio se presta, con qué equipamiento y qué capacitación. Conviene hacerlo antes de crear puestos y asignar vigilantes.",
        );

  return (
    <InfoNote
      className={className}
      icon={<ClipboardList />}
      title={t(
        "ui.OperationSetupAlert.faltaLaConfiguracionOperativa",
        "Falta la configuración operativa",
      )}
      tone="warn"
    >
      <div className="space-y-2">
        <p>{cuerpo}</p>
        {id ? (
          <Link
            className="cg-focus inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
            style={{ color: "var(--brand-text)" }}
            to={`/post-sites/${id}/edit?step=1`}
          >
            {t(
              "ui.OperationSetupAlert.configurarLaOperacion",
              "Configurar la operación",
            )}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </InfoNote>
  );
}
