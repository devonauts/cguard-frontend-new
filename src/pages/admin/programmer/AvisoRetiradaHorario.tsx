import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";

import { InfoNote } from "@/components/kit";
import { Button } from "@/components/ui/button";

/** Cuánto se calla el aviso tras «Entendido»: una semana, y vuelve. */
const SILENCIO_MS = 7 * 24 * 60 * 60 * 1000;
const CLAVE = "horario.avisoRetirada.hastaCuando";

const silenciadoHasta = () => {
  try {
    return Number(localStorage.getItem(CLAVE) || 0);
  } catch {
    return 0;
  }
};

/**
 * AVISO DE RETIRADA DEL HORARIO. El Planificador (Programador › Planificador)
 * es la pantalla nueva: borrador, rotaciones a medida, faltas con reemplazo,
 * publicar. Esta pantalla se irá; mientras tanto se le dice a quien entra,
 * con el enlace a mano, sin estorbar: «Entendido» lo calla una semana.
 */
export default function AvisoRetiradaHorario({
  className,
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const [oculto, setOculto] = useState(() => silenciadoHasta() > Date.now());

  if (oculto) return null;

  const entendido = () => {
    try {
      localStorage.setItem(CLAVE, String(Date.now() + SILENCIO_MS));
    } catch {
      /* sin almacenamiento, se vuelve a enseñar la próxima vez */
    }
    setOculto(true);
  };

  return (
    <InfoNote
      className={className}
      icon={<Sparkles />}
      title={t(
        "ui.AvisoRetiradaHorario.titulo",
        "Esta pantalla se va a retirar: el Planificador es la nueva",
      )}
      tone="brand"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-[16rem] flex-1 text-sm">
          {t(
            "ui.AvisoRetiradaHorario.cuerpo",
            "En el Planificador haces lo mismo y más: rotaciones a tu medida, faltas con su reemplazo, sacafrancos y un borrador que publicas cuando quieras. Ve acostumbrándote: el Horario dejará de estar.",
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="brand">
            <Link to="/planificador">
              {t("ui.AvisoRetiradaHorario.abrir", "Abrir el Planificador")}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={entendido}>
            {t("ui.AvisoRetiradaHorario.entendido", "Entendido")}
          </Button>
        </div>
      </div>
    </InfoNote>
  );
}
