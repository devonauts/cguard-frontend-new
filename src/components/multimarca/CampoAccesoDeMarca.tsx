/**
 * «ACCESO POR MARCA» — which brands an office person sees (Multimarca, phase 2).
 *
 * Per person, like the branches («Qué sucursales ve cada persona»):
 *   · Administrador → always every brand; nothing to choose.
 *   · Administrador de marca → admin of the brands ticked here, and only of
 *     those. At least one: with none they would see nothing (the server fails
 *     closed), so the form refuses to save.
 *   · Any other role → «Todas las marcas» (as today) or only some.
 *
 * Only an administrator of the company sets it (`PUT /brands/access/:userId`);
 * someone limited to brands does not see this field. Without the module, or
 * with a single brand, it renders nothing.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Layers } from "lucide-react";

import { useMarcas } from "@/hooks/useMarcas";
import { useAccesoDeMarca } from "@/hooks/useAccesoDeMarca";
import { accesoDeMarcaService } from "@/lib/api/marcasService";
import {
  accesoParaGuardar,
  errorDeAcceso,
  esRolAdminDeMarca,
  mensajeDeAccesoDeMarca,
  motivoDeMarca,
  normalizarAcceso,
  rolVeTodasLasMarcas,
} from "@/lib/multimarca/accesoDeMarca";

/** Whether this screen may set brand access at all. */
export function usePuedeDarAccesoDeMarca(): boolean {
  const { activo, marcas } = useMarcas();
  const { restringido, esAdmin } = useAccesoDeMarca();

  return activo && marcas.length >= 1 && esAdmin && !restringido;
}

/**
 * The edit screen's state: the current value from `GET /brands/access`, and
 * `guardar(rol)` after the screen's own save — only a CHANGE is written.
 * Never throws: the rest of the person was already saved.
 */
export function useAccesoDeMarcaDe(userId: string | null | undefined) {
  const { t } = useTranslation();
  const puede = usePuedeDarAccesoDeMarca();
  const qc = useQueryClient();
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const mapa = useQuery({
    queryKey: ["marcas", "acceso", tenant],
    queryFn: () => accesoDeMarcaService.listar(),
    enabled: puede && !!tenant,
    staleTime: 60_000,
    retry: false,
  });
  const inicial = userId
    ? normalizarAcceso(mapa.data?.[String(userId)] ?? null)
    : null;
  const [valor, setValor] = useState<string[] | null>(null);
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    if (!tocado) setValor(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(inicial), tocado]);

  const guardar = async (rol: unknown) => {
    if (!puede || !userId) return;
    const nuevo = accesoParaGuardar(rol, valor);

    if (nuevo === undefined) return;
    if (JSON.stringify(nuevo) === JSON.stringify(inicial)) return;
    try {
      await accesoDeMarcaService.fijar(String(userId), nuevo);
      await qc.invalidateQueries({ queryKey: ["marcas"] });
    } catch (e: any) {
      const code = motivoDeMarca(e);

      toast.error(
        code
          ? mensajeDeAccesoDeMarca(code)
          : t(
              "ui.CampoAccesoDeMarca.errorGuardar",
              "Se guardó lo demás, pero no las marcas que ve. Inténtalo otra vez.",
            ),
      );
    }
  };

  return {
    puede,
    listo: !puede || !userId || mapa.isFetched,
    valor,
    setValor: (v: string[] | null) => {
      setTocado(true);
      setValor(v);
    },
    guardar,
  };
}

export default function CampoAccesoDeMarca({
  rol,
  valor,
  onChange,
  mostrarError = false,
  className = "",
}: {
  /** The role slug chosen in the form (brandAdmin, dispatcher…). */
  rol: string | null | undefined;
  valor: string[] | null;
  onChange: (v: string[] | null) => void;
  /** Paint the «at least one brand» error (after a save attempt). */
  mostrarError?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const puede = usePuedeDarAccesoDeMarca();
  const { marcas } = useMarcas();

  if (!puede || !marcas.length) return null;
  const adminDeMarca = esRolAdminDeMarca(rol);
  const veTodo = rolVeTodasLasMarcas(rol);
  // One brand and a role that is not a brand admin: nothing to narrow.
  if (!adminDeMarca && marcas.length < 2) return null;
  const elegidas = normalizarAcceso(valor) ?? [];
  const error = mostrarError ? errorDeAcceso(rol, valor) : null;

  const alternar = (id: string) => {
    const tiene = elegidas.includes(id);
    const siguiente = tiene
      ? elegidas.filter((x) => x !== id)
      : [...elegidas, id];

    // For a non-brand-admin, no brand ticked = every brand again.
    onChange(adminDeMarca ? siguiente : siguiente.length ? siguiente : null);
  };

  const Pastilla = ({
    activa,
    color,
    children,
    onClick,
    etiqueta,
  }: {
    activa: boolean;
    color?: string | null;
    children: React.ReactNode;
    onClick: () => void;
    etiqueta: string;
  }) => (
    <button
      aria-label={etiqueta}
      aria-pressed={activa}
      className="cg-focus inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
      style={
        activa
          ? {
              background: `color-mix(in oklab, ${color || "var(--brand)"} 16%, var(--float))`,
              borderColor: color || "var(--brand)",
              color: "var(--ink)",
            }
          : { borderColor: "var(--hairline)", color: "var(--ink-soft)" }
      }
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <div className={`space-y-2 ${className}`} data-testid="campo-acceso-de-marca">
      <div>
        <div className="text-sm font-medium">
          {t("ui.CampoAccesoDeMarca.titulo", "Acceso por marca")}
          {adminDeMarca && (
            <span aria-hidden style={{ color: "var(--brand-text)" }}>
              {" "}
              *
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {veTodo
            ? t(
                "ui.CampoAccesoDeMarca.adminVeTodas",
                "Un administrador ve siempre todas las marcas.",
              )
            : adminDeMarca
              ? t(
                  "ui.CampoAccesoDeMarca.ayudaAdminDeMarca",
                  "Administra solo las marcas que marques: sus clientes, cotizaciones y facturas, y todo el personal que trabaja en ellas (incluida su nómina).",
                )
              : t(
                  "ui.CampoAccesoDeMarca.ayuda",
                  "Elige «Todas las marcas» o limita lo que ve a algunas: solo sus clientes, sus sitios y quienes trabajan en ellos.",
                )}
        </p>
      </div>

      {!veTodo && (
        <div className="flex flex-wrap gap-2">
          {!adminDeMarca && (
            <Pastilla
              activa={valor === null || !elegidas.length}
              etiqueta={t("ui.SelectorDeMarca.todas", "Todas las marcas")}
              onClick={() => onChange(null)}
            >
              <Layers className="size-3.5" />
              {t("ui.SelectorDeMarca.todas", "Todas las marcas")}
            </Pastilla>
          )}
          {marcas.map((b) => {
            const activa = elegidas.includes(b.id);

            return (
              <Pastilla
                key={b.id}
                activa={activa}
                color={b.color}
                etiqueta={b.name}
                onClick={() => alternar(b.id)}
              >
                {activa ? (
                  <Check className="size-3.5" style={{ color: b.color || undefined }} />
                ) : (
                  <span
                    aria-hidden
                    className="size-2 rotate-45 rounded-[1px]"
                    style={{ background: b.color || "var(--ink-faint)" }}
                  />
                )}
                {b.name}
              </Pastilla>
            );
          })}
        </div>
      )}

      {error === "sinMarcas" && (
        <p className="text-xs font-medium" role="alert" style={{ color: "var(--bad-text)" }}>
          {t(
            "ui.CampoAccesoDeMarca.sinMarcas",
            "Marca al menos una marca: sin ninguna, no vería nada.",
          )}
        </p>
      )}
    </div>
  );
}
