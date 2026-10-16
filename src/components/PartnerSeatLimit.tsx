import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";

import { GlassPanel, IconTile } from "@/components/kit";

/**
 * «Usuarios: 8 de 10» for a company whose partner sets its maximum seats.
 *
 * Only shown when the server sends `seatCap` in the partner-billed summary,
 * which happens only while a superadmin lets that partner manage seats. The
 * company cannot raise it here: it is told who to ask (its partner), which is
 * the same thing the server says when an add is refused at the limit.
 */
export default function PartnerSeatLimit({
  seats,
  seatCap,
  partnerName,
}: {
  seats: number;
  seatCap: number;
  partnerName?: string | null;
}) {
  const { t } = useTranslation();
  const proveedor = partnerName?.trim();
  const full = seats >= seatCap;

  return (
    <GlassPanel brand className="mb-6 p-4">
      <div className="flex items-start gap-3">
        <IconTile size="sm">
          <Users />
        </IconTile>
        <div className="text-sm leading-relaxed">
          <p className="font-semibold">
            {t("billing.partnerSeats.label", {
              defaultValue: "Usuarios: {{usados}} de {{maximo}}",
              usados: seats,
              maximo: seatCap,
            })}
          </p>
          <p>
            {full
              ? t("billing.partnerSeats.full", {
                  defaultValue:
                    "Llegaste a tu máximo. Para agregar más usuarios, pídeselo a {{proveedor}}.",
                  proveedor: proveedor || "CGuard Pro",
                })
              : proveedor
                ? t("billing.partnerSeats.body", {
                    defaultValue:
                      "{{proveedor}} fija cuántos usuarios puede tener tu empresa. Si necesitas más, pídeselo a ellos.",
                    proveedor,
                  })
                : t("billing.partnerSeats.bodyUnnamed", {
                    defaultValue:
                      "Tu proveedor fija cuántos usuarios puede tener tu empresa. Si necesitas más, pídeselo a ellos.",
                  })}
          </p>
        </div>
      </div>
    </GlassPanel>
  );
}
