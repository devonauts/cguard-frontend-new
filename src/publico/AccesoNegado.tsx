import type { MotivoSinCodigo } from "@/lib/sesionDeCodigo";

import { useTranslation } from "react-i18next";
import {
  Ban,
  Building2,
  Hourglass,
  Smartphone,
  UserX,
  Users,
} from "lucide-react";

/**
 * A valid session whose company may not use the panel (owner, 2026-10-31:
 * «nada se comparte en el browser sin ser un tenant activo aprobado a usar»).
 * The server never sends the CRM code to these people, so this screen lives in
 * the public mini-app and only explains what happens and what to do.
 */
const ICONOS: Record<MotivoSinCodigo, typeof Ban> = {
  review: Hourglass,
  rejected: UserX,
  suspended: Ban,
  field: Smartphone,
  customer: Users,
  noCompany: Building2,
};

export function AccesoNegado({
  motivo,
  onRevisar,
  onSalir,
}: {
  motivo: MotivoSinCodigo;
  onRevisar: () => void;
  onSalir: () => void;
}) {
  const { t } = useTranslation();
  const Icono = ICONOS[motivo];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F4] px-6 dark:bg-[#0A0A0A]">
      <div className="w-full max-w-md rounded-2xl border border-black/5 bg-white/80 p-8 text-center shadow-xl backdrop-blur dark:border-white/10 dark:bg-white/5">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icono aria-hidden className="h-7 w-7" />
        </div>
        <h1 className="mb-3 text-xl font-semibold text-foreground">
          {t(`publico.accesoNegado.${motivo}.titulo`)}
        </h1>
        <p className="mb-7 text-sm leading-relaxed text-muted-foreground">
          {t(`publico.accesoNegado.${motivo}.texto`)}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {motivo === "review" && (
            <button
              className="rounded-full border px-5 py-2 text-sm"
              type="button"
              onClick={onRevisar}
            >
              {t("publico.accesoNegado.revisar")}
            </button>
          )}
          <button
            className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground"
            type="button"
            onClick={onSalir}
          >
            {t("publico.accesoNegado.salir")}
          </button>
        </div>
      </div>
    </div>
  );
}
