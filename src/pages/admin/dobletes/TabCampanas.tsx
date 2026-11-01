/**
 * CAMPAÑAS — what the company tells its own guards, inside their app, to keep
 * the backup bench full. List with status and results (views, taps, sign-ups,
 * shifts covered by people who joined through it), and the editor.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Eye,
  Hand,
  Megaphone,
  Pause,
  Pencil,
  Percent,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";

import EditorDeCampana from "./EditorDeCampana";
import { estadoDeCampana, rellenar, type EstadoDeCampana } from "./logica";
import { dinero, usePuedeGestionarDobletes } from "./comun";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  EmptyState,
  GlassPanel,
  SkeletonCards,
  StatusBadge,
} from "@/components/kit";
import dobletesService, {
  type Campaign,
  type CampaignDraft,
  type CampaignStats,
} from "@/lib/api/dobletesService";
import { soloFecha } from "@/lib/horaDeLaEmpresa";
import { getStoredTenantBranding } from "@/lib/tenantBranding";
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";

type Estado = EstadoDeCampana;

const TONO: Record<Estado, string> = {
  borrador: "neutral",
  programada: "info",
  activa: "ok",
  terminada: "neutral",
};

export default function TabCampanas({
  sugerida,
  onSugeridaUsada,
}: {
  /** A campaign prepared elsewhere (salud de la banca) to open right away. */
  sugerida: CampaignDraft | null;
  onSugeridaUsada: () => void;
}) {
  const { t } = useTranslation();
  const puede = usePuedeGestionarDobletes();
  const [editando, setEditando] = useState<CampaignDraft | null>(null);
  const [abierto, setAbierto] = useState(false);

  const campanas = useQuery({
    queryKey: ["dobletes", "campaigns"],
    queryFn: () => dobletesService.campaigns(),
  });
  const banca = useQuery({
    queryKey: ["dobletes", "bench"],
    queryFn: () => dobletesService.bench(),
    staleTime: 60_000,
  });
  const ajustes = useQuery({
    queryKey: ["dobletes", "settings"],
    queryFn: () => dobletesService.settings(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (sugerida) {
      setEditando(sugerida);
      setAbierto(true);
      onSugeridaUsada();
    }
  }, [sugerida, onSugeridaUsada]);

  const abrir = (c: CampaignDraft | null) => {
    setEditando(c);
    setAbierto(true);
  };

  const filas = campanas.data ?? [];
  const empresa = getStoredTenantBranding().name || "…";
  const bono = ajustes.data?.settings.defaultBonusCents
    ? dinero(
        ajustes.data.settings.defaultBonusCents,
        ajustes.data.currency,
        ajustes.data.decimals ?? 2,
      )
    : "…";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "dobletes.campanas.intro",
            "Mensajes de tu empresa dentro de la app de tus vigilantes para que se unan a la reserva y la mantengan al día. Se ven sólo fuera de servicio.",
          )}
        </p>
        {puede && (
          <Button variant="brand" onClick={() => abrir(null)}>
            <Plus className="mr-1.5 size-4" />
            {t("dobletes.campanas.nueva", "Nueva campaña")}
          </Button>
        )}
      </div>

      {campanas.isLoading ? (
        <SkeletonCards count={3} />
      ) : campanas.isError && !filas.length ? (
        <ErrorDeCarga onRetry={() => campanas.refetch()} />
      ) : !filas.length ? (
        <EmptyState
          action={
            puede ? (
              <Button variant="brand" onClick={() => abrir(null)}>
                <Plus className="mr-1.5 size-4" />
                {t("dobletes.campanas.nueva", "Nueva campaña")}
              </Button>
            ) : undefined
          }
          description={t(
            "dobletes.campanas.vacioDesc",
            "Empieza con «Únete a la reserva»: es la plantilla que más suplentes trae.",
          )}
          icon={<Megaphone />}
          title={t("dobletes.campanas.vacio", "Todavía no hay campañas")}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filas.map((c) => (
            <TarjetaDeCampana
              key={c.id}
              bono={bono}
              c={c}
              empresa={empresa}
              puede={puede}
              onEditar={() => abrir(c)}
            />
          ))}
        </div>
      )}

      <EditorDeCampana
        bonoCents={ajustes.data?.settings.defaultBonusCents ?? null}
        decimales={ajustes.data?.decimals ?? 2}
        inicial={editando}
        moneda={ajustes.data?.currency || "USD"}
        open={abierto}
        puestos={banca.data?.stations ?? []}
        onOpenChange={setAbierto}
      />
    </div>
  );
}

function TarjetaDeCampana({
  c,
  puede,
  empresa,
  bono,
  onEditar,
}: {
  c: Campaign;
  puede: boolean;
  empresa: string;
  bono: string;
  onEditar: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const estado = estadoDeCampana(c);
  const etiquetas: Record<Estado, string> = {
    borrador: t("dobletes.campanas.estado.borrador", "Borrador"),
    programada: t("dobletes.campanas.estado.programada", "Programada"),
    activa: t("dobletes.campanas.estado.activa", "Activa"),
    terminada: t("dobletes.campanas.estado.terminada", "Terminada"),
  };
  const stats = useQuery({
    queryKey: ["dobletes", "campaigns", c.id, "stats"],
    queryFn: () => dobletesService.campaignStats(c.id),
    enabled: !c.stats && estado !== "borrador",
    initialData: c.stats,
  });
  const s: CampaignStats = stats.data ?? {
    shown: 0,
    seen: 0,
    cta: 0,
    converted: 0,
    coveredShifts: null,
  };

  const alternar = async () => {
    setOcupado(true);
    try {
      await dobletesService.saveCampaign({ ...c, active: !c.active });
      toast.success(
        c.active
          ? t("dobletes.campanas.pausada", "Campaña en pausa")
          : t("dobletes.campanas.publicada", "Campaña publicada"),
      );
      void qc.invalidateQueries({ queryKey: ["dobletes", "campaigns"] });
    } catch {
      /* shown by the API layer */
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    const ok = await confirmDialog({
      title: t("dobletes.campanas.borrarTitulo", "¿Eliminar la campaña?"),
      message: t(
        "dobletes.campanas.borrarMensaje",
        "Deja de verse en la app. Sus resultados se pierden.",
      ),
      confirmText: t("dobletes.campanas.borrar", "Eliminar"),
      tone: "danger",
    });

    if (!ok) return;
    setOcupado(true);
    try {
      await dobletesService.deleteCampaign(c.id);
      toast.success(t("dobletes.campanas.borrada", "Campaña eliminada"));
      void qc.invalidateQueries({ queryKey: ["dobletes", "campaigns"] });
    } catch {
      /* shown by the API layer */
    } finally {
      setOcupado(false);
    }
  };

  const cifras = [
    {
      icono: <Eye />,
      valor: s.shown,
      etiqueta: t("dobletes.campanas.vistas", "Vistas"),
    },
    {
      icono: <Hand />,
      valor: s.cta,
      etiqueta: t("dobletes.campanas.toques", "Toques"),
    },
    {
      icono: <UserPlus />,
      valor: s.converted,
      etiqueta: t("dobletes.campanas.altas", "Altas"),
    },
    // «Turnos cubiertos» when the server counts them; otherwise how many of
    // those who saw it joined.
    s.coveredShifts != null
      ? {
          icono: <ShieldCheck />,
          valor: s.coveredShifts.accepted,
          etiqueta: t("dobletes.campanas.turnosCubiertos", "Turnos cubiertos"),
        }
      : {
          icono: <Percent />,
          valor:
            s.conversionPct != null
              ? `${Math.round(s.conversionPct)} %`
              : s.shown
                ? `${Math.round((s.converted / s.shown) * 100)} %`
                : "—",
          etiqueta: t("dobletes.campanas.conversion", "Conversión"),
        },
  ];

  return (
    <GlassPanel flat className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        {c.imagePreviewUrl ? (
          <img
            alt=""
            className="h-14 w-20 shrink-0 rounded-lg object-cover"
            src={c.imagePreviewUrl}
          />
        ) : (
          <span
            aria-hidden
            className="grid h-14 w-20 shrink-0 place-items-center rounded-lg"
            style={{
              background: "var(--brand-wash)",
              color: "var(--brand-text)",
            }}
          >
            <Megaphone className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {rellenar(c.title, empresa, bono)}
          </p>
          <p
            className="line-clamp-2 text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            {rellenar(c.body, empresa, bono)}
          </p>
        </div>
        <StatusBadge tone={TONO[estado]}>{etiquetas[estado]}</StatusBadge>
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
        {c.startsAt || c.endsAt
          ? t("dobletes.campanas.periodo", {
              defaultValue: "{{desde}} → {{hasta}}",
              desde: c.startsAt ? soloFecha(c.startsAt) : "…",
              hasta: c.endsAt ? soloFecha(c.endsAt) : "…",
            })
          : t("dobletes.campanas.sinFechas", "Sin fecha de fin")}
        {c.pushOnPublish
          ? ` · ${t("dobletes.campanas.conAviso", "con aviso")}`
          : ""}
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {cifras.map((x) => (
          <div key={x.etiqueta} className="glass-sunken px-2 py-2 text-center">
            <p className="flex items-center justify-center gap-1 text-base font-bold tabular-nums [&_svg]:size-3.5">
              <span style={{ color: "var(--ink-faint)" }}>{x.icono}</span>
              {estado === "borrador" ? "—" : x.valor}
            </p>
            <p
              className="truncate text-[11px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {x.etiqueta}
            </p>
          </div>
        ))}
      </div>
      {s.coveredShifts && estado !== "borrador" && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-faint)" }}>
          {t("dobletes.campanas.cubiertosExplica", {
            defaultValue:
              "Turnos cubiertos gracias a la campaña: los que aceptaron quienes se unieron por ella, en los {{dias}} días siguientes a su alta. Ya fichados: {{cumplidos}}.",
            dias: s.coveredShifts.windowDays,
            cumplidos: s.coveredShifts.confirmed,
          })}
        </p>
      )}

      {puede && (
        <div className="cg-acciones mt-3 flex flex-wrap justify-end gap-2">
          <Button disabled={ocupado} size="sm" variant="ghost" onClick={borrar}>
            <Trash2 className="size-3.5" />
          </Button>
          <Button
            disabled={ocupado}
            size="sm"
            variant="outline"
            onClick={onEditar}
          >
            <Pencil className="mr-1 size-3.5" />
            {t("dobletes.campanas.editarCorto", "Editar")}
          </Button>
          <Button
            disabled={ocupado}
            size="sm"
            variant={c.active ? "outline" : "brand"}
            onClick={alternar}
          >
            {c.active ? (
              <Pause className="mr-1 size-3.5" />
            ) : (
              <Play className="mr-1 size-3.5" />
            )}
            {c.active
              ? t("dobletes.campanas.pausar", "Pausar")
              : t("dobletes.campanas.publicar", "Publicar")}
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}
