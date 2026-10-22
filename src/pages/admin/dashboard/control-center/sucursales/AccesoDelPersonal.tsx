/**
 * QUÉ SUCURSALES VE CADA PERSONA DEL PERSONAL (fase 4).
 *
 * Por persona, no por rol: el jefe de operaciones de Quito y el de Guayaquil
 * tienen el mismo rol con distinto alcance. «Todas» es lo de siempre; elegir
 * sucursales la limita a esas en todo el CRM, VigIA y la app del supervisor.
 * Un administrador ve siempre todas. Los vigilantes y los clientes no salen:
 * sus apps ya enseñan sólo lo suyo.
 *
 * Cada cambio se guarda al momento.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgente } from "@/lib/agenteDeMarca";
import {
  accesoService,
  type AccesoDePersona,
  type Sucursal,
} from "@/lib/api/sucursalesService";

export function AccesoDelPersonal({
  abierto,
  sucursales,
  onCerrar,
}: {
  abierto: boolean;
  sucursales: Sucursal[];
  onCerrar: () => void;
}) {
  const { t } = useTranslation();
  const agente = useAgente();
  const [filas, setFilas] = useState<AccesoDePersona[] | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setFilas(null);
    accesoService
      .listar()
      .then((r) => setFilas(r.rows))
      .catch(() => {
        setFilas([]);
        toast.error(t("sucursales.errores.guardar"));
      });
  }, [abierto, t]);

  const fijar = async (p: AccesoDePersona, acceso: string[] | null) => {
    // Quitar la última sucursal de alguien lo dejaría sin ver nada: se
    // interpreta como volver a «Todas», que es lo que se quiere casi siempre.
    // Salvo para un gerente: «todas» no existe para él (eso es el admin).
    const esGerente = p.roles.includes("branchManager");
    const valor = acceso && acceso.length === 0 && !esGerente ? null : acceso;

    setGuardando(p.userId);
    try {
      await accesoService.fijar(p.userId, valor);
      setFilas((fs) =>
        (fs || []).map((f) =>
          f.userId === p.userId ? { ...f, acceso: valor } : f,
        ),
      );
    } catch {
      toast.error(t("sucursales.errores.guardar"));
    } finally {
      setGuardando(null);
    }
  };

  const Pastilla = ({
    activa,
    color,
    children,
    onClick,
    disabled,
  }: {
    activa: boolean;
    color?: string | null;
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      aria-pressed={activa}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50"
      disabled={disabled}
      style={
        activa
          ? {
              background: color || "var(--brand)",
              borderColor: color || "var(--brand)",
              color: "#fff",
            }
          : undefined
      }
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("sucursales.acceso.titulo")}</DialogTitle>
          <DialogDescription>
            {t("sucursales.acceso.intro", { agente: agente.nombre })}
          </DialogDescription>
        </DialogHeader>

        {!filas ? (
          <p className="py-4 text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("sucursales.acceso.cargando")}
          </p>
        ) : !filas.length ? (
          <p className="py-4 text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("sucursales.acceso.vacio")}
          </p>
        ) : (
          <div className="space-y-2">
            {filas.map((p) => (
              <div key={p.userId} className="rounded-xl border px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">{p.nombre}</span>
                  {p.email && (
                    <span
                      className="truncate text-xs"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {p.email}
                    </span>
                  )}
                </div>
                {p.esAdmin ? (
                  <p
                    className="mt-1.5 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("sucursales.acceso.admin")}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.roles.includes("branchManager") &&
                      !(p.acceso || []).length && (
                        <p
                          className="w-full text-xs"
                          style={{ color: "var(--warn)" }}
                        >
                          {t("sucursales.acceso.gerenteSinSucursal")}
                        </p>
                      )}
                    {!p.roles.includes("branchManager") && (
                      <Pastilla
                        activa={p.acceso === null}
                        disabled={guardando === p.userId}
                        onClick={() => fijar(p, null)}
                      >
                        {t("sucursales.acceso.todas")}
                      </Pastilla>
                    )}
                    {sucursales.map((b) => {
                      const tiene = !!p.acceso?.includes(b.id);

                      return (
                        <Pastilla
                          key={b.id}
                          activa={tiene}
                          color={b.color}
                          disabled={guardando === p.userId}
                          onClick={() =>
                            fijar(
                              p,
                              tiene
                                ? (p.acceso || []).filter((x) => x !== b.id)
                                : [...(p.acceso || []), b.id],
                            )
                          }
                        >
                          {b.name}
                        </Pastilla>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
