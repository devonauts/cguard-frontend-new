import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { usuarioDeAccesoService } from "@/lib/api/usuarioDeAccesoService";

import { CampoUsuarioDeAcceso } from "./CampoUsuarioDeAcceso";

/**
 * «Usuario para entrar» en una ficha: se lee y, con permiso, se cambia aquí
 * mismo (`PATCH …/user/:userId/username`). Va APARTE del «Guardar» de la ficha
 * a propósito: cambiar el usuario tiene efecto inmediato —el viejo deja de
 * servir en el acto— y no debe quedar escondido entre otros veinte cambios.
 *
 * Los errores del servidor (`server.user.usernameTaken`, `…Invalid`,
 * `…Reserved`) llegan ya traducidos en `message` y se muestran tal cual.
 */
export function UsuarioDeAccesoEditable({
  userId,
  username,
  puedeEditar = true,
  onCambiado,
  className,
}: {
  userId?: string | null;
  username?: string | null;
  puedeEditar?: boolean;
  onCambiado?: (username: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [actual, setActual] = useState<string | null>(username || null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [valido, setValido] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => setActual(username || null), [username]);

  const guardar = async () => {
    if (!userId) return;
    const nuevo = borrador.trim();

    if (!nuevo || nuevo === actual) {
      setEditando(false);

      return;
    }
    setGuardando(true);
    try {
      const r = await usuarioDeAccesoService.cambiar(String(userId), nuevo);
      const guardado = r?.username || nuevo;

      setActual(guardado);
      setEditando(false);
      onCambiado?.(guardado);
      toast.success(
        t("usuarioDeAcceso.cambiado", {
          usuario: guardado,
          defaultValue: "Listo: ahora entra con «{{usuario}}».",
        }),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("usuarioDeAcceso.noSeCambio", "No se pudo cambiar el usuario."),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={className}>
      <div className="cg-eyebrow mb-0.5">
        {t("usuarioDeAcceso.etiqueta", "Usuario para entrar")}
      </div>
      {editando ? (
        <div className="space-y-2">
          <CampoUsuarioDeAcceso
            actual={actual}
            disabled={guardando}
            userId={userId}
            value={borrador}
            onChange={setBorrador}
            onEnter={() => {
              if (valido !== false) guardar();
            }}
            onValidez={setValido}
          />
          <div className="flex gap-2">
            <Button
              disabled={guardando || valido === false || !borrador.trim()}
              size="sm"
              type="button"
              onClick={guardar}
            >
              {guardando ? <Loader2 className="animate-spin" /> : <Check />}
              {t("usuarioDeAcceso.guardar", "Guardar usuario")}
            </Button>
            <Button
              disabled={guardando}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setEditando(false)}
            >
              <X />
              {t("common.cancel", "Cancelar")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-sm font-medium text-foreground">
            {actual || "—"}
          </span>
          {puedeEditar && userId && (
            <Button
              aria-label={t("usuarioDeAcceso.cambiar", "Cambiar usuario")}
              size="icon-sm"
              title={t("usuarioDeAcceso.cambiar", "Cambiar usuario")}
              type="button"
              variant="ghost"
              onClick={() => {
                setBorrador(actual || "");
                setValido(null);
                setEditando(true);
              }}
            >
              <Pencil />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default UsuarioDeAccesoEditable;
