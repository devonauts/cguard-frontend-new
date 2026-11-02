/**
 * MARCAS — the company's security brands (module «Multimarca»).
 *
 * Each brand is a separate legal company with its own clients, office and
 * payroll; operations are shared (same guards, one schedule, one map). Here
 * the admin sees every brand as a card (logo, colour, legal name, tax id,
 * clients and people), marks which one is the principal, edits them, archives
 * them, and buys more brand slots: the module includes two, each further one
 * is a one-time payment («2 de 2 marcas en uso · Agregar otra marca (50 USD)»).
 *
 * Without the module the page shows nothing to manage and points to the store.
 *
 * Phase 2: someone limited to some brands (brand admin) sees only theirs and
 * cannot create, edit, archive or buy (`marca_estructura` / `marca_pago`):
 * the page says so instead of offering buttons the server would refuse.
 * Phase 4: after a refunded slot the company may use more brands than it
 * paid for (`slots.overLimit`): a banner says what that blocks and offers
 * the slot.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  Building2,
  Layers,
  Lock,
  Plus,
  ShoppingCart,
  Users,
} from "lucide-react";

import { EditorDeMarca } from "./EditorDeMarca";
import { useComprarCupoDeMarca } from "./comprarCupoDeMarca";

import AppLayout from "@/layouts/app-layout";
import LogoDeMarca from "@/components/multimarca/LogoDeMarca";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  EmptyState,
  FadeIn,
  GlassPanel,
  InfoNote,
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  StatusBadge,
} from "@/components/kit";
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";
import { usePermissions } from "@/hooks/usePermissions";
import { useMarcas } from "@/hooks/useMarcas";
import { useAccesoDeMarca } from "@/hooks/useAccesoDeMarca";
import { mensajeDeAccesoDeMarca } from "@/lib/multimarca/accesoDeMarca";
import { type Marca } from "@/lib/api/marcasService";
import { nombreDePais, terminosFiscales } from "@/lib/paisDeLaEmpresa";

export default function MarcasPage() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = usePermissions();
  // Phase 2: only the company's administration changes the brands.
  const { restringido } = useAccesoDeMarca();
  const puedeEditar = hasPermission("tenantEdit") && !restringido;
  const [verArchivadas, setVerArchivadas] = useState(false);
  const { activo, lista, todas, marcas, cupos } = useMarcas({
    archivadas: verArchivadas,
  });
  const cupo = useComprarCupoDeMarca();
  const [editando, setEditando] = useState<Marca | null>(null);
  const [creando, setCreando] = useState(false);
  const visibles = verArchivadas ? todas : marcas;
  const llenos = !!cupos && cupos.used >= cupos.paid;
  // Phase 4: a refund left more brands in use than paid for.
  const excedido = !!cupos && (!!cupos.overLimit || cupos.used > cupos.paid);

  const nueva = () => {
    setEditando(null);
    setCreando(true);
  };

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          actions={
            activo ? (
              <div className="flex flex-wrap gap-2">
                {/* Phase 4: hours people of one brand did at another's sites. */}
                <Button asChild type="button" variant="outline">
                  <Link to="/reports/horas-entre-marcas">
                    <ArrowLeftRight className="mr-1.5 size-4" />
                    {t("ui.HorasEntreMarcas.titulo", "Horas entre marcas")}
                  </Link>
                </Button>
                {puedeEditar && (
                  <Button type="button" variant="brand" onClick={nueva}>
                    <Plus className="mr-1.5 size-4" />
                    {t("ui.MarcasPage.nueva", "Nueva marca")}
                  </Button>
                )}
              </div>
            ) : undefined
          }
          icon={<Layers />}
          subtitle={t(
            "ui.MarcasPage.subtitulo",
            "Cada marca es una empresa aparte, con sus propios clientes y su planilla. Los vigilantes, el horario y el mapa se comparten.",
          )}
          title={t("ui.MarcasPage.titulo", "Marcas")}
        />

        {!activo ? (
          <EmptyState
            action={
              <Button asChild variant="brand">
                <Link to="/modulos-adicionales">
                  {t("ui.MarcasPage.irALaTienda", "Ver en Módulos adicionales")}
                </Link>
              </Button>
            }
            description={t(
              "ui.MarcasPage.sinModuloDesc",
              "Con el módulo Multimarca manejas varias marcas de seguridad en una sola cuenta.",
            )}
            icon={<Layers />}
            title={t("ui.MarcasPage.sinModulo", "El módulo Multimarca no está activo")}
          />
        ) : lista.isLoading ? (
          <SkeletonCards count={2} />
        ) : lista.isError ? (
          <ErrorDeCarga onRetry={() => lista.refetch()} />
        ) : (
          <div className="space-y-4">
            {restringido && (
              <InfoNote
                icon={<Lock />}
                title={t(
                  "ui.MarcasPage.soloLecturaTitulo",
                  "Ves tus marcas, no las cambias",
                )}
                tone="neutral"
              >
                {mensajeDeAccesoDeMarca("marca_estructura")}
              </InfoNote>
            )}

            {/* ── Phase 4: more brands in use than paid (a refund) ───── */}
            {excedido && !restringido && (
              <FadeIn>
                <div
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4"
                  role="alert"
                  style={{
                    background: "color-mix(in oklab, var(--warn) 10%, transparent)",
                    borderColor: "color-mix(in oklab, var(--warn) 32%, transparent)",
                  }}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <AlertTriangle
                      className="mt-0.5 size-5 shrink-0"
                      style={{ color: "var(--warn-text)" }}
                    />
                    <div className="min-w-0">
                      <div
                        className="text-sm font-semibold"
                        style={{ color: "var(--warn-text)" }}
                      >
                        {t(
                          "ui.MarcasPage.excedidoTitulo",
                          "Usas {{usadas}} marcas y tienes {{pagadas}} pagadas",
                          { usadas: cupos!.used, pagadas: cupos!.paid },
                        )}
                      </div>
                      <p className="mt-0.5 text-sm" style={{ color: "var(--ink-soft)" }}>
                        {t(
                          "ui.MarcasPage.excedidoDesc",
                          "Se devolvió el pago de una marca adicional. Tus marcas y sus datos siguen igual, pero no puedes crear ni volver a activar otra hasta agregar una marca o archivar una que no uses.",
                        )}
                      </p>
                    </div>
                  </div>
                  {puedeEditar && cupo.puede && (
                    <Button
                      disabled={cupo.comprando}
                      type="button"
                      variant="brand"
                      onClick={() => void cupo.comprar()}
                    >
                      <ShoppingCart className="mr-1.5 size-4" />
                      {cupo.precio
                        ? t("ui.MarcasPage.agregarOtra", "Agregar otra marca ({{precio}})", {
                            precio: cupo.precio,
                          })
                        : t("ui.MarcasPage.agregarOtraSinPrecio", "Agregar otra marca")}
                    </Button>
                  )}
                </div>
              </FadeIn>
            )}

            {/* ── Slots: how many brands are paid and in use ────────── */}
            {cupos && !restringido && (
              <FadeIn>
                <Section>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {t(
                          "ui.MarcasPage.cupos",
                          "{{usadas}} de {{pagadas}} marcas en uso",
                          { usadas: cupos.used, pagadas: cupos.paid },
                        )}
                      </div>
                      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                        {excedido
                          ? t(
                              "ui.MarcasPage.cuposExcedidos",
                              "Agrega una marca o archiva una para volver a crear.",
                            )
                          : llenos
                          ? t(
                              "ui.MarcasPage.cuposLlenos",
                              "Para crear otra marca, agrega una más.",
                            )
                          : t(
                              "ui.MarcasPage.cuposLibres",
                              "Marcas que aún puedes crear sin costo: {{n}}.",
                              { n: cupos.paid - cupos.used },
                            )}
                        {cupo.motivo ? ` ${cupo.motivo}` : ""}
                      </p>
                    </div>
                    {puedeEditar && cupo.puede && (
                      <Button
                        disabled={cupo.comprando}
                        type="button"
                        variant={llenos ? "brand" : "outline"}
                        onClick={() => void cupo.comprar()}
                      >
                        <ShoppingCart className="mr-1.5 size-4" />
                        {cupo.precio
                          ? t(
                              "ui.MarcasPage.agregarOtra",
                              "Agregar otra marca ({{precio}})",
                              { precio: cupo.precio },
                            )
                          : t("ui.MarcasPage.agregarOtraSinPrecio", "Agregar otra marca")}
                      </Button>
                    )}
                  </div>
                </Section>
              </FadeIn>
            )}

            <div className="flex items-center justify-end gap-2 text-sm">
              <label
                className="inline-flex cursor-pointer items-center gap-2"
                htmlFor="marcas-archivadas"
                style={{ color: "var(--ink-soft)" }}
              >
                {t("ui.MarcasPage.verArchivadas", "Ver archivadas")}
              </label>
              <Switch
                checked={verArchivadas}
                id="marcas-archivadas"
                onCheckedChange={setVerArchivadas}
              />
            </div>

            {!visibles.length ? (
              <EmptyState
                description={t(
                  "ui.MarcasPage.vacioDesc",
                  "La marca principal se crea sola al activar el módulo.",
                )}
                icon={<Layers />}
                title={t("ui.MarcasPage.vacio", "Todavía no hay marcas")}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {visibles.map((m) => (
                  <TarjetaDeMarca
                    key={m.id}
                    idioma={i18n.language}
                    marca={m}
                    onAbrir={() => {
                      setCreando(false);
                      setEditando(m);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <EditorDeMarca
          abierto={creando || !!editando}
          marca={editando}
          puedeEditar={puedeEditar}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
        />
      </PageContainer>
    </AppLayout>
  );
}

function TarjetaDeMarca({
  marca,
  idioma,
  onAbrir,
}: {
  marca: Marca;
  idioma: string;
  onAbrir: () => void;
}) {
  const { t } = useTranslation();
  const terminos = terminosFiscales(marca.country, idioma, {
    razonSocial: t("ui.EditorDeMarca.razonSocial", "Razón social"),
    idFiscal: t("ui.EditorDeMarca.identificador", "Identificador fiscal"),
  });
  const color = marca.color || "var(--ink-faint)";

  return (
    <GlassPanel
      hover
      className="relative cursor-pointer overflow-hidden p-4 sm:p-5"
      style={{ opacity: marca.archivedAt ? 0.7 : 1 }}
    >
      <button
        aria-label={t("ui.MarcasPage.abrir", "Abrir {{nombre}}", {
          nombre: marca.name,
        })}
        className="cg-focus absolute inset-0 z-10 rounded-[inherit]"
        type="button"
        onClick={onAbrir}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: color }}
      />
      <div className="flex items-start gap-3">
        <LogoDeMarca
          color={marca.color}
          logoUrl={marca.logoUrl}
          nombre={marca.name}
          size={48}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{marca.name}</h3>
            {marca.code && (
              <span className="text-xs font-medium" style={{ color: "var(--ink-faint)" }}>
                {marca.code}
              </span>
            )}
            {marca.isPrincipal && (
              <StatusBadge tone="brand">
                {t("ui.Multimarca.principal", "Principal")}
              </StatusBadge>
            )}
            {marca.archivedAt && (
              <StatusBadge tone="neutral">
                <Archive className="mr-1 inline size-3" />
                {t("ui.MarcasPage.archivada", "Archivada")}
              </StatusBadge>
            )}
          </div>
          <div className="mt-1 truncate text-sm" style={{ color: "var(--ink-soft)" }}>
            {marca.legalName || "—"}
          </div>
          <div className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>
            {terminos.idFiscalLocal || terminos.idFiscal}: {marca.taxId || "—"}
            {marca.country ? ` · ${nombreDePais(marca.country, idioma)}` : ""}
          </div>
          <div
            className="mt-3 flex flex-wrap items-center gap-4 text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" />
              {t("ui.MarcasPage.clientes", "{{n}} clientes", {
                n: marca.counts?.clients ?? 0,
              })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {t("ui.MarcasPage.personas", "{{n}} personas registradas", {
                n: marca.counts?.people ?? 0,
              })}
            </span>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
