import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Sparkles,
  MessageSquare,
  CheckCircle2,
  UserRound,
  CalendarX2,
  Repeat2,
  Settings2,
  ChevronDown,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageContainer,
  PageHeader,
  Section,
  StatCard,
  StatusBadge,
  EmptyState,
  SkeletonCards,
  Segmented,
  InfoNote,
  ListRow,
  Avatar,
} from "@/components/kit";
import {
  SettingRow,
  ToggleRow,
  NumberRow,
  SaveBar,
} from "@/pages/admin/Configuration/components/SettingsForm";
import { useAgente } from "@/lib/agenteDeMarca";
import { fechaYHora, soloHora } from "@/lib/horaDeLaEmpresa";
import {
  vigiaProService,
  TIPOS_DE_CASO,
  type AjustesDelSeguimiento,
  type CasoDelSeguimiento,
  type FiltroDeCasos,
  type TipoDeCaso,
} from "@/lib/api/vigiaProService";

/**
 * VIGIA PRO — el seguimiento automático.
 *
 * Tres partes, de lo que más se mira a lo que menos:
 *   1. Lo que el asistente resolvió (cifras de 30 días).
 *   2. Los casos, con la conversación entera: qué se le escribió al
 *      vigilante, qué contestó y qué se hizo.
 *   3. Los ajustes: qué casos se siguen, cuánto se espera, y si busca relevo
 *      solo o lo deja a una persona.
 *
 * El nombre del asistente es el de la empresa (`useAgente`): en el CRM de un
 * socio nunca dice «VigIA».
 */
const TONO: Record<CasoDelSeguimiento["estado"], string> = {
  abierto: "warn",
  esperando: "info",
  resuelto: "ok",
  escalado: "bad",
  cerrado: "slate",
};

/** Minutos que tienen sentido para cada caso (los otros dos no llevan número). */
const MINUTOS: Partial<Record<TipoDeCaso, { min: number; max: number }>> = {
  sin_fichar: { min: 5, max: 120 },
  salida_anticipada: { min: 10, max: 240 },
  confirmar_turno: { min: 60, max: 2880 },
};

export default function VigiaProPage() {
  const { t } = useTranslation();
  const agente = useAgente();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const casoPedido = params.get("caso");
  const [filtro, setFiltro] = useState<FiltroDeCasos>(casoPedido ? "todos" : "abiertos");
  const [abierto, setAbierto] = useState<string | null>(casoPedido);
  const [borrador, setBorrador] = useState<AjustesDelSeguimiento | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const a = { agente: agente.nombre };

  const info = useQuery({
    queryKey: ["vigia-pro", "estado"],
    queryFn: () => vigiaProService.leer(),
    staleTime: 0,
  });
  const casos = useQuery({
    queryKey: ["vigia-pro", "casos", filtro],
    queryFn: () => vigiaProService.casos(filtro),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (info.data && !borrador) setBorrador(info.data.ajustes);
  }, [info.data, borrador]);

  const sinGuardar = useMemo(
    () => !!borrador && !!info.data && JSON.stringify(borrador) !== JSON.stringify(info.data.ajustes),
    [borrador, info.data],
  );

  const tipoDe = (tipo: string) => t(`vigiaPro.tipo.${tipo}`, { defaultValue: tipo });

  const guardar = async () => {
    if (!borrador) return;
    setGuardando(true);
    try {
      const r = await vigiaProService.guardar(borrador);

      setBorrador(r.ajustes);
      toast.success(t("vigiaPro.ajustes.guardado"));
      await qc.invalidateQueries({ queryKey: ["vigia-pro", "estado"] });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t("vigiaPro.ajustes.error"));
    } finally {
      setGuardando(false);
    }
  };

  const cerrar = async (id: string) => {
    setCerrando(id);
    try {
      await vigiaProService.cerrar(id);
      await qc.invalidateQueries({ queryKey: ["vigia-pro"] });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t("vigiaPro.casos.errorCerrar"));
    } finally {
      setCerrando(null);
    }
  };

  const conmutar = (id: string) => {
    const siguiente = abierto === id ? null : id;

    setAbierto(siguiente);
    if (casoPedido && siguiente !== casoPedido) {
      params.delete("caso");
      setParams(params, { replace: true });
    }
  };

  const cambiar = (parche: Partial<AjustesDelSeguimiento>) =>
    setBorrador((b) => (b ? { ...b, ...parche } : b));
  const cambiarCaso = (tipo: TipoDeCaso, parche: Partial<{ activo: boolean; minutos: number }>) =>
    setBorrador((b) => (b ? { ...b, casos: { ...b.casos, [tipo]: { ...b.casos[tipo], ...parche } } } : b));

  const r = info.data?.resumen;

  return (
    <AppLayout>
      <PageContainer width="narrow">
        <PageHeader
          icon={<Sparkles />}
          subtitle={t("vigiaPro.subtitulo", a)}
          title={t("vigiaPro.titulo", a)}
        />

        {info.isLoading || !borrador ? (
          <SkeletonCards count={3} />
        ) : info.isError || !info.data ? (
          <EmptyState
            description={t("vigiaPro.errorCarga")}
            icon={<Sparkles />}
            title={t("vigiaPro.titulo", a)}
          />
        ) : (
          <div className="space-y-4">
            {!info.data.tieneModulo && (
              <InfoNote
                title={t("vigiaPro.sinModulo.titulo", a)}
                tone="brand"
              >
                {t("vigiaPro.sinModulo.desc", a)}{" "}
                <Link className="underline" to="/modulos-adicionales">
                  {t("vigiaPro.sinModulo.enlace")}
                </Link>
              </InfoNote>
            )}

            {info.data.tieneModulo && !info.data.ajustes.activo && (
              <InfoNote tone="warn" title={t("vigiaPro.apagado.titulo")}>
                {t("vigiaPro.apagado.desc", a)}
              </InfoNote>
            )}

            {/* ── 1. Lo que resolvió ─────────────────────────────────── */}
            {r && (
              <Section icon={<CheckCircle2 />} title={t("vigiaPro.resumen.titulo", { ...a, dias: r.dias })}>
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    flat
                    icon={<MessageSquare />}
                    label={t("vigiaPro.resumen.casos")}
                    value={r.total}
                  />
                  <StatCard
                    flat
                    accent="ok"
                    hint={r.total ? t("vigiaPro.resumen.porcentaje", { pct: Math.round((r.resueltosSolos / r.total) * 100) }) : undefined}
                    icon={<CheckCircle2 />}
                    label={t("vigiaPro.resumen.resueltosSolos", a)}
                    value={r.resueltosSolos}
                  />
                  <StatCard
                    flat
                    accent="bad"
                    icon={<UserRound />}
                    label={t("vigiaPro.resumen.escalados")}
                    value={r.escalados}
                  />
                  <StatCard
                    flat
                    icon={<CalendarX2 />}
                    label={t("vigiaPro.resumen.faltas")}
                    value={r.faltas}
                  />
                  <StatCard
                    flat
                    icon={<Repeat2 />}
                    label={t("vigiaPro.resumen.relevos")}
                    value={r.relevos}
                  />
                  <StatCard
                    flat
                    icon={<CheckCircle2 />}
                    label={t("vigiaPro.resumen.llegaron")}
                    value={r.llegaron}
                  />
                </div>
              </Section>
            )}

            {/* ── 2. Los casos ───────────────────────────────────────── */}
            <Section
              action={
                <Segmented
                  options={[
                    { value: "abiertos", label: t("vigiaPro.casos.filtro.abiertos") },
                    { value: "escalado", label: t("vigiaPro.casos.filtro.escalado") },
                    { value: "todos", label: t("vigiaPro.casos.filtro.todos") },
                  ]}
                  value={filtro}
                  onChange={setFiltro}
                />
              }
              icon={<MessageSquare />}
              title={t("vigiaPro.casos.titulo")}
            >
              {casos.isLoading ? (
                <SkeletonCards count={2} />
              ) : !casos.data?.rows.length ? (
                <EmptyState
                  description={t(`vigiaPro.casos.vacio.${filtro}`, a)}
                  icon={<MessageSquare />}
                  title={t("vigiaPro.casos.vacio.titulo")}
                  variant="inline"
                />
              ) : (
                <ul className="space-y-2">
                  {casos.data.rows.map((c) => (
                    <li key={c.id}>
                      <ListRow
                        avatar={<Avatar name={c.vigilante || "?"} />}
                        badges={
                          <StatusBadge tone={TONO[c.estado]}>
                            {t(`vigiaPro.estado.${c.estado}`, a)}
                          </StatusBadge>
                        }
                        meta={
                          <ChevronDown
                            className="h-4 w-4 transition-transform"
                            style={{ transform: abierto === c.id ? "rotate(180deg)" : undefined }}
                          />
                        }
                        subtitle={[tipoDe(c.tipo), c.puesto, fechaYHora(c.createdAt)].filter(Boolean).join(" · ")}
                        title={c.vigilante || t("vigiaPro.casos.sinNombre")}
                        onClick={() => conmutar(c.id)}
                      />
                      {abierto === c.id && (
                        <Conversacion
                          agente={agente.nombre}
                          caso={c}
                          cerrando={cerrando === c.id}
                          onCerrar={() => cerrar(c.id)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* ── 3. Ajustes ─────────────────────────────────────────── */}
            <Section contentClassName="divide-y" icon={<Settings2 />} title={t("vigiaPro.ajustes.titulo")}>
              <ToggleRow
                checked={borrador.activo}
                disabled={!info.data.tieneModulo}
                hint={t("vigiaPro.ajustes.activoHint", a)}
                label={t("vigiaPro.ajustes.activo", a)}
                onCheckedChange={(v) => cambiar({ activo: v })}
              />
              {TIPOS_DE_CASO.map((tipo) => (
                <ToggleRow
                  key={tipo}
                  checked={borrador.casos[tipo].activo}
                  hint={t(`vigiaPro.ajustes.casoHint.${tipo}`, { ...a, minutos: borrador.casos[tipo].minutos })}
                  label={tipoDe(tipo)}
                  onCheckedChange={(v) => cambiarCaso(tipo, { activo: v })}
                >
                  {MINUTOS[tipo] && borrador.casos[tipo].activo && (
                    <div className="mt-3 max-w-xs">
                      <NumberRow
                        label={t(`vigiaPro.ajustes.minutos.${tipo}`)}
                        max={MINUTOS[tipo]!.max}
                        min={MINUTOS[tipo]!.min}
                        suffix={t("vigiaPro.ajustes.min")}
                        value={borrador.casos[tipo].minutos}
                        onChange={(n) => cambiarCaso(tipo, { minutos: n ?? MINUTOS[tipo]!.min })}
                      />
                    </div>
                  )}
                </ToggleRow>
              ))}
              <NumberRow
                hint={t("vigiaPro.ajustes.esperaHint")}
                label={t("vigiaPro.ajustes.espera")}
                max={60}
                min={3}
                suffix={t("vigiaPro.ajustes.min")}
                value={borrador.esperaRespuestaMin}
                onChange={(n) => cambiar({ esperaRespuestaMin: n ?? 10 })}
              />
              <NumberRow
                hint={t("vigiaPro.ajustes.reintentosHint")}
                label={t("vigiaPro.ajustes.reintentos")}
                max={3}
                min={0}
                value={borrador.reintentos}
                onChange={(n) => cambiar({ reintentos: n ?? 1 })}
              />
              <NumberRow
                hint={t("vigiaPro.ajustes.llegadaHint")}
                label={t("vigiaPro.ajustes.llegada")}
                max={180}
                min={10}
                suffix={t("vigiaPro.ajustes.min")}
                value={borrador.esperaLlegadaMaxMin}
                onChange={(n) => cambiar({ esperaLlegadaMaxMin: n ?? 60 })}
              />
              <SettingRow
                control={
                  <Select
                    value={borrador.cobertura}
                    onValueChange={(v) => cambiar({ cobertura: v as AjustesDelSeguimiento["cobertura"] })}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["autonoma", "aprobacion", "no"] as const).map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`vigiaPro.ajustes.coberturaOpcion.${m}`, a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
                hint={t(`vigiaPro.ajustes.coberturaHint.${borrador.cobertura}`, a)}
                label={t("vigiaPro.ajustes.cobertura", a)}
              />
              <SettingRow
                control={
                  <Select
                    value={borrador.responsableUserId || "auto"}
                    onValueChange={(v) => cambiar({ responsableUserId: v === "auto" ? null : v })}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t("vigiaPro.ajustes.responsableAuto")}</SelectItem>
                      {info.data.responsables.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
                hint={t("vigiaPro.ajustes.responsableHint", {
                  ...a,
                  nombre: info.data.responsableEfectivo?.nombre || "—",
                })}
                label={t("vigiaPro.ajustes.responsable", a)}
              />
              <ToggleRow
                checked={borrador.canales.whatsapp}
                hint={info.data.plantillaWhatsApp ? t("vigiaPro.ajustes.whatsappHint") : t("vigiaPro.ajustes.whatsappHintSinPlantilla")}
                label={t("vigiaPro.ajustes.whatsapp")}
                onCheckedChange={(v) => cambiar({ canales: { ...borrador.canales, whatsapp: v } })}
              />
              <ToggleRow
                checked={borrador.canales.push}
                hint={t("vigiaPro.ajustes.pushHint")}
                label={t("vigiaPro.ajustes.push")}
                onCheckedChange={(v) => cambiar({ canales: { ...borrador.canales, push: v } })}
              />
              <ToggleRow
                checked={borrador.canales.sms}
                hint={t("vigiaPro.ajustes.smsHint")}
                label={t("vigiaPro.ajustes.sms")}
                onCheckedChange={(v) => cambiar({ canales: { ...borrador.canales, sms: v } })}
              />
            </Section>
            <SaveBar
              disabled={!sinGuardar}
              label={t("vigiaPro.ajustes.guardar")}
              saving={guardando}
              onSave={guardar}
            />
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}

/** La conversación de un caso, en el orden en que pasó. */
function Conversacion({
  caso,
  agente,
  cerrando,
  onCerrar,
}: {
  caso: CasoDelSeguimiento;
  agente: string;
  cerrando: boolean;
  onCerrar: () => void;
}) {
  const { t } = useTranslation();
  const a = { agente };
  const vivo = !["resuelto", "cerrado"].includes(caso.estado);

  return (
    <div className="glass-flat mt-1 space-y-2 rounded-xl p-3 text-sm">
      {caso.timeline.map((l, i) => {
        const hora = soloHora(l.at);
        const deAgente = ["contactado", "reintento", "respuesta_vigia"].includes(l.evento) && l.texto;
        const delVigilante = l.evento === "respuesta" && l.texto;

        if (deAgente || delVigilante) {
          return (
            <div key={i} className={`flex ${delVigilante ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] rounded-2xl px-3 py-2"
                style={{
                  background: delVigilante ? "var(--glass-raised)" : "color-mix(in oklch, var(--brand) 14%, transparent)",
                }}
              >
                <p className="text-[11px] font-medium" style={{ color: "var(--ink-faint)" }}>
                  {delVigilante ? caso.vigilante : agente}
                  {l.canal && !delVigilante ? ` · ${t(`vigiaPro.canal.${l.canal}`, { defaultValue: l.canal })}` : ""} · {hora}
                </p>
                <p className="whitespace-pre-wrap">{l.texto}</p>
              </div>
            </div>
          );
        }

        const texto = textoDeEvento(t, l, a);

        if (!texto) return null;

        return (
          <p key={i} className="text-center text-xs" style={{ color: "var(--ink-faint)" }}>
            {hora} · {texto}
          </p>
        );
      })}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {caso.coverageEventId && (
          <Button asChild size="sm" variant="outline">
            <Link to="/coverage">{t("vigiaPro.casos.verNovedad")}</Link>
          </Button>
        )}
        {vivo && (
          <Button disabled={cerrando} size="sm" type="button" variant="outline" onClick={onCerrar}>
            {t("vigiaPro.casos.cerrar")}
          </Button>
        )}
      </div>
    </div>
  );
}

function textoDeEvento(t: (k: string, o?: any) => string, l: CasoDelSeguimiento["timeline"][number], a: { agente: string }): string | null {
  switch (l.evento) {
    case "detectado":
      return t("vigiaPro.evento.detectado", a);
    case "esperando":
      return t("vigiaPro.evento.esperando", { ...a, minutos: l.minutos ?? "" });
    case "aclarar":
      return t("vigiaPro.evento.aclarar", a);
    case "recordatorio":
      return t("vigiaPro.evento.recordatorio", a);
    case "falta_registrada":
      return t("vigiaPro.evento.falta", { motivo: t(`vigiaPro.motivoFalta.${l.motivo}`, { defaultValue: l.motivo || "" }) });
    case "relevo":
      return l.texto ? t("vigiaPro.evento.relevo", { texto: l.texto }) : null;
    case "escalado":
      return t("vigiaPro.evento.escalado", { motivo: t(`vigiaPro.motivo.${l.motivo}`, { defaultValue: l.motivo || "" }) });
    case "resuelto":
      return t("vigiaPro.evento.resuelto", { resolucion: t(`vigiaPro.resolucion.${l.resolucion}`, { defaultValue: l.resolucion || "" }) });
    case "cerrado":
      return t("vigiaPro.evento.cerrado");
    case "cerrado_por_persona":
      return t("vigiaPro.evento.cerradoPorPersona", { nombre: l.texto || "" });
    case "error":
      return t("vigiaPro.evento.error");
    default:
      return null;
  }
}
