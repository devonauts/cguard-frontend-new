/**
 * CAMPAIGN EDITOR — a banner the company shows inside its guards' app to keep
 * the backup bench full (join the reserve, «hoy estoy disponible», cover
 * another post…). Form on the left, the guard's phone on the right with the
 * banner drawn in the app's own colours (the same `PhonePreview` as the
 * mobile hub, off-duty home, which is the only place campaigns appear).
 *
 * Rules the server keeps (contract): one banner at a time per guard, never on
 * the on-duty screen, push respects quiet hours, `{{empresa}}` and `{{bono}}`
 * are filled per guard.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ImagePlus, Megaphone, Send, Trash2 } from "lucide-react";

import BannerDeCampana from "./BannerDeCampana";
import { rutaDeLaAppValida } from "./logica";
import { dinero, nombreDePuesto, useEtiquetasDobletes } from "./comun";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormField,
  InfoNote,
  Modal,
  Segmented,
  StatusBadge,
} from "@/components/kit";
import {
  NumberRow,
  ToggleRow,
} from "@/pages/admin/Configuration/components/SettingsForm";
import {
  DEFAULT_ACCENT,
  PhonePreview,
  type ModuleKey,
} from "@/pages/admin/Configuration/mobile-hub/MobileHubPage";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { getStoredTenantBranding } from "@/lib/tenantBranding";
import dobletesService, {
  type CampaignDraft,
  type CampaignTemplate,
  type CtaAction,
  type Placement,
} from "@/lib/api/dobletesService";
import { desdeInputFechaHora, paraInputFechaHora } from "@/lib/horaDeLaEmpresa";

/** Keeps the campaign placeholders as text (they are filled per guard). */
const LITERALES = { empresa: "{{empresa}}", bono: "{{bono}}" };

const CTA: CtaAction[] = [
  "join_reserve",
  "available_today",
  "open_offers",
  "qualify_post",
  "route",
];

export function campanaVacia(): CampaignDraft {
  return {
    title: "",
    body: "",
    imageUrl: null,
    imagePreviewUrl: null,
    ctaLabel: "",
    ctaAction: "join_reserve",
    ctaRoute: null,
    accent: null,
    template: null,
    placement: "dashboard",
    audience: {
      branchIds: [],
      stationIds: [],
      notInReserve: true,
      staleAvailabilityDays: null,
      qualifiedForStationIds: [],
    },
    startsAt: null,
    endsAt: null,
    priority: 0,
    active: false,
    pushOnPublish: false,
    reshowAfterDismissDays: 7,
  };
}

/** Built-in templates, used when the server sends none (texts in the screen's language). */
export function usePlantillasBase(): CampaignTemplate[] {
  const { t } = useTranslation();

  return [
    {
      key: "join_reserve",
      title: t("dobletes.plantillas.reserva.titulo", {
        defaultValue: "Únete a la reserva de {{empresa}}",
        ...LITERALES,
      }),
      body: t("dobletes.plantillas.reserva.texto", {
        defaultValue:
          "Cubre turnos extra cuando tú quieras y gana {{bono}} por cada doblete. Tú eliges los días.",
        ...LITERALES,
      }),
      ctaLabel: t("dobletes.plantillas.reserva.boton", "Quiero unirme"),
      ctaAction: "join_reserve",
      audience: { notInReserve: true },
    },
    {
      key: "available_today",
      title: t("dobletes.plantillas.hoy.titulo", "¿Libre hoy?"),
      body: t(
        "dobletes.plantillas.hoy.texto",
        "Marca que estás disponible y las ofertas de hoy te llegan primero.",
      ),
      ctaLabel: t("dobletes.plantillas.hoy.boton", "Hoy estoy disponible"),
      ctaAction: "available_today",
      audience: { notInReserve: false },
    },
    {
      key: "qualify_post",
      title: t(
        "dobletes.plantillas.puesto.titulo",
        "Buscamos suplentes para otros puestos",
      ),
      body: t("dobletes.plantillas.puesto.texto", {
        defaultValue:
          "Apúntate para cubrir más puestos de {{empresa}}: más ofertas para ti y {{bono}} por cada doblete.",
        ...LITERALES,
      }),
      ctaLabel: t("dobletes.plantillas.puesto.boton", "Apuntarme"),
      ctaAction: "qualify_post",
      audience: { notInReserve: false },
    },
    {
      key: "open_offers",
      title: t(
        "dobletes.plantillas.ofertas.titulo",
        "Hay turnos extra esta semana",
      ),
      body: t(
        "dobletes.plantillas.ofertas.texto",
        "Mira las ofertas abiertas: el primero que acepta se queda el turno.",
      ),
      ctaLabel: t("dobletes.plantillas.ofertas.boton", "Ver ofertas"),
      ctaAction: "open_offers",
      audience: { notInReserve: false },
    },
  ];
}

type AjustesDeLaApp = {
  logoUrl?: string;
  logos?: Array<{ downloadUrl?: string }>;
  mobileAppSettings?: {
    accentColor?: string;
    fontFamily?: string;
    displayName?: string;
    tagline?: string;
    useTenantLogo?: boolean;
    defaultTheme?: string;
    modules?: Partial<Record<ModuleKey, boolean>>;
  };
};

export default function EditorDeCampana({
  open,
  onOpenChange,
  inicial,
  puestos,
  bonoCents,
  moneda,
  decimales,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  inicial: CampaignDraft | null;
  /** Posts to aim at (from the bench). */
  puestos: Array<{
    stationId: string;
    stationName: string | null;
    nickname: string | null;
  }>;
  /** The company's default doblete bonus, to fill `{{bono}}` in the preview. */
  bonoCents: number | null;
  moneda: string;
  decimales: 0 | 2;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const et = useEtiquetasDobletes();
  const { platformName } = useWhiteLabel();
  const plantillasBase = usePlantillasBase();
  const [c, setC] = useState<CampaignDraft>(inicial ?? campanaVacia());
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const archivo = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) setC(inicial ?? campanaVacia());
  }, [open, inicial]);

  const servidor = useQuery({
    queryKey: ["dobletes", "templates"],
    queryFn: () => dobletesService.templates(),
    enabled: open,
    staleTime: 10 * 60_000,
  });
  const plantillas = servidor.data?.length ? servidor.data : plantillasBase;

  const app = useQuery({
    queryKey: ["dobletes", "app-settings"],
    queryFn: async () => {
      const { data } = await api.get(
        `/tenant/${localStorage.getItem("tenantId") || ""}/settings`,
      );

      return (data || {}) as AjustesDeLaApp;
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const m = app.data?.mobileAppSettings || {};
  // The app header shows the app's name; `{{empresa}}` is the COMPANY's name.
  const nombreApp = m.displayName || platformName;
  const empresa = getStoredTenantBranding().name || nombreApp;
  const logo =
    m.useTenantLogo === false
      ? null
      : app.data?.logoUrl || app.data?.logos?.[0]?.downloadUrl || null;
  const bonoTexto = bonoCents
    ? dinero(bonoCents, moneda, decimales)
    : t("dobletes.campanas.unBono", "un bono");

  const set = <K extends keyof CampaignDraft>(k: K, v: CampaignDraft[K]) =>
    setC((x) => ({ ...x, [k]: v }));
  const setAud = <K extends keyof CampaignDraft["audience"]>(
    k: K,
    v: CampaignDraft["audience"][K],
  ) => setC((x) => ({ ...x, audience: { ...x.audience, [k]: v } }));

  const aplicarPlantilla = (p: CampaignTemplate) =>
    setC((x) => ({
      ...x,
      template: p.key,
      title: p.title,
      body: p.body,
      ctaLabel: p.ctaLabel,
      ctaAction: p.ctaAction,
      accent: p.accent ?? null,
      audience: { ...x.audience, ...(p.audience || {}) },
    }));

  const subirImagen = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      toast.error(
        t("dobletes.campanas.imagenTipo", "Usa una imagen PNG, JPG o WebP."),
      );

      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error(
        t("dobletes.campanas.imagenPeso", "La imagen pesa más de 8 MB."),
      );

      return;
    }
    setSubiendo(true);
    try {
      const r = await dobletesService.uploadImage(f);

      setC((x) => ({
        ...x,
        imageUrl: r.imageUrl,
        imagePreviewUrl: r.previewUrl ?? r.imageUrl,
      }));
    } catch {
      /* shown by the API layer */
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };

  const rutaValida = c.ctaAction !== "route" || rutaDeLaAppValida(c.ctaRoute);
  const fechasValidas =
    !c.startsAt || !c.endsAt || new Date(c.endsAt) > new Date(c.startsAt);
  const completa =
    c.title.trim().length > 0 &&
    c.ctaLabel.trim().length > 0 &&
    rutaValida &&
    fechasValidas;

  const guardar = async (publicar: boolean) => {
    setGuardando(true);
    try {
      await dobletesService.saveCampaign({
        ...c,
        active: publicar ? true : c.id ? c.active : false,
      });
      toast.success(
        publicar
          ? c.pushOnPublish
            ? t(
                "dobletes.campanas.publicadaConPush",
                "Campaña publicada. El aviso llega respetando las horas de silencio.",
              )
            : t("dobletes.campanas.publicada", "Campaña publicada")
          : t("dobletes.campanas.guardada", "Campaña guardada"),
      );
      void qc.invalidateQueries({ queryKey: ["dobletes", "campaigns"] });
      onOpenChange(false);
    } catch {
      /* shown by the API layer */
    } finally {
      setGuardando(false);
    }
  };

  const modulos = useMemo(
    () =>
      ({
        training: true,
        performance: true,
        visitors: true,
        timeOff: true,
        backup: true,
        map: true,
        radioNativa: false,
        payslips: false,
        dobletes: true,
        ...(m.modules || {}),
      }) as Record<ModuleKey, boolean>,
    [m.modules],
  );

  const Puestos = ({
    valor,
    onChange,
  }: {
    valor: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <div className="flex flex-wrap gap-1.5">
      {puestos.map((p) => {
        const sel = valor.includes(p.stationId);

        return (
          <button
            key={p.stationId}
            aria-pressed={sel}
            className="cg-focus inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium"
            style={{
              borderColor: sel ? "var(--brand-line)" : "var(--hairline)",
              background: sel ? "var(--brand-wash)" : "transparent",
              color: sel ? "var(--brand-text)" : "var(--ink-soft)",
            }}
            type="button"
            onClick={() =>
              onChange(
                sel
                  ? valor.filter((v) => v !== p.stationId)
                  : [...valor, p.stationId],
              )
            }
          >
            {sel && <Check className="size-3" />}
            {nombreDePuesto(p)}
          </button>
        );
      })}
      {!puestos.length && (
        <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {t(
            "dobletes.reserva.sinPuestos",
            "Todavía no hay puestos configurados.",
          )}
        </span>
      )}
    </div>
  );

  return (
    <Modal
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", "Cancelar")}
          </Button>
          <Button
            disabled={!completa || guardando}
            variant="outline"
            onClick={() => guardar(false)}
          >
            {c.id && c.active
              ? t("dobletes.campanas.guardarCambios", "Guardar cambios")
              : t("dobletes.campanas.guardarBorrador", "Guardar borrador")}
          </Button>
          {!(c.id && c.active) && (
            <Button
              disabled={!completa || guardando}
              variant="brand"
              onClick={() => guardar(true)}
            >
              <Send className="mr-1.5 size-4" />
              {t("dobletes.campanas.publicar", "Publicar")}
            </Button>
          )}
        </>
      }
      icon={<Megaphone />}
      open={open}
      size="xl"
      title={
        c.id
          ? t("dobletes.campanas.editar", "Editar campaña")
          : t("dobletes.campanas.nueva", "Nueva campaña")
      }
      onOpenChange={onOpenChange}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-5">
          <div>
            <p className="cg-eyebrow mb-1.5">
              {t("dobletes.campanas.plantilla", "Empieza con una plantilla")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {plantillas.map((p) => {
                const sel = c.template === p.key;

                return (
                  <button
                    key={p.key}
                    aria-pressed={sel}
                    className="glass-flat glass-hover cg-focus p-3 text-left"
                    style={
                      sel
                        ? {
                            borderColor: "var(--brand-line)",
                            background: "var(--brand-wash)",
                          }
                        : undefined
                    }
                    type="button"
                    onClick={() => aplicarPlantilla(p)}
                  >
                    <p className="truncate text-sm font-semibold">
                      {p.title.replace(/\{\{\s*empresa\s*\}\}/g, empresa)}
                    </p>
                    <p
                      className="mt-0.5 line-clamp-2 text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {et.cta[p.ctaAction]}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <FormField
            full
            required
            htmlFor="cmp-titulo"
            label={t("dobletes.campanas.titulo", "Título")}
          >
            <Input
              id="cmp-titulo"
              maxLength={70}
              value={c.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </FormField>
          <FormField
            full
            hint={t("dobletes.campanas.textoHint", {
              defaultValue:
                "Puedes escribir {{empresa}} y {{bono}}: se reemplazan por el nombre de tu empresa y el bono por doblete.",
              ...LITERALES,
            })}
            htmlFor="cmp-texto"
            label={t("dobletes.campanas.texto", "Texto")}
          >
            <Textarea
              id="cmp-texto"
              maxLength={220}
              rows={3}
              value={c.body}
              onChange={(e) => set("body", e.target.value)}
            />
          </FormField>

          <div>
            <p className="cg-eyebrow mb-1.5">
              {t("dobletes.campanas.imagen", "Imagen (opcional)")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={archivo}
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                type="file"
                onChange={(e) => subirImagen(e.target.files?.[0])}
              />
              <Button
                disabled={subiendo}
                size="sm"
                variant="outline"
                onClick={() => archivo.current?.click()}
              >
                <ImagePlus className="mr-1.5 size-4" />
                {subiendo
                  ? t("dobletes.campanas.subiendo", "Subiendo…")
                  : c.imageUrl
                    ? t("dobletes.campanas.cambiarImagen", "Cambiar imagen")
                    : t("dobletes.campanas.subirImagen", "Subir imagen")}
              </Button>
              {c.imageUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setC((x) => ({
                      ...x,
                      imageUrl: null,
                      imagePreviewUrl: null,
                    }))
                  }
                >
                  <Trash2 className="mr-1 size-3.5" />
                  {t("dobletes.campanas.quitarImagen", "Quitar")}
                </Button>
              )}
              <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "dobletes.campanas.imagenHint",
                  "Horizontal, se ajusta a 1600 px.",
                )}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              full
              required
              htmlFor="cmp-boton"
              label={t("dobletes.campanas.boton", "Texto del botón")}
            >
              <Input
                id="cmp-boton"
                maxLength={28}
                value={c.ctaLabel}
                onChange={(e) => set("ctaLabel", e.target.value)}
              />
            </FormField>
            <FormField
              full
              label={t("dobletes.campanas.accion", "Qué hace el botón")}
            >
              <Select
                value={c.ctaAction}
                onValueChange={(v) => set("ctaAction", v as CtaAction)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CTA.map((a) => (
                    <SelectItem key={a} value={a}>
                      {et.cta[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          {c.ctaAction === "route" && (
            <FormField
              full
              error={
                !rutaValida
                  ? t(
                      "dobletes.campanas.rutaInvalida",
                      "Debe empezar por /guard/",
                    )
                  : undefined
              }
              htmlFor="cmp-ruta"
              label={t("dobletes.campanas.ruta", "Pantalla de la app")}
            >
              <Input
                id="cmp-ruta"
                placeholder="/guard/…"
                value={c.ctaRoute || ""}
                onChange={(e) => set("ctaRoute", e.target.value)}
              />
            </FormField>
          )}

          <div>
            <p className="cg-eyebrow mb-1.5">
              {t("dobletes.campanas.donde", "Dónde aparece")}
            </p>
            <Segmented<Placement>
              options={[
                {
                  value: "dashboard",
                  label: t(
                    "dobletes.campanas.enInicio",
                    "Inicio (fuera de servicio)",
                  ),
                },
                {
                  value: "reserve",
                  label: t(
                    "dobletes.campanas.enReserva",
                    "Pantalla de la reserva",
                  ),
                },
              ]}
              value={c.placement}
              onChange={(v) => set("placement", v)}
            />
          </div>

          <div className="glass-flat divide-y px-4">
            <p className="cg-eyebrow pt-4">
              {t("dobletes.campanas.audiencia", "A quién")}
            </p>
            <ToggleRow
              checked={c.audience.notInReserve}
              hint={t(
                "dobletes.campanas.fueraHint",
                "Sólo quienes todavía no se han unido a la reserva.",
              )}
              label={t("dobletes.campanas.fuera", "Fuera de la reserva")}
              onCheckedChange={(v) => setAud("notInReserve", v)}
            />
            <ToggleRow
              checked={c.audience.staleAvailabilityDays != null}
              hint={t(
                "dobletes.campanas.viejaHint",
                "Miembros que no tocan su disponibilidad hace tiempo.",
              )}
              label={t(
                "dobletes.campanas.vieja",
                "Disponibilidad sin actualizar",
              )}
              onCheckedChange={(v) =>
                setAud("staleAvailabilityDays", v ? 30 : null)
              }
            >
              {c.audience.staleAvailabilityDays != null && (
                <div className="mt-2 max-w-xs">
                  <NumberRow
                    label={t(
                      "dobletes.campanas.viejaDias",
                      "Sin actualizar desde hace",
                    )}
                    max={365}
                    min={7}
                    suffix={t("dobletes.campanas.dias", "días")}
                    value={c.audience.staleAvailabilityDays}
                    onChange={(n) => setAud("staleAvailabilityDays", n ?? 30)}
                  />
                </div>
              )}
            </ToggleRow>
            <div className="py-4">
              <p className="text-sm font-medium">
                {t(
                  "dobletes.campanas.dePuestos",
                  "Vigilantes de estos puestos",
                )}
              </p>
              <p className="mb-2 text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "dobletes.campanas.dePuestosHint",
                  "Ninguno marcado = todos los puestos.",
                )}
              </p>
              <Puestos
                valor={c.audience.stationIds}
                onChange={(ids) => setAud("stationIds", ids)}
              />
            </div>
            <div className="py-4">
              <p className="text-sm font-medium">
                {t("dobletes.campanas.paraCubrir", "Para cubrir estos puestos")}
              </p>
              <p className="mb-2 text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "dobletes.campanas.paraCubrirHint",
                  "Quien toque el botón queda apuntado como suplente de estos puestos.",
                )}
              </p>
              <Puestos
                valor={c.audience.qualifiedForStationIds}
                onChange={(ids) => setAud("qualifiedForStationIds", ids)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              full
              htmlFor="cmp-desde"
              label={t("dobletes.campanas.desde", "Desde")}
            >
              <Input
                id="cmp-desde"
                type="datetime-local"
                value={paraInputFechaHora(c.startsAt)}
                onChange={(e) =>
                  set("startsAt", desdeInputFechaHora(e.target.value) || null)
                }
              />
            </FormField>
            <FormField
              full
              error={
                !fechasValidas
                  ? t(
                      "dobletes.campanas.fechasInvalidas",
                      "Termina antes de empezar.",
                    )
                  : undefined
              }
              htmlFor="cmp-hasta"
              label={t("dobletes.campanas.hasta", "Hasta")}
            >
              <Input
                id="cmp-hasta"
                type="datetime-local"
                value={paraInputFechaHora(c.endsAt)}
                onChange={(e) =>
                  set("endsAt", desdeInputFechaHora(e.target.value) || null)
                }
              />
            </FormField>
          </div>

          <div className="glass-flat divide-y px-4">
            <NumberRow
              hint={t(
                "dobletes.campanas.prioridadHint",
                "Si a alguien le tocan dos, ve primero la de mayor prioridad.",
              )}
              label={t("dobletes.campanas.prioridad", "Prioridad")}
              max={10}
              min={0}
              value={c.priority}
              onChange={(n) => set("priority", n ?? 0)}
            />
            <NumberRow
              hint={t(
                "dobletes.campanas.volverHint",
                "Si la cierra, cuántos días después puede volver a verla.",
              )}
              label={t("dobletes.campanas.volver", "Volver a mostrar")}
              max={90}
              min={1}
              suffix={t("dobletes.campanas.dias", "días")}
              value={c.reshowAfterDismissDays}
              onChange={(n) => set("reshowAfterDismissDays", n ?? 7)}
            />
            <ToggleRow
              checked={c.pushOnPublish}
              hint={t(
                "dobletes.campanas.pushHint",
                "Un aviso al teléfono al publicar, con prioridad baja y respetando las horas de silencio.",
              )}
              label={t("dobletes.campanas.push", "Avisar al publicar")}
              onCheckedChange={(v) => set("pushOnPublish", v)}
            />
          </div>

          <InfoNote tone="neutral">
            {t(
              "dobletes.campanas.reglas",
              "Cada vigilante ve una campaña a la vez, sólo cuando está fuera de servicio. Nunca durante su turno.",
            )}
          </InfoNote>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <p className="cg-eyebrow mb-2 flex items-center gap-2">
            {t("dobletes.campanas.vistaPrevia", "Así lo verán")}
            {c.active ? (
              <StatusBadge tone="ok">
                {t("dobletes.campanas.estado.activa", "Activa")}
              </StatusBadge>
            ) : null}
          </p>
          <div className="flex justify-center">
            <PhonePreview
              accent={m.accentColor || DEFAULT_ACCENT}
              banner={(colores) => (
                <BannerDeCampana
                  bono={bonoTexto}
                  c={{ ...c, imagen: c.imagePreviewUrl || null }}
                  colores={colores}
                  empresa={empresa}
                />
              )}
              font={m.fontFamily || ""}
              light={m.defaultTheme === "light"}
              logoUrl={logo}
              modules={modulos}
              name={nombreApp}
              tagline={m.tagline || ""}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
