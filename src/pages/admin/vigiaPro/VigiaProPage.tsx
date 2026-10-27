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
  MessageCircle,
  RefreshCw,
  Smartphone,
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
import ComoFuncionaVigiaPro from "@/components/vigia/ComoFuncionaVigiaPro";
import GuiaConectarWhatsApp from "@/components/vigia/GuiaConectarWhatsApp";
import { useTiendaDeModulos } from "@/hooks/useTiendaDeModulos";
import ConDobletes from "@/pages/admin/dobletes/ConVigiaPro";
import { fechaYHora, soloHora } from "@/lib/horaDeLaEmpresa";
import {
  vigiaProService,
  TIPOS_DE_CASO,
  type AjustesDelSeguimiento,
  type CanalesDeLaEmpresa,
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
  const [vigilantes, setVigilantes] = useState<boolean | null>(null);
  const [tope, setTope] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const a = { agente: agente.nombre };
  const tienda = useTiendaDeModulos();
  const moduloEnTienda = tienda.data?.modules.find((m) => m.key === "vigia_pro");

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
  const canales = useQuery({
    queryKey: ["vigia-pro", "canales"],
    queryFn: () => vigiaProService.canales(),
    // La plantilla la aprueba Meta cuando quiere: se vuelve a mirar sola.
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (info.data && !borrador) setBorrador(info.data.ajustes);
    if (info.data && vigilantes === null) setVigilantes(!!info.data.vigilantes?.activo);
    if (info.data && tope === null) setTope(info.data.topeMensajesDia);
  }, [info.data, borrador, vigilantes, tope]);

  const sinGuardar = useMemo(
    () =>
      !!borrador &&
      !!info.data &&
      (JSON.stringify(borrador) !== JSON.stringify(info.data.ajustes) ||
        !!vigilantes !== !!info.data.vigilantes?.activo ||
        (tope !== null && tope !== info.data.topeMensajesDia)),
    [borrador, info.data, vigilantes, tope],
  );

  const tipoDe = (tipo: string) => t(`vigiaPro.tipo.${tipo}`, { defaultValue: tipo });

  const guardar = async () => {
    if (!borrador) return;
    setGuardando(true);
    try {
      const r = await vigiaProService.guardar(borrador, { activo: !!vigilantes }, tope ?? undefined);

      setBorrador(r.ajustes);
      setVigilantes(!!r.vigilantes?.activo);
      setTope(r.topeMensajesDia);
      toast.success(t("vigiaPro.ajustes.guardado"));
      await qc.invalidateQueries({ queryKey: ["vigia-pro"] });
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

  const comprobar = async () => {
    setComprobando(true);
    try {
      const r = await vigiaProService.comprobarCanales();

      qc.setQueryData(["vigia-pro", "canales"], r);
      toast.success(t("vigiaPro.canales.comprobado"));
      await qc.invalidateQueries({ queryKey: ["vigia-pro", "estado"] });
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t("vigiaPro.canales.errorComprobar"));
    } finally {
      setComprobando(false);
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

        {/* The error goes FIRST: a failed read never fills `borrador`, so the
            skeleton branch used to spin forever (QA-87). */}
        {info.isError ? (
          <EmptyState
            action={
              <Button variant="outline" onClick={() => info.refetch()}>
                {t("ui.shared.reintentar", "Reintentar")}
              </Button>
            }
            description={t("vigiaPro.errorCarga")}
            icon={<Sparkles />}
            title={t("vigiaPro.titulo", a)}
          />
        ) : info.isLoading || !borrador || !info.data ? (
          <SkeletonCards count={3} />
        ) : (
          <div className="space-y-4">
            {/* Sin el módulo: se ENSEÑA cómo trabaja, y el botón lleva a probarlo. */}
            {!info.data.tieneModulo && (
              <Section icon={<Sparkles />} title={t("vigiaPro.sinModulo.titulo", a)}>
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t("vigiaPro.sinModulo.desc", a)}
                </p>
                <ComoFuncionaVigiaPro className="mt-4" />
                <div className="cg-acciones mt-4 justify-end">
                  <Button asChild variant="brand">
                    <Link to="/modulos-adicionales">
                      {moduloEnTienda?.canStartTrial
                        ? t("vigiaPro.sinModulo.probar", { n: moduloEnTienda.trialDays || 30 })
                        : t("vigiaPro.sinModulo.enlace")}
                    </Link>
                  </Button>
                </div>
              </Section>
            )}

            {info.data.tieneModulo && !info.data.ajustes.activo && (
              <InfoNote tone="warn" title={t("vigiaPro.apagado.titulo")}>
                {t("vigiaPro.apagado.desc", a)}
              </InfoNote>
            )}

            {/* ── 0. Por dónde escribe: el WhatsApp de la empresa ────── */}
            {canales.data && (
              <Canales
                agente={agente.nombre}
                canales={canales.data}
                comprobando={comprobando}
                onComprobar={comprobar}
              />
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
              <ToggleRow
                checked={!!vigilantes}
                disabled={!info.data.tieneModulo}
                hint={t("vigiaPro.ajustes.vigilantesHint", a)}
                label={t("vigiaPro.ajustes.vigilantes", a)}
                onCheckedChange={(v) => setVigilantes(v)}
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
              <NumberRow
                hint={t("vigiaPro.ajustes.topeHint", {
                  ...a,
                  enviados: canales.data?.hoy.enviados ?? 0,
                })}
                label={t("vigiaPro.ajustes.tope")}
                max={5000}
                min={20}
                value={tope}
                onChange={(n) => setTope(n ?? 200)}
              />
              <ToggleRow
                checked={borrador.canales.whatsapp}
                hint={
                  !canales.data?.whatsapp.conectado
                    ? t("vigiaPro.ajustes.whatsappHintSinCuenta", a)
                    : info.data.plantillaWhatsApp
                      ? t("vigiaPro.ajustes.whatsappHint")
                      : t("vigiaPro.ajustes.whatsappHintSinPlantilla")
                }
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
              <ToggleRow
                checked={!!borrador.canales.llamada}
                hint={t("vigiaPro.ajustes.llamadaHint", a)}
                label={t("vigiaPro.ajustes.llamada")}
                onCheckedChange={(v) => cambiar({ canales: { ...borrador.canales, llamada: v } })}
              />
            </Section>
            <SaveBar
              disabled={!sinGuardar}
              label={t("vigiaPro.ajustes.guardar")}
              saving={guardando}
              onSave={guardar}
            />
            {info.data.tieneModulo && <ConDobletes />}
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}

/** Tono de la etiqueta por estado de la plantilla en Meta. */
const TONO_PLANTILLA: Record<string, string> = {
  APPROVED: "ok",
  PENDING: "info",
  IN_APPEAL: "info",
  REJECTED: "bad",
  PAUSED: "warn",
  DISABLED: "bad",
  NO_CREADA: "slate",
};

/**
 * «Conecta tu WhatsApp»: tres estados, de peor a mejor.
 *   1. Sin conectar → qué gana y el botón a Configuración › Comunicaciones.
 *   2. Conectado, plantilla en revisión (o rechazada) → estado por idioma y
 *      «Volver a comprobar».
 *   3. Listo → por dónde escribe, y nada más.
 * Mientras no esté listo, dice claro por dónde escribe el asistente hoy.
 */
function Canales({
  canales,
  agente,
  comprobando,
  onComprobar,
}: {
  canales: CanalesDeLaEmpresa;
  agente: string;
  comprobando: boolean;
  onComprobar: () => void;
}) {
  const { t } = useTranslation();
  const a = { agente };
  const wa = canales.whatsapp;
  const porDonde = canales.escribePor
    .filter((c) => c !== "whatsapp" || wa.listo)
    .map((c) => t(`vigiaPro.canal.${c}`))
    .join(", ");
  const escribePor = porDonde
    ? t("vigiaPro.canales.escribePor", { ...a, canales: porDonde })
    : t("vigiaPro.canales.sinCanales", a);
  const hoy = t("vigiaPro.canales.hoy", { enviados: canales.hoy.enviados, tope: canales.hoy.tope });

  if (!wa.conectado) {
    return (
      <Section icon={<MessageCircle />} title={t("vigiaPro.canales.titulo")}>
        <div className="space-y-3">
          <InfoNote icon={<Smartphone />} title={t("vigiaPro.canales.noConectado.titulo")} tone="brand">
            {t("vigiaPro.canales.noConectado.desc", a)}
          </InfoNote>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {escribePor} · {hoy}
          </p>
          <GuiaConectarWhatsApp conBoton />
        </div>
      </Section>
    );
  }

  const idiomas = wa.plantillas.idiomas.map((p) => (
    <li key={p.idioma} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-24">{t(`vigiaPro.canales.idioma.${p.idioma}`)}</span>
      <StatusBadge tone={TONO_PLANTILLA[p.estado] ?? "slate"}>
        {t(`vigiaPro.canales.estado.${p.estado}`, { defaultValue: p.estado })}
      </StatusBadge>
      {p.estado === "REJECTED" && p.motivo && (
        <span style={{ color: "var(--bad-text)" }}>{t("vigiaPro.canales.rechazada", { motivo: p.motivo })}</span>
      )}
    </li>
  ));

  const comprobarBoton = (
    <Button disabled={comprobando} size="sm" type="button" variant="outline" onClick={onComprobar}>
      <RefreshCw className={comprobando ? "animate-spin" : undefined} />
      {comprobando ? t("vigiaPro.canales.comprobando") : t("vigiaPro.canales.comprobar")}
    </Button>
  );

  if (!wa.listo) {
    return (
      <Section action={comprobarBoton} icon={<MessageCircle />} title={t("vigiaPro.canales.titulo")}>
        <div className="space-y-3">
          <InfoNote title={t("vigiaPro.canales.pendiente.titulo", { telefono: wa.telefono || "" })} tone="warn">
            {t("vigiaPro.canales.pendiente.desc", a)}
          </InfoNote>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
            {t("vigiaPro.canales.plantilla", { nombre: wa.plantillas.nombre })}
          </p>
          <ul className="space-y-1.5">{idiomas}</ul>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {escribePor} · {hoy}
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section action={comprobarBoton} icon={<MessageCircle />} title={t("vigiaPro.canales.titulo")}>
      <div className="space-y-3">
        <InfoNote icon={<CheckCircle2 />} title={t("vigiaPro.canales.listo.titulo", a)} tone="ok">
          {t("vigiaPro.canales.listo.desc", { ...a, telefono: wa.telefono || "" })}
        </InfoNote>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">{idiomas}</ul>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {escribePor} · {hoy}
        </p>
      </div>
    </Section>
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
    case "llamada":
      return t("vigiaPro.evento.llamada", a);
    case "tecla":
      return t("vigiaPro.evento.tecla", { tecla: l.texto || "" });
    case "llamada_fin":
      return t("vigiaPro.evento.llamadaFin");
    case "llamada_fallida":
      return t("vigiaPro.evento.llamadaFallida");
    case "error":
      return t("vigiaPro.evento.error");
    case "tope_diario":
      return t("vigiaPro.evento.topeDiario", a);
    case "tope_por_caso":
      return t("vigiaPro.evento.topePorCaso", a);
    default:
      return null;
  }
}
