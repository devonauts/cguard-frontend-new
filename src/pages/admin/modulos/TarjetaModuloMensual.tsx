import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles, CheckCircle2, Play } from "lucide-react";

import TarjetaModulo, { Cifra } from "./TarjetaModulo";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { Modal, StatusBadge } from "@/components/kit";
import ComoFuncionaVigiaPro from "@/components/vigia/ComoFuncionaVigiaPro";
import { useAuth } from "@/contexts/AuthContext";
import { useAgente } from "@/lib/agenteDeMarca";
import { soloFecha } from "@/lib/horaDeLaEmpresa";
import {
  modulosAdicionalesService,
  type ModuloEnTienda,
} from "@/lib/api/modulosAdicionalesService";

/**
 * UN MÓDULO MENSUAL EN LA TIENDA (VigIA Pro), en la MISMA tarjeta que los demás.
 *
 * Precio FIJO al mes según el tamaño de la empresa — $50 hasta 50 vigilantes,
 * $100 por encima (2026-10-07) — y se enseña EL SUYO en grande («tienes 5
 * activos») con el tramo siguiente en una línea. Decisión del dueño: un fijo
 * se compara con el costo de un turno perdido, no con el asiento. El tramo de
 * arriba no tiene techo (`SIN_TOPE` en el servidor) y se pinta «Más de N».
 *
 * ── EL INTERRUPTOR (2026-10-21) ──────────────────────────────────────────
 * Dice si el módulo está ENCENDIDO para la empresa: tiene acceso hoy y no se
 * ha dicho que pare (`cancelAtPeriodEnd`). Una prueba recién empezada está
 * encendida; una a la que se dijo «no seguir», apagada aunque siga hasta su
 * fin; un activo que no se renueva, apagado hasta la fecha. Encenderlo hace lo
 * que toque en ese momento (empezar la prueba, dejar elegido seguir, activar
 * o reactivar) y apagarlo deja de renovar. Lo que cuesta dinero sigue
 * pidiendo confirmación. El botón del pie es el camino evidente para lo mismo.
 *
 * La demostración animada (`ComoFuncionaVigiaPro`) se abre en una ventana con
 * «Ver cómo funciona» (Mike, 2026-10-21: todas las tarjetas del mismo tamaño;
 * la demo abierta dentro de la tarjeta la hacía el doble de alta que las otras
 * y su bitácora la hacía crecer y encoger con cada escena).
 *
 * Lo que se ofrece depende del momento:
 *   · sin probar        → «Probar 30 días gratis» (sin tarjeta)
 *   · en prueba         → «Seguir al terminar» (mensual / anual) o ya elegido
 *   · activo            → renovación y apagar = «No renovar»
 *   · cancelado         → activo hasta X y «Reactivar»
 *   · vencido / sin prueba → «Activar»
 * Nunca se cobra a mitad de prueba: elegir sólo deja dicho cómo seguir.
 */
/** El tramo sin techo, como lo guarda el servidor (`SIN_TOPE` en lib/moduloMensual). */
const SIN_TOPE = 999_999;

function dinero(
  cents: number | null | undefined,
  currency: string,
  lang: string,
) {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${Math.round(cents / 100)}`;
  }
}

/** Un instante (fin de prueba, renovación) en la zona de la EMPRESA. */
function fecha(iso: string | null | undefined) {
  return soloFecha(iso, { day: "numeric", month: "long", year: "numeric" }, "");
}
/** La misma fecha, corta: para la línea de situación de la tarjeta, que es una sola línea. */
function fechaCorta(iso: string | null | undefined) {
  return soloFecha(iso, { day: "numeric", month: "short" }, "");
}

export default function TarjetaModuloMensual({
  m,
  canPurchase,
  reason,
  esDeSocio,
  delay = 0,
}: {
  m: ModuloEnTienda;
  canPurchase: boolean;
  reason: string | null;
  esDeSocio: boolean;
  delay?: number;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  const agente = useAgente().nombre;
  const [intervalo, setIntervalo] = useState<"month" | "year">(
    m.interval === "year" ? "year" : "month",
  );
  const [ocupado, setOcupado] = useState(false);
  const [verDemo, setVerDemo] = useState(false);
  const L = i18n.language;
  const precioElegido = intervalo === "year" ? m.yearlyCents : m.monthlyCents;
  const porPeriodo =
    intervalo === "year"
      ? t("modulosAdicionales.mensual.porAnio", "/año")
      : t("modulosAdicionales.mensual.porMes", "/mes");
  const precioDelTramo = (cents: number) =>
    intervalo === "year" ? cents * (12 - (m.annualMonthsFree || 0)) : cents;

  const recargar = async () => {
    await refreshProfile().catch(() => null);
    await qc.invalidateQueries({ queryKey: ["modulos-adicionales"] });
  };
  const motivo = (r?: string | null) =>
    t(`modulosAdicionales.motivos.${r || "error"}`, {
      defaultValue: t("modulosAdicionales.motivos.error"),
    });

  const accion = async (fn: () => Promise<any>, exito: string) => {
    setOcupado(true);
    try {
      const r = await fn();

      if (r?.estado === "pending_payment" && r?.enlaceDePago) {
        toast.info(t("modulosAdicionales.pendienteAviso"));
        window.location.assign(r.enlaceDePago);

        return;
      }
      toast.success(exito);
      await recargar();
    } catch (e: any) {
      toast.error(motivo(e?.data?.reason));
      await recargar();
    } finally {
      setOcupado(false);
    }
  };

  const probar = () =>
    accion(
      () => modulosAdicionalesService.probar(m.key),
      t("modulosAdicionales.mensual.pruebaIniciada", {
        defaultValue: "¡Listo! Tienes {{n}} días de {{nombre}} gratis.",
        n: m.trialDays,
        nombre: m.name,
      }),
    );

  const suscribir = async () => {
    const enPrueba = m.status === "trial";
    const ok = await confirmDialog({
      title: enPrueba
        ? t("modulosAdicionales.mensual.confirmarSeguirTitulo", {
            defaultValue: "Seguir con {{nombre}} al terminar la prueba",
            nombre: m.name,
          })
        : t("modulosAdicionales.confirmar.titulo", { nombre: m.name }),
      message: enPrueba
        ? t("modulosAdicionales.mensual.confirmarSeguir", {
            defaultValue:
              "No se cobra nada hoy. El {{fecha}} se cobrará {{precio}}{{periodo}} a tu tarjeta y seguirás sin cortes. Puedes cambiarlo antes.",
            fecha: fecha(m.trialEndsAt),
            precio: dinero(precioElegido, m.currency, L),
            periodo: porPeriodo,
          })
        : t("modulosAdicionales.mensual.confirmarActivar", {
            defaultValue:
              "Se cobrará {{precio}}{{periodo}} a la tarjeta de tu suscripción. Puedes cancelarlo cuando quieras; sigue activo hasta el fin de lo pagado.",
            precio: dinero(precioElegido, m.currency, L),
            periodo: porPeriodo,
          }),
      confirmText: enPrueba
        ? t("modulosAdicionales.mensual.seguir", "Seguir")
        : t("modulosAdicionales.mensual.activar", "Activar"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });

    if (!ok) return;
    await accion(
      () => modulosAdicionalesService.suscribir(m.key, intervalo),
      enPrueba
        ? t("modulosAdicionales.mensual.seguiraActivo", {
            defaultValue: "Hecho: seguirá activo al terminar la prueba.",
          })
        : t("modulosAdicionales.exito", { nombre: m.name }),
    );
  };

  const cancelar = async () => {
    const enPrueba = m.status === "trial";
    const ok = await confirmDialog({
      title: t("modulosAdicionales.mensual.cancelarTitulo", {
        defaultValue: "¿Dejar de renovar {{nombre}}?",
        nombre: m.name,
      }),
      message: enPrueba
        ? t("modulosAdicionales.mensual.cancelarPrueba", {
            defaultValue:
              "No se cobrará nada. Seguirás con la prueba hasta el {{fecha}}.",
            fecha: fecha(m.trialEndsAt),
          })
        : t("modulosAdicionales.mensual.cancelarActivo", {
            defaultValue:
              "No se cobra nada más. Seguirás con {{nombre}} hasta el {{fecha}}.",
            nombre: m.name,
            fecha: fecha(m.periodEndsAt),
          }),
      confirmText: t("modulosAdicionales.mensual.noRenovar", "No renovar"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });

    if (!ok) return;
    await accion(
      () => modulosAdicionalesService.cancelar(m.key),
      t("modulosAdicionales.mensual.noSeRenovara", {
        defaultValue: "Listo: no se renovará.",
      }),
    );
  };

  const estado = m.status;
  const enPruebaConAcceso = estado === "trial" && !!m.hasAccess;
  const canceladoConAcceso = estado === "canceled" && !!m.hasAccess;
  const activo = estado === "active" || estado === "comp";
  /* Lo que se ofrece mientras no está contratado: probar, seguir, reactivar o activar. */
  const puedeProbar = !!m.canStartTrial && !esDeSocio;
  const puedeSeguir = enPruebaConAcceso && !m.autoRenew && !esDeSocio;
  const puedeReactivar = canceladoConAcceso && !esDeSocio;
  const puedeActivar =
    !activo &&
    !enPruebaConAcceso &&
    !canceladoConAcceso &&
    !puedeProbar &&
    estado !== "pending_payment" &&
    canPurchase &&
    !esDeSocio;

  /* ENCENDIDO = tiene acceso hoy y nadie ha dicho que pare. Un cancelado (o una
     prueba a la que se dijo «no seguir») sigue con acceso hasta su fecha, pero
     ya está apagado: el interruptor enseña la decisión, no el calendario. */
  const contratado =
    !!m.hasAccess && estado !== "canceled" && !m.cancelAtPeriodEnd;
  const puedeEncender =
    puedeProbar || puedeSeguir || puedeReactivar || puedeActivar;
  const puedeApagar =
    contratado && (estado === "active" || estado === "trial") && !esDeSocio;
  const encender = () => {
    if (puedeProbar) return probar();
    if (puedeSeguir || puedeReactivar || puedeActivar) return suscribir();

    return undefined;
  };
  const alCambiar = (on: boolean) => {
    if (ocupado) return;
    if (on && puedeEncender) void encender();
    else if (!on && puedeApagar) void cancelar();
  };

  const insignia = enPruebaConAcceso ? (
    <StatusBadge tone="info">
      {t("modulosAdicionales.mensual.enPrueba", {
        defaultValue: "Prueba: {{n}} días",
        n: m.trialDaysLeft,
      })}
    </StatusBadge>
  ) : activo ? (
    <StatusBadge tone="ok">{t("modulosAdicionales.activo")}</StatusBadge>
  ) : canceladoConAcceso ? (
    <StatusBadge tone="warn">
      {t("modulosAdicionales.mensual.hasta", {
        defaultValue: "Activo hasta el {{fecha}}",
        fecha: fechaCorta(m.periodEndsAt),
      })}
    </StatusBadge>
  ) : estado === "pending_payment" ? (
    <StatusBadge tone="warn">{t("modulosAdicionales.pendiente")}</StatusBadge>
  ) : null;

  const selectorDePeriodo = (
    <div
      className="inline-flex rounded-xl border p-0.5 text-xs"
      role="group"
      style={{ borderColor: "var(--hairline)" }}
    >
      {(["month", "year"] as const).map((x) => (
        <button
          key={x}
          aria-pressed={intervalo === x}
          className="cg-focus whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors duration-200"
          style={
            intervalo === x
              ? { background: "var(--brand)", color: "var(--brand-ink, #fff)" }
              : { color: "var(--ink-soft)" }
          }
          type="button"
          onClick={() => setIntervalo(x)}
        >
          {x === "month"
            ? t("modulosAdicionales.mensual.mensual", "Mensual")
            : t("modulosAdicionales.mensual.anualCorto", "Anual")}
        </button>
      ))}
    </div>
  );

  /* El precio: SU tramo en grande y el siguiente en una línea. */
  const tramos = m.tiers || [];
  const suyo = m.currentTier ?? tramos[0] ?? null;
  const indice = suyo
    ? tramos.findIndex((x) => x.maxGuards === suyo.maxGuards)
    : -1;
  const siguiente = indice >= 0 ? tramos[indice + 1] : undefined;
  const sinTecho = (tr: { maxGuards: number }) => tr.maxGuards >= SIN_TOPE;
  const precio = (
    <div>
      <div className="flex items-baseline gap-1">
        <Cifra
          className="text-2xl font-semibold tabular-nums"
          k={`${intervalo}-${suyo?.priceCents ?? "x"}`}
        >
          {suyo ? dinero(precioDelTramo(suyo.priceCents), m.currency, L) : "—"}
        </Cifra>
        <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {porPeriodo}
        </span>
        {insignia && <span className="ml-auto">{insignia}</span>}
      </div>
      <div
        className="mt-1 truncate text-xs"
        style={{ color: "var(--brand-text, var(--brand))" }}
      >
        {suyo && m.currentTier
          ? t("modulosAdicionales.mensual.tuPlan", {
              defaultValue: "Tu plan · tienes {{n}} activos",
              n: m.activeGuards,
            })
          : suyo
            ? t("modulosAdicionales.mensual.hastaVigilantes", {
                defaultValue: "Hasta {{n}} vigilantes",
                n: suyo.maxGuards,
              })
            : " "}
      </div>
      <div className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>
        {intervalo === "year" && (m.annualMonthsFree || 0) > 0
          ? t("modulosAdicionales.mensual.mesesGratis", {
              defaultValue: "Anual: {{n}} meses gratis",
              n: m.annualMonthsFree,
            })
          : siguiente
            ? t("modulosAdicionales.mensual.tramoSiguiente", {
                defaultValue: "Más de {{n}} vigilantes: {{precio}}{{periodo}}",
                n: suyo!.maxGuards,
                precio: dinero(
                  precioDelTramo(siguiente.priceCents),
                  m.currency,
                  L,
                ),
                periodo: porPeriodo,
              })
            : suyo && sinTecho(suyo) && indice > 0
              ? t("modulosAdicionales.mensual.masDeVigilantes", {
                  n: tramos[indice - 1].maxGuards,
                })
              : t(
                  "modulosAdicionales.mensual.nuncaSeCorta",
                  "Si creces, nunca se corta: el plan siguiente se aplica desde tu próxima factura.",
                )}
      </div>
    </div>
  );

  /* La línea que explica en qué queda: se cobra el X, renueva el X, no seguirá… */
  const situacionTexto =
    estado === "comp"
      ? t("modulosAdicionales.mensual.regalado", "Incluido por cortesía")
      : estado === "active"
        ? t("modulosAdicionales.mensual.renueva", {
            defaultValue: "Renueva el {{fecha}}",
            fecha: fechaCorta(m.periodEndsAt),
          })
        : enPruebaConAcceso && m.autoRenew
          ? t("modulosAdicionales.mensual.seCobraraEl", {
              defaultValue: "Seguirá activo: se cobra el {{fecha}}",
              fecha: fechaCorta(m.trialEndsAt),
            })
          : enPruebaConAcceso && m.cancelAtPeriodEnd
            ? t("modulosAdicionales.mensual.pruebaSinSeguir", {
                defaultValue:
                  "Prueba hasta el {{fecha}} · al terminar no seguirá",
                fecha: fechaCorta(m.trialEndsAt),
              })
            : enPruebaConAcceso
              ? t("modulosAdicionales.mensual.pruebaHasta", {
                  defaultValue:
                    "Prueba gratis hasta el {{fecha}} · sin tarjeta",
                  fecha: fechaCorta(m.trialEndsAt),
                })
              : puedeProbar
                ? t(
                    "modulosAdicionales.mensual.sinTarjeta",
                    "Sin tarjeta. Al terminar decides si sigues.",
                  )
                : enPruebaConAcceso === false &&
                    !contratado &&
                    !puedeEncender &&
                    !esDeSocio &&
                    estado !== "pending_payment" &&
                    reason
                  ? motivo(reason)
                  : null;
  /* La demostración se abre desde una píldora «Demo» junto al interruptor: la
     cabecera es la única fila con sitio, y así la línea de situación queda
     entera y las tarjetas no cambian de forma entre sí. */
  const enlaceDemo = m.key === "vigia_pro" && !activo && (
    <button
      aria-label={t(
        "modulosAdicionales.mensual.verComoFunciona",
        "Ver cómo funciona",
      )}
      className="cg-focus inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors duration-200 hover:bg-[var(--brand-wash)]"
      style={{
        borderColor: "var(--hairline)",
        color: "var(--brand-text, var(--brand))",
      }}
      title={t(
        "modulosAdicionales.mensual.verComoFunciona",
        "Ver cómo funciona",
      )}
      type="button"
      onClick={() => setVerDemo(true)}
    >
      <Play className="h-3 w-3" />
      {t("modulosAdicionales.mensual.demo", "Demo")}
    </button>
  );
  const situacion = (
    <span className="flex min-w-0 items-center gap-1.5">
      {contratado && (
        <CheckCircle2
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: "var(--ok)" }}
        />
      )}
      <Cifra className="min-w-0 truncate" k={situacionTexto ?? ""}>
        {situacionTexto ?? " "}
      </Cifra>
      {!contratado &&
        !puedeEncender &&
        !esDeSocio &&
        reason &&
        estado !== "pending_payment" && (
          <Link className="shrink-0 underline" to="/setting/billing">
            {t("modulosAdicionales.irAFacturacion")}
          </Link>
        )}
      {enPruebaConAcceso && !canPurchase && reason && !esDeSocio && (
        <Link className="shrink-0 underline" to="/setting/billing">
          {t("modulosAdicionales.irAFacturacion")}
        </Link>
      )}
    </span>
  );

  const boton = puedeProbar ? (
    <Button disabled={ocupado} type="button" variant="brand" onClick={probar}>
      {t("modulosAdicionales.mensual.probarGratis", {
        defaultValue: "Probar {{n}} días gratis",
        n: m.trialDays,
      })}
    </Button>
  ) : puedeSeguir ? (
    <Button
      disabled={ocupado}
      type="button"
      variant="brand"
      onClick={suscribir}
    >
      {t("modulosAdicionales.mensual.seguirAlTerminar", {
        defaultValue: "Seguir al terminar · {{precio}}{{periodo}}",
        precio: dinero(precioElegido, m.currency, L),
        periodo: porPeriodo,
      })}
    </Button>
  ) : puedeReactivar ? (
    <Button
      disabled={ocupado}
      type="button"
      variant="brand"
      onClick={suscribir}
    >
      {t("modulosAdicionales.mensual.reactivar", "Reactivar")}
    </Button>
  ) : puedeActivar ? (
    <Button
      disabled={ocupado}
      type="button"
      variant="brand"
      onClick={suscribir}
    >
      {t("modulosAdicionales.mensual.activarPrecio", {
        defaultValue: "Activar · {{precio}}{{periodo}}",
        precio: dinero(precioElegido, m.currency, L),
        periodo: porPeriodo,
      })}
    </Button>
  ) : puedeApagar ? (
    <Button
      disabled={ocupado}
      type="button"
      variant="outline"
      onClick={cancelar}
    >
      {t("modulosAdicionales.mensual.noRenovar", "No renovar")}
    </Button>
  ) : null;

  const pie = (
    <>
      {puedeSeguir || puedeReactivar || puedeActivar ? (
        selectorDePeriodo
      ) : (
        <span />
      )}
      {boton}
    </>
  );

  return (
    <>
      <TarjetaModulo
        accion={enlaceDemo}
        delay={delay}
        description={m.description}
        icon={<Sparkles />}
        interruptor={{
          checked: contratado,
          disabled: ocupado || (contratado ? !puedeApagar : !puedeEncender),
          onChange: alCambiar,
          label: t("modulosAdicionales.interruptor", { nombre: m.name }),
        }}
        kicker={t("modulosAdicionales.mensual.cuotaMensual", "Cuota mensual")}
        name={m.name}
        pie={pie}
        precio={precio}
        situacion={situacion}
      />
      {m.key === "vigia_pro" && (
        <Modal
          icon={<Sparkles />}
          open={verDemo}
          size="xl"
          title={t("vigiaPro.demo.titulo", { agente })}
          onOpenChange={setVerDemo}
        >
          {verDemo && <ComoFuncionaVigiaPro />}
        </Modal>
      )}
    </>
  );
}
