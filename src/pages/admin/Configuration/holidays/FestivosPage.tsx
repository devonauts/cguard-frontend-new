/**
 * Configuración › Operación › Festivos
 *
 * NO EXISTÍA NADA. Sin calendario de festivos no hay recargo dominical ni de
 * feriado en ningún país, el generador programa el 1 de enero como un martes
 * cualquiera, la hoja de horas no distingue un turno de Navidad de uno normal, y
 * las metas de cobertura no descuentan el día.
 *
 * «Se repite cada año» es la casilla que más ahorra: sin ella habría que teclear
 * Navidad cada enero — el trabajo manual que hundió al motor de nómina anterior,
 * con sus tablas de constantes por año editadas a mano en el repositorio.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2, Loader2, Info } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import {
  PageContainer, PageHeader, Section, SkeletonCards, EmptyState, InfoNote, StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

type Festivo = {
  id: string;
  date: string;
  name: string;
  kind: "national" | "company";
  recurring: boolean;
  payMultiplier: number | null;
};

const tenantId = () => localStorage.getItem("tenantId") || "";

/** 'YYYY-MM-DD' → «25 de diciembre de 2026», sin pasar por Date: la cadena YA es
 *  el día del calendario y convertirla arrastraría zona horaria. */
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function legible(ymd: string, recurrente: boolean) {
  const [a, m, d] = ymd.split("-");
  const base = `${Number(d)} de ${MESES[Number(m) - 1] || ""}`;
  return recurrente ? `${base}, cada año` : `${base} de ${a}`;
}

export default function FestivosPage() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settingsEdit");

  const [lista, setLista] = useState<Festivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState({ date: "", name: "", kind: "national", recurring: true, payMultiplier: "" });

  const cargar = async () => {
    try {
      const { data } = await api.get(`/tenant/${tenantId()}/holiday`);
      setLista(data?.rows || []);
    } catch {
      toast.error(t('settings.festivos.loadError', { defaultValue: 'No se pudieron cargar los festivos.' }));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const agregar = async () => {
    if (!nuevo.date || !nuevo.name.trim()) {
      toast.error(t('settings.festivos.missingFieldsError', { defaultValue: 'Pon la fecha y el nombre del festivo.' }));
      return;
    }
    setGuardando(true);
    try {
      await api.post(`/tenant/${tenantId()}/holiday`, {
        data: {
          ...nuevo,
          payMultiplier: nuevo.payMultiplier === "" ? null : Number(nuevo.payMultiplier),
        },
      });
      setNuevo({ date: "", name: "", kind: "national", recurring: true, payMultiplier: "" });
      await cargar();
      toast.success(t('settings.festivos.addSuccess', { defaultValue: 'Festivo agregado.' }));
    } catch (e: any) {
      // El índice único por (tenant, fecha) es lo que impide contar el recargo
      // dos veces; el mensaje del servidor no lo explicaría.
      const msg = e?.response?.status === 500 || e?.response?.status === 409
        ? t('settings.festivos.duplicateError', { defaultValue: 'Ya hay un festivo en esa fecha.' })
        : e?.response?.data?.message || t('settings.festivos.addError', { defaultValue: 'No se pudo agregar.' });
      toast.error(msg);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string) => {
    try {
      await api.delete(`/tenant/${tenantId()}/holiday/${id}`);
      setLista((l) => l.filter((x) => x.id !== id));
    } catch {
      toast.error(t('settings.festivos.deleteError', { defaultValue: 'No se pudo borrar.' }));
    }
  };

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t('settings.festivos.pageTitle', { defaultValue: 'Festivos' })}>
        <PageContainer width="narrow">
          <PageHeader
            icon={<CalendarDays />}
            title={t('settings.festivos.pageTitle', { defaultValue: 'Festivos' })}
            subtitle={t('settings.festivos.pageSubtitle', { defaultValue: 'Los días que tu empresa trata distinto: feriados de ley y días propios.' })}
          />

          <InfoNote tone="info" icon={<Info />} className="mb-5">
            {t('settings.festivos.infoNote', { defaultValue: 'El calendario decide qué turnos caen en feriado. Sin él, el 1 de enero se programa y se cuenta como un martes cualquiera.' })}
          </InfoNote>

          {canEdit && (
            <Section title={t('settings.festivos.addSectionTitle', { defaultValue: 'Agregar un festivo' })} icon={<Plus />} className="mb-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="cg-eyebrow">{t('settings.festivos.dateLabel', { defaultValue: 'Fecha' })}</span>
                  <input
                    type="date"
                    value={nuevo.date}
                    onChange={(e) => setNuevo((n) => ({ ...n, date: e.target.value }))}
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="cg-eyebrow">{t('settings.festivos.nameLabel', { defaultValue: 'Nombre' })}</span>
                  <input
                    type="text"
                    maxLength={120}
                    placeholder={t('settings.festivos.namePlaceholder', { defaultValue: 'Navidad, Día del Trabajo…' })}
                    value={nuevo.name}
                    onChange={(e) => setNuevo((n) => ({ ...n, name: e.target.value }))}
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="cg-eyebrow">{t('settings.festivos.typeLabel', { defaultValue: 'Tipo' })}</span>
                  <select
                    value={nuevo.kind}
                    onChange={(e) => setNuevo((n) => ({ ...n, kind: e.target.value }))}
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  >
                    <option value="national">{t('settings.festivos.typeNationalOption', { defaultValue: 'Feriado de ley' })}</option>
                    <option value="company">{t('settings.festivos.typeCompanyOption', { defaultValue: 'Día propio de la empresa' })}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="cg-eyebrow">{t('settings.festivos.payMultiplierLabel', { defaultValue: 'Recargo (opcional)' })}</span>
                  <input
                    type="number" step="0.25" min={1} max={5}
                    placeholder={t('settings.festivos.payMultiplierPlaceholder', { defaultValue: '1.5 = tiempo y medio' })}
                    value={nuevo.payMultiplier}
                    onChange={(e) => setNuevo((n) => ({ ...n, payMultiplier: e.target.value }))}
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={nuevo.recurring}
                  onChange={(e) => setNuevo((n) => ({ ...n, recurring: e.target.checked }))}
                />
                {t('settings.festivos.recurringLabel', { defaultValue: 'Se repite cada año' })}
                <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t('settings.festivos.recurringHint', { defaultValue: '— para Navidad o Año Nuevo, así no hay que volver a teclearlos' })}
                </span>
              </label>

              <div className="mt-4 flex justify-end">
                <Button variant="brand" onClick={agregar} disabled={guardando}>
                  {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {t('settings.festivos.addBtn', { defaultValue: 'Agregar' })}
                </Button>
              </div>
            </Section>
          )}

          <Section title={t('settings.festivos.calendarSectionTitle', { defaultValue: 'Calendario ({{count}})', count: lista.length })} icon={<CalendarDays />}>
            {loading ? (
              <SkeletonCards count={3} />
            ) : lista.length === 0 ? (
              <EmptyState
                icon={<CalendarDays />}
                title={t('settings.festivos.emptyTitle', { defaultValue: 'Todavía no hay festivos' })}
                description={t('settings.festivos.emptyDescription', { defaultValue: 'Agrega los feriados de tu país y los días propios de tu empresa.' })}
              />
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {lista.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{f.name}</span>
                        <StatusBadge tone={f.kind === "national" ? "info" : "neutral"} dot={false} className="px-2 py-0.5 text-[10px]">
                          {f.kind === "national" ? t('settings.festivos.kindNationalBadge', { defaultValue: 'De ley' }) : t('settings.festivos.kindCompanyBadge', { defaultValue: 'De la empresa' })}
                        </StatusBadge>
                        {f.payMultiplier ? (
                          <StatusBadge tone="warn" dot={false} className="px-2 py-0.5 text-[10px]">
                            ×{f.payMultiplier}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--ink-soft)" }}>
                        {legible(f.date, f.recurring)}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => borrar(f.id)}
                        aria-label={t('settings.festivos.deleteAriaLabel', { defaultValue: 'Borrar {{name}}', name: f.name })}
                        className="cg-focus rounded-lg p-2 transition-colors"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
