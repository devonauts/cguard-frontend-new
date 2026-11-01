import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, ScanFace, ShieldCheck, UserX, XCircle } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  InfoNote,
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  StatusBadge,
  TabNav,
} from "@/components/kit";
import MobileCardList from "@/components/responsive/MobileCardList";
import AccionesDeRostro from "@/components/rostro/AccionesDeRostro";
import { DatosDelRegistro, FotoDeReferencia } from "@/components/rostro/PiezasDeRostro";
import { PausedAddonGate } from "@/components/modulos/PausedAddon";
import { useEntitlement } from "@/hooks/useEntitlement";
import attendanceService from "@/lib/api/attendanceService";
import {
  rostrosService,
  type EstadoListable,
  type RostroRegistrado,
} from "@/lib/api/rostrosService";
import {
  MODULO_RECONOCIMIENTO_FACIAL,
  chipDeEstado,
  faltaElModulo,
  modoFacial,
} from "@/lib/rostro";
import { AvisoDeTope } from "@/components/kit/ErrorDeCarga";

/**
 * CARAS REGISTRADAS (módulo «Reconocimiento facial»).
 *
 * El vigilante registra su cara desde la app y queda «por aprobar». Aquí la
 * oficina la mira y decide: aprobar (desde ese momento se compara al fichar),
 * rechazar (con un motivo que verá en la app) o reiniciar (se borra y se
 * registra de nuevo).
 *
 * Sin el módulo, la pantalla explica qué hace y lleva a Módulos adicionales.
 */
export default function CarasRegistradasPage() {
  const { t } = useTranslation();
  const tiene = useEntitlement(MODULO_RECONOCIMIENTO_FACIAL);
  const [estado, setEstado] = useState<EstadoListable>("pendiente");
  const tenant = typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;

  /** How many to show; «Ver más» asks for the next 200 (server max 1000). */
  const [cuantos, setCuantos] = useState(200);
  useEffect(() => setCuantos(200), [estado]);
  const lista = useQuery({
    queryKey: ["rostros", "lista", estado, tenant, cuantos],
    queryFn: () => rostrosService.listar(estado, cuantos),
    placeholderData: (prev) => prev,
    enabled: tiene && Boolean(tenant),
    retry: false,
  });

  // ¿Está encendido en los ajustes? Sólo para avisar: aprobar caras sirve igual.
  const ajustes = useQuery({
    queryKey: ["nomina-settings", "general", tenant],
    queryFn: () => attendanceService.getSettings(),
    enabled: tiene && Boolean(tenant),
    staleTime: 60_000,
    retry: false,
  });
  const modo = modoFacial((ajustes.data as any)?.general?.faceRecognition);

  const sinModulo = !tiene || faltaElModulo(lista.error);
  const pendientes = lista.data?.pendientes ?? 0;

  return (
    <AppLayout>
      <PageContainer width="narrow">
        <PageHeader
          icon={<ScanFace />}
          subtitle={t(
            "rostros.pagina.subtitulo",
            "Cada vigilante registra su cara desde la app. Hasta que la apruebes, no se usa para comprobar quién ficha.",
          )}
          title={t("rostros.pagina.titulo", "Caras registradas")}
        />

        {sinModulo ? (
          <PresentacionDelModulo />
        ) : (
          <div className="space-y-4">
            {ajustes.isSuccess && modo === "off" && (
              <InfoNote title={t("rostros.apagado.titulo", "La comprobación al fichar está apagada")} tone="info">
                {t(
                  "rostros.apagado.desc",
                  "Puedes ir aprobando caras, pero no se comparan al fichar hasta que la enciendas en Ajustes › App del equipo › Selfie y rostro al fichar.",
                )}{" "}
                <Link className="underline" to="/setting/mobile-hub">
                  {t("rostros.apagado.enlace", "Ir a los ajustes")}
                </Link>
              </InfoNote>
            )}

            <Section bare>
              <TabNav
                className="mb-4"
                items={[
                  {
                    value: "pendiente",
                    label: t("rostros.tabs.pendientes", "Pendientes"),
                    icon: <Clock />,
                    badge: pendientes,
                  },
                  {
                    value: "aprobado",
                    label: t("rostros.tabs.aprobadas", "Aprobadas"),
                    icon: <CheckCircle2 />,
                  },
                  {
                    value: "rechazado",
                    label: t("rostros.tabs.rechazadas", "Rechazadas"),
                    icon: <XCircle />,
                  },
                ]}
                value={estado}
                onChange={setEstado}
              />

              {lista.isError ? (
                <EmptyState
                  action={
                    <Button size="sm" variant="outline" onClick={() => lista.refetch()}>
                      {t("rostros.error.reintentar", "Reintentar")}
                    </Button>
                  }
                  description={t(
                    "rostros.error.desc",
                    "No se pudo cargar la lista. Revisa tu conexión y vuelve a intentarlo.",
                  )}
                  icon={<ScanFace />}
                  title={t("rostros.error.titulo", "No se pudieron cargar las caras")}
                />
              ) : (
                <MobileCardList<RostroRegistrado & { id: string }>
                  emptyState={<Vacio estado={estado} />}
                  items={(lista.data?.rows ?? []).map((r) => ({ ...r, id: r.userId }))}
                  loading={lista.isLoading}
                  renderCard={(r) => <TarjetaDeCara rostro={r} />}
                  skeletonCount={3}
                />
              )}
              {!lista.isError && (lista.data?.count ?? 0) > (lista.data?.rows?.length ?? 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <AvisoDeTope mostrados={lista.data?.rows?.length ?? 0} total={lista.data?.count ?? 0} />
                  {cuantos < 1000 && (
                    <Button size="sm" variant="outline" onClick={() => setCuantos((n) => Math.min(n + 200, 1000))}>
                      {t("ui.ErrorDeCarga.verMas", "Ver más")}
                    </Button>
                  )}
                </div>
              )}
            </Section>
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}

/** Una cara: la foto de referencia, quién es, cuándo y con qué calidad. */
function TarjetaDeCara({ rostro }: { rostro: RostroRegistrado }) {
  const { t } = useTranslation();
  const chip = chipDeEstado(rostro.estado);
  const nombre = rostro.nombre || t("comun.vigilante", "Vigilante");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <FotoDeReferencia nombre={nombre} url={rostro.fotoUrl} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{nombre}</span>
          <StatusBadge tone={chip.tono}>{t(chip.clave, { defaultValue: chip.respaldo })}</StatusBadge>
        </div>
        <DatosDelRegistro rostro={rostro} />
        <div className="pt-1">
          <AccionesDeRostro rostro={rostro} />
        </div>
      </div>
    </div>
  );
}

function Vacio({ estado }: { estado: EstadoListable }) {
  const { t } = useTranslation();

  if (estado === "pendiente")
    return (
      <EmptyState
        description={t(
          "rostros.vacio.pendientesDesc",
          "Cuando un vigilante registre su cara desde la app, aparecerá aquí para que la apruebes.",
        )}
        icon={<CheckCircle2 />}
        title={t("rostros.vacio.pendientes", "No hay caras por aprobar")}
      />
    );
  if (estado === "aprobado")
    return (
      <EmptyState
        description={t(
          "rostros.vacio.aprobadasDesc",
          "Las caras que apruebes se listan aquí. Puedes reiniciar cualquiera si hay que registrarla de nuevo.",
        )}
        icon={<ShieldCheck />}
        title={t("rostros.vacio.aprobadas", "Todavía no has aprobado ninguna cara")}
      />
    );

  return (
    <EmptyState
      description={t(
        "rostros.vacio.rechazadasDesc",
        "Si rechazas una cara, el vigilante tendrá que registrarla otra vez y la verás aquí.",
      )}
      icon={<UserX />}
      title={t("rostros.vacio.rechazadas", "No hay caras rechazadas")}
    />
  );
}

/**
 * Sin el módulo: qué hace, en tres pasos, y dónde se consigue.
 * Owned but switched off: how to switch it back on instead.
 */
function PresentacionDelModulo() {
  const { t } = useTranslation();
  const pasos = [
    t("rostros.modulo.paso1", "El vigilante registra su cara una vez desde la app."),
    t("rostros.modulo.paso2", "Tú la apruebas aquí, con su foto delante."),
    t(
      "rostros.modulo.paso3",
      "Cada vez que inicia turno, la app comprueba que sea él. Si no coincide, decides si solo se avisa o si no puede fichar.",
    ),
  ];

  return (
    <PausedAddonGate
      icon={<ScanFace />}
      moduleKey={MODULO_RECONOCIMIENTO_FACIAL}
      name={t("rostros.ficha.titulo", "Reconocimiento facial")}
    >
      <Section icon={<ScanFace />} title={t("rostros.modulo.titulo", "Que ficha quien tiene que fichar")}>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "rostros.modulo.desc",
            "Con el módulo «Reconocimiento facial», al iniciar turno se comprueba que la cara de la selfie sea la del vigilante. Se acaba el fichar por un compañero.",
          )}
        </p>
        <ol className="mt-4 space-y-2">
          {pasos.map((p, i) => (
            <li key={i} className="glass-flat flex items-start gap-3 p-3 text-sm">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums"
                style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}
              >
                {i + 1}
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
        <div className="cg-acciones mt-4 justify-end">
          <Button asChild variant="brand">
            <Link to="/modulos-adicionales">{t("rostros.modulo.enlace", "Ver en Módulos adicionales")}</Link>
          </Button>
        </div>
      </Section>
    </PausedAddonGate>
  );
}
