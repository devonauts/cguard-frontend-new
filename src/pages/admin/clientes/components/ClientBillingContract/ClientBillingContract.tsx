/**
 * CLIENT › CONTRACT AND RATES — the billing contracts of this client (what
 * the company charges them), each with its rates by post, site and shift
 * type. The operational contract (services, renewals) is the other tab.
 */
import type { Client } from "@/types/client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  FileSignature,
  Pencil,
  Plus,
  Trash2,
  Play,
  Square,
  Ban,
  ClipboardCheck,
} from "lucide-react";

import { TabTable, THead, Th, Tr, TabLoading } from "../_shared/tab-kit";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  Section,
  EmptyState,
  StatusBadge,
  Modal,
  FormField,
  FIELD_CLS,
  Field,
  ListRow,
  InfoNote,
} from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import { postSiteService } from "@/lib/api/postSiteService";
import { stationService } from "@/lib/api/stationService";
import { soloFechaCivil, hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import clientBillingService, {
  BILLING_CYCLES,
  RATE_KINDS,
  RATE_UNITS,
  SHIFT_TYPES,
  type Contract,
  type ContractInput,
  type ContractRate,
  type ContractStatus,
  type PremiumRule,
  type RateInput,
  type RateKind,
  type RateUnit,
  type ShiftType,
  type BillingCycle,
} from "@/lib/api/clientBillingService";
import {
  QK,
  dinero,
  porcentaje,
  useEtiquetasDeFacturacion,
  mensajeDeError,
  NuevaCorridaModal,
  conModuloDeFacturacion,
} from "@/pages/admin/facturacion/comun";
import { ReglaDeRecargo } from "@/pages/admin/facturacion/ReglaDeRecargo";

function ClientBillingContract({ client }: { client: Client }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const etiquetas = useEtiquetasDeFacturacion();
  const canCreate = hasPermission("billingCreate");
  const canEdit = hasPermission("billingEdit");
  const lista = useQuery({
    queryKey: [QK, "contracts", { clientAccountId: client.id }],
    queryFn: async () =>
      (await clientBillingService.contracts({ clientAccountId: client.id }))
        .contracts,
  });
  const contratos: Contract[] = lista.data ?? [];
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<Contract | "new" | null>(null);
  const [tarifa, setTarifa] = useState<Partial<ContractRate> | null>(null);
  const [corrida, setCorrida] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    if (!contratos.length) {
      setSel(null);

      return;
    }
    if (!sel || !contratos.some((c) => c.id === sel))
      setSel(
        contratos.find((c) => c.status === "active")?.id ?? contratos[0].id,
      );
  }, [contratos, sel]);

  const contrato = contratos.find((c) => c.id === sel) ?? null;
  const refrescar = () => qc.invalidateQueries({ queryKey: [QK, "contracts"] });

  const cambiarEstado = async (c: Contract, status: ContractStatus) => {
    const titulos: Record<ContractStatus, string> = {
      draft: t("ui.ClientBillingContract.volverABorrador", "Volver a borrador"),
      active: t("ui.ClientBillingContract.activar", "Activar"),
      ended: t("ui.ClientBillingContract.terminar", "Terminar"),
      cancelled: t(
        "ui.ClientBillingContract.cancelarContrato",
        "Cancelar contrato",
      ),
    };
    const mensajes: Record<ContractStatus, string> = {
      draft: "",
      active: t(
        "ui.ClientBillingContract.activarConfirm",
        "Hace falta al menos una tarifa (y una orden de compra si el contrato la exige). A partir de ahora se pueden generar corridas.",
      ),
      ended: t(
        "ui.ClientBillingContract.terminarConfirm",
        "No se generan más corridas de este contrato. Las facturas emitidas no cambian.",
      ),
      cancelled: t(
        "ui.ClientBillingContract.cancelarConfirm",
        "El contrato queda cancelado y no se puede reactivar.",
      ),
    };

    if (
      !(await confirmDialog({
        title: titulos[status],
        message: mensajes[status],
        tone: status === "cancelled" ? "danger" : "default",
        confirmText: titulos[status],
      }))
    )
      return;
    setTrabajando(true);
    try {
      await clientBillingService.setContractStatus(c.id, status);
      toast.success(
        t("ui.ClientBillingContract.estadoCambiado", "Contrato {{s}}", {
          s: etiquetas.contractStatus[status].toLowerCase(),
        }),
      );
      await refrescar();
    } catch (e) {
      toast.error(
        mensajeDeError(
          e,
          t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"),
        ),
      );
    } finally {
      setTrabajando(false);
    }
  };

  const borrarTarifa = async (r: ContractRate) => {
    if (!contrato) return;
    if (
      !(await confirmDialog({
        title: t("ui.ClientBillingContract.eliminarTarifa", "Eliminar tarifa"),
        message: t(
          "ui.ClientBillingContract.eliminarTarifaConfirm",
          "Las corridas ya generadas no cambian.",
        ),
        tone: "danger",
        confirmText: t(
          "ui.ClientBillingContract.eliminarTarifa",
          "Eliminar tarifa",
        ),
      }))
    )
      return;
    try {
      await clientBillingService.deleteRate(contrato.id, r.id);
      toast.success(
        t("ui.ClientBillingContract.tarifaEliminada", "Tarifa eliminada"),
      );
      await refrescar();
    } catch (e) {
      toast.error(
        mensajeDeError(
          e,
          t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"),
        ),
      );
    }
  };

  if (lista.isLoading) return <TabLoading count={3} />;

  const regla = (r: PremiumRule | null, inherit: string) =>
    !r
      ? inherit
      : r.mode === "none"
        ? etiquetas.ruleMode.none
        : r.mode === "multiplier"
          ? `× ${(r.value / 100).toFixed(2)}`
          : `+ ${dinero(r.value, contrato?.currency)}/h`;
  const deLaEmpresa = t(
    "ui.ClientBillingContract.segunLaEmpresa",
    "Según la empresa",
  );

  return (
    <div className="space-y-4 p-1">
      <Section
        action={
          canCreate ? (
            <Button variant="brand" onClick={() => setForm("new")}>
              <Plus size={14} />{" "}
              {t("ui.ClientBillingContract.nuevoContrato", "Nuevo contrato")}
            </Button>
          ) : undefined
        }
        icon={<FileSignature />}
        title={t("ui.ClientBillingContract.titulo", "Contratos de facturación")}
      >
        {!contratos.length ? (
          <EmptyState
            action={
              canCreate ? (
                <Button variant="brand" onClick={() => setForm("new")}>
                  {t(
                    "ui.ClientBillingContract.nuevoContrato",
                    "Nuevo contrato",
                  )}
                </Button>
              ) : undefined
            }
            description={t(
              "ui.ClientBillingContract.vacioDesc",
              "Sin contrato activo y tarifas no se pueden generar corridas ni facturar sus turnos.",
            )}
            icon={<FileSignature />}
            title={t(
              "ui.ClientBillingContract.vacio",
              "Este cliente no tiene contrato de facturación",
            )}
            variant="inline"
          />
        ) : (
          <div className="space-y-2">
            {contratos.map((c) => (
              <ListRow
                key={c.id}
                badges={
                  <StatusBadge tone={etiquetas.contractTone[c.status]}>
                    {etiquetas.contractStatus[c.status]}
                  </StatusBadge>
                }
                className={
                  c.id === sel ? "ring-2 ring-[var(--brand)]" : undefined
                }
                meta={t("ui.ClientBillingContract.tarifasN", "{{n}} tarifas", {
                  n: c.rates?.length ?? 0,
                })}
                subtitle={`${etiquetas.cycle[c.billingCycle]} · ${t("ui.ClientBillingContract.netN", "Net {{n}}", { n: c.paymentTermsDays })} · ${soloFechaCivil(c.startsAt)}${c.endsAt ? ` → ${soloFechaCivil(c.endsAt)}` : ""}`}
                title={`${c.name}${c.number ? ` · ${c.number}` : ""}`}
                onClick={() => setSel(c.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {contrato && (
        <>
          <Section
            action={
              <div className="cg-acciones">
                {canEdit && (
                  <Button variant="outline" onClick={() => setForm(contrato)}>
                    <Pencil size={14} />{" "}
                    {t("ui.Facturacion.detalle.editar", "Editar")}
                  </Button>
                )}
                {canEdit && contrato.status === "draft" && (
                  <Button
                    disabled={trabajando}
                    variant="brand"
                    onClick={() => cambiarEstado(contrato, "active")}
                  >
                    <Play size={14} />{" "}
                    {t("ui.ClientBillingContract.activar", "Activar")}
                  </Button>
                )}
                {canEdit && contrato.status === "active" && (
                  <Button
                    disabled={trabajando}
                    variant="outline"
                    onClick={() => cambiarEstado(contrato, "ended")}
                  >
                    <Square size={14} />{" "}
                    {t("ui.ClientBillingContract.terminar", "Terminar")}
                  </Button>
                )}
                {canEdit &&
                  (contrato.status === "draft" ||
                    contrato.status === "active") && (
                    <Button
                      disabled={trabajando}
                      variant="outline"
                      onClick={() => cambiarEstado(contrato, "cancelled")}
                    >
                      <Ban size={14} />{" "}
                      {t(
                        "ui.ClientBillingContract.cancelarContrato",
                        "Cancelar contrato",
                      )}
                    </Button>
                  )}
                {contrato.status === "active" &&
                  hasPermission("billingCreate") && (
                    <Button variant="outline" onClick={() => setCorrida(true)}>
                      <ClipboardCheck size={14} />{" "}
                      {t("ui.Facturacion.corridas.nueva", "Nueva corrida")}
                    </Button>
                  )}
              </div>
            }
            icon={<FileSignature />}
            title={contrato.name}
          >
            {contrato.status === "draft" && !contrato.rates?.length && (
              <InfoNote className="mb-3" tone="warn">
                {t(
                  "ui.ClientBillingContract.sinTarifasAviso",
                  "Añade al menos una tarifa antes de activar el contrato.",
                )}
              </InfoNote>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field
                label={t("ui.ClientBillingContract.ciclo", "Ciclo")}
                value={etiquetas.cycle[contrato.billingCycle]}
              />
              <Field
                label={t("ui.ClientBillingContract.terminos", "Términos")}
                value={t("ui.ClientBillingContract.netN", "Net {{n}}", {
                  n: contrato.paymentTermsDays,
                })}
              />
              <Field
                label={t("ui.ClientBillingContract.moneda", "Moneda")}
                value={contrato.currency}
              />
              <Field
                label={t("ui.ClientBillingContract.vigencia", "Vigencia")}
                value={`${soloFechaCivil(contrato.startsAt)}${contrato.endsAt ? ` → ${soloFechaCivil(contrato.endsAt)}` : ""}`}
              />
              <Field
                label={t(
                  "ui.Facturacion.facturas.ordenDeCompra",
                  "Orden de compra (PO)",
                )}
                value={
                  contrato.poNumber ||
                  (contrato.poRequired
                    ? t(
                        "ui.ClientBillingContract.poObligatoriaFalta",
                        "Obligatoria · falta",
                      )
                    : "—")
                }
              />
              <Field
                label={t(
                  "ui.ClientBillingContract.contactoAp",
                  "Contacto de cuentas por pagar",
                )}
                value={
                  [contrato.apContactName, contrato.apEmail]
                    .filter(Boolean)
                    .join(" · ") || "—"
                }
              />
              <Field
                label={t(
                  "ui.ClientBillingContract.exentoDeImpuestos",
                  "Exento de impuestos",
                )}
                value={
                  contrato.taxExempt
                    ? t("ui.Facturacion.ajustes.si", "Sí")
                    : t("ui.Facturacion.ajustes.no", "No")
                }
              />
              <Field
                label={t(
                  "ui.ClientBillingContract.revisionDelCliente",
                  "Revisión del cliente antes de facturar",
                )}
                value={
                  contrato.clientReviewBeforeInvoice
                    ? t("ui.Facturacion.ajustes.si", "Sí")
                    : t("ui.Facturacion.ajustes.no", "No")
                }
              />
              <Field
                label={t("ui.Facturacion.ajustes.horasExtra", "Horas extra")}
                value={regla(contrato.overtimeRule, deLaEmpresa)}
              />
              <Field
                label={t("ui.Facturacion.ajustes.festivos", "Festivos")}
                value={regla(contrato.holidayRule, deLaEmpresa)}
              />
              <Field
                label={t(
                  "ui.Facturacion.recargo.lastMinute",
                  "Cobertura de último minuto",
                )}
                value={regla(
                  contrato.lastMinuteCoverageRule,
                  etiquetas.ruleMode.none,
                )}
              />
              <Field
                label={t(
                  "ui.Facturacion.ajustes.recargoPorMora",
                  "Recargo por mora (%)",
                )}
                value={
                  contrato.lateFeeBps == null
                    ? deLaEmpresa
                    : `${porcentaje(contrato.lateFeeBps)} · ${t("ui.ClientBillingContract.graciaN", "{{n}} días de gracia", { n: contrato.lateFeeGraceDays ?? 0 })}`
                }
              />
              <Field
                label={t(
                  "ui.Facturacion.ajustes.redondeo",
                  "Redondeo de minutos",
                )}
                value={
                  contrato.roundingMinutes == null
                    ? deLaEmpresa
                    : String(contrato.roundingMinutes)
                }
              />
              <Field
                label={t(
                  "ui.ClientBillingContract.minimoFacturable",
                  "Mínimo facturable (min)",
                )}
                value={
                  contrato.minBillableMinutes == null
                    ? "—"
                    : String(contrato.minBillableMinutes)
                }
              />
              <Field
                label={t("ui.ClientBillingContract.prefacturar", "Prefacturar")}
                value={
                  contrato.prebill
                    ? t("ui.Facturacion.ajustes.si", "Sí")
                    : t("ui.Facturacion.ajustes.no", "No")
                }
              />
              <Field
                label={t("ui.ClientBillingContract.autopago", "Autopago")}
                value={
                  contrato.autopay
                    ? t("ui.Facturacion.ajustes.si", "Sí")
                    : t("ui.Facturacion.ajustes.no", "No")
                }
              />
            </div>
            {contrato.notes && (
              <p
                className="mt-3 whitespace-pre-wrap text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                {contrato.notes}
              </p>
            )}
          </Section>

          <Section
            bare
            action={
              canEdit &&
              contrato.status !== "cancelled" &&
              contrato.status !== "ended" ? (
                <Button
                  variant="brand"
                  onClick={() =>
                    setTarifa({
                      kind: "hourly",
                      shiftType: "any",
                      unit: "hour",
                      taxable: true,
                      quantityPerCycle: 1,
                    })
                  }
                >
                  <Plus size={14} />{" "}
                  {t("ui.ClientBillingContract.nuevaTarifa", "Nueva tarifa")}
                </Button>
              ) : undefined
            }
            title={t("ui.ClientBillingContract.tarifas", "Tarifas")}
          >
            <TabTable minWidth={900}>
              <THead>
                <Th>{t("ui.ClientBillingContract.tipo", "Tipo")}</Th>
                <Th>{t("ui.ClientBillingContract.turno", "Turno")}</Th>
                <Th>{t("ui.ClientBillingContract.alcance", "Alcance")}</Th>
                <Th>
                  {t("ui.Facturacion.facturas.descripcion", "Descripción")}
                </Th>
                <Th align="right">
                  {t("ui.ClientBillingContract.precio", "Precio")}
                </Th>
                <Th align="right">
                  {t(
                    "ui.ClientBillingContract.cantidadPorCiclo",
                    "Cant./ciclo",
                  )}
                </Th>
                <Th>{t("ui.ClientBillingContract.vigencia", "Vigencia")}</Th>
                <Th>{t("ui.Facturacion.facturas.gravable", "Gravable")}</Th>
                <Th />
              </THead>
              <tbody>
                {(contrato.rates ?? []).map((r) => (
                  <Tr key={r.id}>
                    <td className="px-3 py-2 font-medium">
                      {etiquetas.rateKind[r.kind]}
                    </td>
                    <td className="px-3 py-2">
                      {etiquetas.shiftType[r.shiftType]}
                    </td>
                    <td className="px-3 py-2">
                      <Alcance clientId={client.id} rate={r} />
                    </td>
                    <td className="px-3 py-2">{r.description || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {dinero(r.unitCents, contrato.currency)} /{" "}
                      {etiquetas.unit[r.unit]}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.kind === "hourly" ? "—" : r.quantityPerCycle}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.effectiveFrom || r.effectiveTo
                        ? `${soloFechaCivil(r.effectiveFrom)} → ${r.effectiveTo ? soloFechaCivil(r.effectiveTo) : "…"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.taxable
                        ? t("ui.Facturacion.ajustes.si", "Sí")
                        : t("ui.Facturacion.ajustes.no", "No")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canEdit && (
                        <span className="inline-flex gap-1">
                          <Button
                            size="icon"
                            title={t("ui.Facturacion.detalle.editar", "Editar")}
                            variant="ghost"
                            onClick={() => setTarifa(r)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="icon"
                            title={t(
                              "ui.ClientBillingContract.eliminarTarifa",
                              "Eliminar tarifa",
                            )}
                            variant="ghost"
                            onClick={() => borrarTarifa(r)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </span>
                      )}
                    </td>
                  </Tr>
                ))}
                {!(contrato.rates ?? []).length && (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-sm"
                      colSpan={9}
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t(
                        "ui.ClientBillingContract.sinTarifas",
                        "Sin tarifas. La más específica gana: puesto › sede › todo el contrato; turno exacto › cualquiera.",
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </TabTable>
          </Section>
        </>
      )}

      {form && (
        <ContratoModal
          client={client}
          inicial={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={async (c) => {
            setForm(null);
            await refrescar();
            setSel(c.id);
          }}
        />
      )}
      {tarifa && contrato && (
        <TarifaModal
          clientId={client.id}
          contrato={contrato}
          inicial={tarifa}
          onClose={() => setTarifa(null)}
          onSaved={async () => {
            setTarifa(null);
            await refrescar();
          }}
        />
      )}
      {corrida && (
        <NuevaCorridaModal
          clientAccountId={client.id}
          onClose={() => setCorrida(false)}
          onCreated={(r) => {
            setCorrida(false);
            navigate(`/facturacion/corridas/${r.id}`);
          }}
        />
      )}
    </div>
  );
}

/* ── Sites and posts of this client, for the rate scope ───────────────────── */
function useSedesYPuestos(clientId: string, postSiteId?: string | null) {
  const sedes = useQuery({
    queryKey: [QK, "sites", clientId],
    queryFn: async () =>
      (await postSiteService.list({ clientId }, { limit: 200, offset: 0 }))
        .rows,
    staleTime: 60_000,
  });
  const puestos = useQuery({
    queryKey: [QK, "stations", clientId, postSiteId || ""],
    queryFn: async () =>
      (
        await stationService.list(
          {
            clientId,
            ...(postSiteId ? { postSite: postSiteId } : {}),
          } as never,
          { limit: 500, offset: 0 },
        )
      ).rows,
    staleTime: 60_000,
  });

  return { sedes: sedes.data ?? [], puestos: puestos.data ?? [] };
}

function Alcance({ rate, clientId }: { rate: ContractRate; clientId: string }) {
  const { t } = useTranslation();
  const { sedes, puestos } = useSedesYPuestos(clientId);
  const nombre = (
    rows: Array<{ id?: string; name?: string; stationName?: string }>,
    id: string | null,
  ) =>
    id
      ? rows.find((x) => x.id === id)?.name ||
        (rows.find((x) => x.id === id) as { stationName?: string } | undefined)
          ?.stationName ||
        id.slice(0, 8)
      : null;

  if (rate.stationId)
    return (
      <span>
        {t("ui.ClientBillingContract.puesto", "Puesto")}:{" "}
        {nombre(puestos as never, rate.stationId)}
      </span>
    );
  if (rate.postSiteId)
    return (
      <span>
        {t("ui.ClientBillingContract.sede", "Sede")}:{" "}
        {nombre(sedes as never, rate.postSiteId)}
      </span>
    );

  return (
    <span style={{ color: "var(--ink-soft)" }}>
      {t("ui.ClientBillingContract.todoElContrato", "Todo el contrato")}
    </span>
  );
}

/* ── Contract form ────────────────────────────────────────────────────────── */
function ContratoModal({
  client,
  inicial,
  onClose,
  onSaved,
}: {
  client: Client;
  inicial: Contract | null;
  onClose: () => void;
  onSaved: (c: Contract) => Promise<void>;
}) {
  const { t } = useTranslation();
  const etiquetas = useEtiquetasDeFacturacion();
  const [f, setF] = useState<ContractInput>(() =>
    inicial
      ? ({
          ...inicial,
          rates: undefined,
          clientAccount: undefined,
        } as ContractInput)
      : {
          clientAccountId: client.id,
          name: t(
            "ui.ClientBillingContract.contratoPorDefecto",
            "Contrato de vigilancia",
          ),
          number: "",
          currency: "USD",
          startsAt: hoyEnLaEmpresa(),
          endsAt: null,
          billingCycle: "monthly",
          prebill: false,
          paymentTermsDays: 30,
          poNumber: client.purchaseOrder || "",
          poRequired: false,
          apEmail: client.email || "",
          apContactName: "",
          taxExempt: false,
          taxCertificateUrl: "",
          clientReviewBeforeInvoice: false,
          autopay: false,
          lateFeeBps: null,
          lateFeeGraceDays: null,
          overtimeRule: null,
          holidayRule: null,
          lastMinuteCoverageRule: null,
          roundingMinutes: null,
          minBillableMinutes: null,
          notes: "",
        },
  );
  const [moraPropia, setMoraPropia] = useState(inicial?.lateFeeBps != null);
  const [redondeoPropio, setRedondeoPropio] = useState(
    inicial?.roundingMinutes != null,
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ContractInput>(k: K, v: ContractInput[K]) =>
    setF((x) => ({ ...x, [k]: v }));
  const num = (s: string) => {
    const n = Number(s);

    return Number.isFinite(n) ? n : 0;
  };
  const listo = !!f.name?.trim() && !!f.startsAt;

  const guardar = async () => {
    setSaving(true);
    try {
      const body: ContractInput = {
        ...f,
        number: f.number || null,
        poNumber: f.poNumber || null,
        apEmail: f.apEmail || null,
        apContactName: f.apContactName || null,
        taxCertificateUrl: f.taxCertificateUrl || null,
        notes: f.notes || null,
        endsAt: f.endsAt || null,
        lateFeeBps: moraPropia ? (f.lateFeeBps ?? 0) : null,
        lateFeeGraceDays: moraPropia ? (f.lateFeeGraceDays ?? 0) : null,
        roundingMinutes: redondeoPropio ? (f.roundingMinutes ?? 0) : null,
      };
      const r = inicial
        ? await clientBillingService.updateContract(inicial.id, body)
        : await clientBillingService.createContract(body);

      toast.success(
        t("ui.ClientBillingContract.contratoGuardado", "Contrato guardado"),
      );
      await onSaved(r.contract);
    } catch (e) {
      toast.error(
        mensajeDeError(
          e,
          t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const interruptor = (
    k:
      | "prebill"
      | "poRequired"
      | "taxExempt"
      | "clientReviewBeforeInvoice"
      | "autopay",
    label: string,
    hint?: string,
  ) => (
    <label key={k} className="flex items-center justify-between gap-3 text-sm">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && (
          <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
            {hint}
          </span>
        )}
      </span>
      <Switch checked={!!f[k]} onCheckedChange={(v) => set(k, v)} />
    </label>
  );

  return (
    <Modal
      open
      description={t(
        "ui.ClientBillingContract.formDesc",
        "Las reglas en blanco toman el valor de Ajustes de facturación.",
      )}
      footer={
        <div className="cg-acciones justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("ui.Facturacion.cancelar", "Cancelar")}
          </Button>
          <Button disabled={saving || !listo} variant="brand" onClick={guardar}>
            {saving
              ? t("ui.Facturacion.guardando", "Guardando…")
              : t("ui.Facturacion.guardar", "Guardar")}
          </Button>
        </div>
      }
      size="xl"
      title={
        inicial
          ? t("ui.ClientBillingContract.editarContrato", "Editar contrato")
          : t("ui.ClientBillingContract.nuevoContrato", "Nuevo contrato")
      }
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField
          required
          className="sm:col-span-2"
          label={t("ui.ClientBillingContract.nombre", "Nombre")}
        >
          <input
            className={FIELD_CLS}
            value={f.name || ""}
            onChange={(e) => set("name", e.target.value)}
          />
        </FormField>
        <FormField
          label={t("ui.ClientBillingContract.numero", "Número de contrato")}
        >
          <input
            className={FIELD_CLS}
            value={f.number || ""}
            onChange={(e) => set("number", e.target.value)}
          />
        </FormField>
        <FormField
          required
          label={t("ui.ClientBillingContract.empiezaEl", "Empieza el")}
        >
          <input
            className={FIELD_CLS}
            type="date"
            value={f.startsAt || ""}
            onChange={(e) => set("startsAt", e.target.value)}
          />
        </FormField>
        <FormField
          hint={t(
            "ui.ClientBillingContract.terminaElHint",
            "Vacío = indefinido",
          )}
          label={t("ui.ClientBillingContract.terminaEl", "Termina el")}
        >
          <input
            className={FIELD_CLS}
            type="date"
            value={f.endsAt || ""}
            onChange={(e) => set("endsAt", e.target.value || null)}
          />
        </FormField>
        <FormField label={t("ui.ClientBillingContract.moneda", "Moneda")}>
          <input
            className={FIELD_CLS}
            maxLength={3}
            value={f.currency || ""}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </FormField>
        <FormField label={t("ui.ClientBillingContract.ciclo", "Ciclo")}>
          <select
            className={FIELD_CLS}
            value={f.billingCycle || "monthly"}
            onChange={(e) =>
              set("billingCycle", e.target.value as BillingCycle)
            }
          >
            {BILLING_CYCLES.map((c) => (
              <option key={c} value={c}>
                {etiquetas.cycle[c]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          label={t(
            "ui.Facturacion.ajustes.terminosDePago",
            "Términos de pago (días)",
          )}
        >
          <input
            className={FIELD_CLS}
            max={180}
            min={0}
            type="number"
            value={f.paymentTermsDays ?? 30}
            onChange={(e) => set("paymentTermsDays", num(e.target.value))}
          />
        </FormField>
        <FormField
          hint={t(
            "ui.ClientBillingContract.minimoFacturableHint",
            "Un turno corto se factura al menos esto. Vacío = ninguno.",
          )}
          label={t(
            "ui.ClientBillingContract.minimoFacturable",
            "Mínimo facturable (min)",
          )}
        >
          <input
            className={FIELD_CLS}
            min={0}
            type="number"
            value={f.minBillableMinutes ?? ""}
            onChange={(e) =>
              set(
                "minBillableMinutes",
                e.target.value === "" ? null : num(e.target.value),
              )
            }
          />
        </FormField>
        <FormField
          label={t(
            "ui.Facturacion.facturas.ordenDeCompra",
            "Orden de compra (PO)",
          )}
        >
          <input
            className={FIELD_CLS}
            value={f.poNumber || ""}
            onChange={(e) => set("poNumber", e.target.value)}
          />
        </FormField>
        <FormField
          label={t(
            "ui.ClientBillingContract.contactoApNombre",
            "Contacto de cuentas por pagar",
          )}
        >
          <input
            className={FIELD_CLS}
            value={f.apContactName || ""}
            onChange={(e) => set("apContactName", e.target.value)}
          />
        </FormField>
        <FormField
          label={t(
            "ui.ClientBillingContract.correoAp",
            "Correo de cuentas por pagar",
          )}
        >
          <input
            className={FIELD_CLS}
            type="email"
            value={f.apEmail || ""}
            onChange={(e) => set("apEmail", e.target.value)}
          />
        </FormField>
        <FormField
          className="sm:col-span-3"
          label={t(
            "ui.ClientBillingContract.certificadoExencion",
            "Enlace al certificado de exención",
          )}
        >
          <input
            className={FIELD_CLS}
            type="url"
            value={f.taxCertificateUrl || ""}
            onChange={(e) => set("taxCertificateUrl", e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:col-span-3 sm:grid-cols-2">
          {interruptor(
            "poRequired",
            t(
              "ui.ClientBillingContract.poObligatoria",
              "Orden de compra obligatoria",
            ),
            t(
              "ui.ClientBillingContract.poObligatoriaHint",
              "Sin PO no se activa el contrato y la corrida se bloquea.",
            ),
          )}
          {interruptor(
            "taxExempt",
            t(
              "ui.ClientBillingContract.exentoDeImpuestos",
              "Exento de impuestos",
            ),
          )}
          {interruptor(
            "clientReviewBeforeInvoice",
            t(
              "ui.ClientBillingContract.revisionDelCliente",
              "Revisión del cliente antes de facturar",
            ),
            t(
              "ui.ClientBillingContract.revisionDelClienteHint",
              "El cliente aprueba las horas desde un enlace antes de que salga la factura.",
            ),
          )}
          {interruptor(
            "prebill",
            t("ui.ClientBillingContract.prefacturar", "Prefacturar"),
            t(
              "ui.ClientBillingContract.prefacturarHint",
              "Los importes fijos se cobran al empezar el periodo.",
            ),
          )}
          {interruptor(
            "autopay",
            t("ui.ClientBillingContract.autopago", "Autopago"),
          )}
        </div>

        <div className="space-y-4 sm:col-span-3">
          <ReglaDeRecargo
            allowDefault
            currency={f.currency || "USD"}
            label={t("ui.Facturacion.ajustes.horasExtra", "Horas extra")}
            value={f.overtimeRule ?? null}
            onChange={(v) => set("overtimeRule", v)}
          />
          <ReglaDeRecargo
            allowDefault
            withPriority
            currency={f.currency || "USD"}
            label={t("ui.Facturacion.ajustes.festivos", "Festivos")}
            value={f.holidayRule ?? null}
            onChange={(v) => set("holidayRule", v)}
          />
          <ReglaDeRecargo
            currency={f.currency || "USD"}
            label={t(
              "ui.Facturacion.recargo.lastMinute",
              "Cobertura de último minuto",
            )}
            value={f.lastMinuteCoverageRule ?? null}
            onChange={(v) => set("lastMinuteCoverageRule", v)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:col-span-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <Switch checked={moraPropia} onCheckedChange={setMoraPropia} />{" "}
            {t(
              "ui.ClientBillingContract.moraPropia",
              "Recargo por mora propio del contrato",
            )}
          </label>
          {moraPropia && (
            <>
              <FormField
                label={t(
                  "ui.Facturacion.ajustes.recargoPorMora",
                  "Recargo por mora (%)",
                )}
              >
                <input
                  className={FIELD_CLS}
                  inputMode="decimal"
                  value={((f.lateFeeBps ?? 0) / 100).toFixed(2)}
                  onChange={(e) =>
                    set(
                      "lateFeeBps",
                      Math.round(num(e.target.value.replace(",", ".")) * 100),
                    )
                  }
                />
              </FormField>
              <FormField
                label={t(
                  "ui.Facturacion.ajustes.diasDeGracia",
                  "Días de gracia",
                )}
              >
                <input
                  className={FIELD_CLS}
                  min={0}
                  type="number"
                  value={f.lateFeeGraceDays ?? 0}
                  onChange={(e) => set("lateFeeGraceDays", num(e.target.value))}
                />
              </FormField>
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <Switch
              checked={redondeoPropio}
              onCheckedChange={setRedondeoPropio}
            />{" "}
            {t(
              "ui.ClientBillingContract.redondeoPropio",
              "Redondeo de minutos propio del contrato",
            )}
          </label>
          {redondeoPropio && (
            <FormField
              label={t(
                "ui.Facturacion.ajustes.redondeo",
                "Redondeo de minutos",
              )}
            >
              <input
                className={FIELD_CLS}
                max={60}
                min={0}
                type="number"
                value={f.roundingMinutes ?? 0}
                onChange={(e) => set("roundingMinutes", num(e.target.value))}
              />
            </FormField>
          )}
        </div>

        <FormField
          className="sm:col-span-3"
          label={t("ui.ClientBillingContract.notas", "Notas internas")}
        >
          <textarea
            className={`${FIELD_CLS} h-20`}
            value={f.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}

/* ── Rate form ────────────────────────────────────────────────────────────── */
function TarifaModal({
  contrato,
  clientId,
  inicial,
  onClose,
  onSaved,
}: {
  contrato: Contract;
  clientId: string;
  inicial: Partial<ContractRate>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const etiquetas = useEtiquetasDeFacturacion();
  const [kind, setKind] = useState<RateKind>(inicial.kind || "hourly");
  const [shiftType, setShiftType] = useState<ShiftType>(
    inicial.shiftType || "any",
  );
  const [postSiteId, setPostSiteId] = useState(inicial.postSiteId || "");
  const [stationId, setStationId] = useState(inicial.stationId || "");
  const [description, setDescription] = useState(inicial.description || "");
  const [unit, setUnit] = useState<RateUnit>(inicial.unit || "hour");
  const [precio, setPrecio] = useState(
    ((inicial.unitCents ?? 0) / 100).toFixed(2),
  );
  const [quantityPerCycle, setQuantityPerCycle] = useState(
    String(inicial.quantityPerCycle ?? 1),
  );
  const [taxable, setTaxable] = useState(inicial.taxable !== false);
  const [effectiveFrom, setEffectiveFrom] = useState(
    inicial.effectiveFrom || "",
  );
  const [effectiveTo, setEffectiveTo] = useState(inicial.effectiveTo || "");
  const [overtimeRule, setOvertimeRule] = useState<PremiumRule | null>(
    inicial.overtimeRule ?? null,
  );
  const [holidayRule, setHolidayRule] = useState<PremiumRule | null>(
    inicial.holidayRule ?? null,
  );
  const [saving, setSaving] = useState(false);
  const { sedes, puestos } = useSedesYPuestos(clientId, postSiteId || null);
  const unitCents = Math.round(
    (Number(String(precio).replace(",", ".")) || 0) * 100,
  );
  const listo =
    unitCents >= 0 && (kind === "hourly" || Number(quantityPerCycle) > 0);

  useEffect(() => {
    if (kind === "hourly") setUnit("hour");
  }, [kind]);

  const guardar = async () => {
    setSaving(true);
    try {
      const body: RateInput = {
        kind,
        shiftType,
        postSiteId: postSiteId || null,
        stationId: stationId || null,
        description: description.trim() || null,
        unit,
        unitCents,
        quantityPerCycle:
          kind === "hourly" ? 1 : Math.max(0, Number(quantityPerCycle) || 0),
        taxable,
        effectiveFrom: effectiveFrom || null,
        effectiveTo: effectiveTo || null,
        overtimeRule,
        holidayRule,
      };

      if (inicial.id)
        await clientBillingService.updateRate(contrato.id, inicial.id, body);
      else await clientBillingService.addRate(contrato.id, body);
      toast.success(
        t("ui.ClientBillingContract.tarifaGuardada", "Tarifa guardada"),
      );
      await onSaved();
    } catch (e) {
      toast.error(
        mensajeDeError(
          e,
          t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const puestosVisibles = useMemo(
    () =>
      puestos as Array<{ id?: string; stationName?: string; name?: string }>,
    [puestos],
  );

  return (
    <Modal
      open
      description={t(
        "ui.ClientBillingContract.tarifaDesc",
        "La más específica gana: puesto › sede › todo el contrato; turno exacto › cualquiera.",
      )}
      footer={
        <div className="cg-acciones justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("ui.Facturacion.cancelar", "Cancelar")}
          </Button>
          <Button disabled={saving || !listo} variant="brand" onClick={guardar}>
            {saving
              ? t("ui.Facturacion.guardando", "Guardando…")
              : t("ui.Facturacion.guardar", "Guardar")}
          </Button>
        </div>
      }
      size="lg"
      title={
        inicial.id
          ? t("ui.ClientBillingContract.editarTarifa", "Editar tarifa")
          : t("ui.ClientBillingContract.nuevaTarifa", "Nueva tarifa")
      }
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField required label={t("ui.ClientBillingContract.tipo", "Tipo")}>
          <select
            className={FIELD_CLS}
            value={kind}
            onChange={(e) => setKind(e.target.value as RateKind)}
          >
            {RATE_KINDS.map((k) => (
              <option key={k} value={k}>
                {etiquetas.rateKind[k]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("ui.ClientBillingContract.turno", "Turno")}>
          <select
            className={FIELD_CLS}
            value={shiftType}
            onChange={(e) => setShiftType(e.target.value as ShiftType)}
          >
            {SHIFT_TYPES.map((s) => (
              <option key={s} value={s}>
                {etiquetas.shiftType[s]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("ui.ClientBillingContract.unidad", "Unidad")}>
          <select
            className={FIELD_CLS}
            disabled={kind === "hourly"}
            value={unit}
            onChange={(e) => setUnit(e.target.value as RateUnit)}
          >
            {RATE_UNITS.map((u) => (
              <option key={u} value={u}>
                {etiquetas.unit[u]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          hint={t(
            "ui.ClientBillingContract.sedeHint",
            "Vacío = todas las sedes del cliente",
          )}
          label={t("ui.ClientBillingContract.sede", "Sede")}
        >
          <select
            className={FIELD_CLS}
            value={postSiteId}
            onChange={(e) => {
              setPostSiteId(e.target.value);
              setStationId("");
            }}
          >
            <option value="">
              {t("ui.ClientBillingContract.todasLasSedes", "Todas las sedes")}
            </option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          hint={t(
            "ui.ClientBillingContract.puestoHint",
            "Vacío = todos los puestos",
          )}
          label={t("ui.ClientBillingContract.puesto", "Puesto")}
        >
          <select
            className={FIELD_CLS}
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
          >
            <option value="">
              {t(
                "ui.ClientBillingContract.todosLosPuestos",
                "Todos los puestos",
              )}
            </option>
            {puestosVisibles
              .filter((p) => p.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.stationName || p.name}
                </option>
              ))}
          </select>
        </FormField>
        <FormField
          required
          hint={`${dinero(unitCents, contrato.currency)} / ${etiquetas.unit[unit]}`}
          label={t("ui.ClientBillingContract.precio", "Precio")}
        >
          <input
            className={FIELD_CLS}
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </FormField>
        {kind !== "hourly" && (
          <FormField
            required
            hint={t(
              "ui.ClientBillingContract.cantidadPorCicloHint",
              "Unidades que se facturan en cada periodo.",
            )}
            label={t(
              "ui.ClientBillingContract.cantidadPorCiclo",
              "Cant./ciclo",
            )}
          >
            <input
              className={FIELD_CLS}
              min={0}
              type="number"
              value={quantityPerCycle}
              onChange={(e) => setQuantityPerCycle(e.target.value)}
            />
          </FormField>
        )}
        <FormField
          className={kind === "hourly" ? "sm:col-span-3" : "sm:col-span-2"}
          hint={t(
            "ui.ClientBillingContract.descripcionHint",
            "Como sale en la línea de la factura.",
          )}
          label={t("ui.Facturacion.facturas.descripcion", "Descripción")}
        >
          <input
            className={FIELD_CLS}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField
          label={t("ui.ClientBillingContract.vigenteDesde", "Vigente desde")}
        >
          <input
            className={FIELD_CLS}
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </FormField>
        <FormField
          label={t("ui.ClientBillingContract.vigenteHasta", "Vigente hasta")}
        >
          <input
            className={FIELD_CLS}
            type="date"
            value={effectiveTo}
            onChange={(e) => setEffectiveTo(e.target.value)}
          />
        </FormField>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Switch checked={taxable} onCheckedChange={setTaxable} />{" "}
          {t("ui.Facturacion.facturas.gravable", "Gravable")}
        </label>
        {kind === "hourly" && (
          <div className="space-y-3 sm:col-span-3">
            <ReglaDeRecargo
              allowDefault
              currency={contrato.currency}
              label={t(
                "ui.ClientBillingContract.horasExtraDeLaTarifa",
                "Horas extra (esta tarifa)",
              )}
              value={overtimeRule}
              onChange={setOvertimeRule}
            />
            <ReglaDeRecargo
              allowDefault
              withPriority
              currency={contrato.currency}
              label={t(
                "ui.ClientBillingContract.festivosDeLaTarifa",
                "Festivos (esta tarifa)",
              )}
              value={holidayRule}
              onChange={setHolidayRule}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export default conModuloDeFacturacion(ClientBillingContract, { pagina: false });
