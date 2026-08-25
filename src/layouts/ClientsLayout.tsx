import { ReactNode, useEffect, useState } from 'react';
import clientsNav from '@/data/clients-nav.json';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Calendar, AlertTriangle, FileText, UserCog, Clock as ClockIcon,
  Building2, Users, UserRound, Route as RouteIcon, Clock, ShieldCheck, Shield, ChevronRight,
  Home, MapPin, Contact, LayoutGrid, Target, BarChart3, File, DollarSign, Briefcase,
  IdCard, StickyNote, Folder, KeyRound, Mail,
} from 'lucide-react';

const TAB_ICONS: Record<string, any> = {
  Home, MapPin, Contact, FileText, LayoutGrid, Users, Target, AlertTriangle,
  BarChart3, File, DollarSign, Building2, Briefcase, IdCard, StickyNote, Folder, KeyRound, Mail,
};
import { Button } from '@/components/ui/button';
import { StatusBadge, SmartImage } from '@/components/kit';
import { clientService } from '@/lib/api/clientService';

type Props = { navKey: string; title?: string; children: ReactNode; client?: any };

type Ov = {
  postSitesCount: number; stationsCount: number; projectsCount: number;
  assignedCount: number; onsiteCount: number; toursLast7Days: number;
  incidentsLast7Days: number; hoursLoggedSeconds: number;
  accountExecutiveName?: string | null; tenantTimezone?: string | null;
};

/**
 * Los acentos heredados (`blue`/`green`/`orange`/`red`/`violet`) eran siete
 * colores de Tailwind fijos: siete colores que no se enteran de que el acento lo
 * elige el usuario. Se remapean a los tonos del sistema —los mismos alias que ya
 * usa `StatCard` del kit— para que el conjunto siga siendo coherente con
 * cualquier tono. No se cambia la firma: las llamadas de abajo siguen pasando
 * `accent: 'blue'`. `violet` no tiene equivalente semántico y cae en el acento.
 */
type KpiTone = 'brand' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
const ACCENT_TONE: Record<string, KpiTone> = {
  primary: 'brand', brand: 'brand', violet: 'brand',
  blue: 'info', green: 'ok', orange: 'warn', red: 'bad', slate: 'neutral',
};

function toneStyle(tone: KpiTone) {
  if (tone === 'brand') return { background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' };
  if (tone === 'neutral') return { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-soft)' };
  return {
    background: `color-mix(in oklab, var(--${tone}) 14%, transparent)`,
    borderColor: `color-mix(in oklab, var(--${tone}) 30%, transparent)`,
    color: `var(--${tone}-text)`,
  };
}

function KpiCard({ icon, value, label, accent = 'primary', to, sub, navigate }: any) {
  const tone = ACCENT_TONE[accent] || 'brand';
  return (
    <button
      onClick={() => to && navigate(to)}
      className={`glass-flat flex flex-col p-4 text-left ${to ? 'glass-hover cursor-pointer' : 'cursor-default'}`}
    >
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border [&_svg]:size-[18px]" style={toneStyle(tone)}>{icon}</span>
      <span className="font-display text-2xl font-bold leading-none tracking-tight tabular-nums" style={{ color: 'var(--ink)' }}>{value}</span>
      <span className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>{label}</span>
      {sub && <span className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--brand-text)' }}>{sub}</span>}
    </button>
  );
}

export default function ClientsLayout({ navKey, title, children, client }: Props) {
  const { t } = useTranslation();
  const cfg: any = (clientsNav as any)[navKey] || null;
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [ov, setOv] = useState<Ov | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!client?.id) return;
      const o = await clientService.getClientOverview(client.id).catch(() => null);
      if (mounted && o) setOv(o);
    })();
    return () => { mounted = false; };
  }, [client?.id]);

  const hiddenIds = ['profile', 'notes', 'files', 'userAccess', 'emailReports'];
  const resolvePathWithId = (path: string) => (id && path.includes(':id') ? path.replace(':id', id) : path);
  const allItems: any[] = (cfg?.sections || []).flatMap((s: any) => s.items || []);
  const items: any[] = allItems.filter((it: any) => !hiddenIds.includes(it.id));

  // Active-tab crumb — resolved against the UNFILTERED list so hidden tabs
  // (perfil/notas/archivos/…) still name the section in the breadcrumb.
  const activeItem = allItems.find((it: any) => resolvePathWithId(it.path) === location.pathname);
  const showTabCrumb = (activeItem?.id ?? 'overview') !== 'overview';
  const activeTabLabel = activeItem ? t(activeItem.label) : t('clients.nav.overview', 'Resumen');

  const displayName = client?.commercialName || client?.companyName
    ? (client?.commercialName || client?.companyName)
    : (client?.name || client?.firstName)
      ? `${client?.name || client?.firstName}${(client?.lastName || client?.surname) ? ' ' + (client?.lastName || client?.surname) : ''}`
      : t(cfg?.title ?? title ?? 'clients.nav.title');
  /**
   * El logotipo llega en más de una forma: la ficha lo trae como lista de
   * archivos, pero el tipo `Client` admite además una cadena (así lo devuelve
   * `card-meta`, que alimenta las tarjetas del listado). Esto sólo leía la
   * lista, y sólo su `downloadUrl`: con cualquier otra forma —una cadena, o un
   * archivo con `publicUrl` pero sin firmar— no pintaba nada y sin decir por
   * qué. Se resuelve como en la cabecera de sedes, que ya lo hacía bien.
   */
  const logo = (() => {
    const cand: any = client?.logoUrl;
    if (Array.isArray(cand)) return cand[0]?.downloadUrl || cand[0]?.publicUrl || null;
    if (typeof cand === 'string') return cand || null;
    return (cand && (cand.downloadUrl || cand.publicUrl)) || null;
  })();
  const nm = String(displayName || '?');

  const risk = String(client?.riskLevel || '').toLowerCase();
  // Riesgo alto/medio/bajo → bad/warn/ok. Los semánticos son FIJOS en tokens.css:
  // un riesgo alto sigue siendo rojo aunque el acento de la empresa sea rojo.
  const riskTone = risk.includes('alt') ? 'bad' : risk.includes('med') ? 'warn' : 'ok';
  const hoursWorked = (() => {
    const s = Number(ov?.hoursLoggedSeconds || 0);
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  })();
  const base = `/clients/${client?.id}`;
  const fmtD = (d: any) => (d ? new Date(d).toLocaleDateString() : null);

  const kpis = [
    { icon: <Building2 />, value: ov?.postSitesCount ?? '—', label: t('clients.overview.cards.postSites', 'Sedes activas'), accent: 'blue', to: `${base}/post-sites`, sub: t('common.viewDetail', 'Ver detalle') },
    { icon: <Shield />, value: ov?.stationsCount ?? '—', label: t('clients.overview.cards.stations', 'Estaciones'), accent: 'primary', to: `${base}/coverage`, sub: t('common.viewDetail', 'Ver detalle') },
    { icon: <Users />, value: ov?.assignedCount ?? '—', label: t('clients.overview.cards.guardsAssigned', 'Vigilantes asignados'), accent: 'green', sub: t('clients.overview.cards.viewStaff', 'Ver personal'), to: `${base}/staff` },
    { icon: <UserRound />, value: ov?.onsiteCount ?? '—', label: t('clients.overview.cards.onsite', 'En turno ahora'), accent: 'green', sub: t('clients.overview.cards.now', 'En este momento'), to: `${base}/staff` },
    { icon: <AlertTriangle />, value: ov?.incidentsLast7Days ?? '—', label: t('clients.overview.cards.incidents', 'Incidentes (7 días)'), accent: 'orange', to: `${base}/incidents`, sub: t('clients.overview.cards.viewIncidents', 'Ver incidentes') },
    { icon: <RouteIcon />, value: ov?.toursLast7Days ?? '—', label: t('clients.overview.cards.toursCompleted', 'Rondas (7 días)'), accent: 'violet', to: `${base}/reports`, sub: t('common.viewDetail', 'Ver detalle') },
    { icon: <Clock />, value: hoursWorked, label: t('clients.overview.cards.hoursWorked', 'Horas (7 días)'), accent: 'red', to: `${base}/reports`, sub: t('common.viewDetail', 'Ver detalle') },
    { icon: <ShieldCheck />, value: client?.active ? t('common.active', 'Activo') : t('common.archived', 'Inactivo'), label: t('clients.overview.cards.contract', 'Contrato'), accent: client?.active ? 'green' : 'slate', to: `${base}/contract`, sub: client?.contractEndDate ? `${t('clients.contractEnd', 'Hasta')} ${fmtD(client.contractEndDate)}` : t('common.viewDetail', 'Ver detalle') },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 px-4 py-4">
      {/* Breadcrumb: Clientes › {Cliente} › {Pestaña activa} */}
      <div className="flex min-w-0 items-center gap-1.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
        <Link to="/clients" className="shrink-0 hover:text-primary">{t('clients.nav.title', 'Clientes')}</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        {showTabCrumb ? (
          <>
            <Link to={`${base}/overview`} className="max-w-[180px] truncate hover:text-primary sm:max-w-[240px]" title={displayName}>{displayName}</Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0 font-medium" style={{ color: 'var(--ink)' }}>{activeTabLabel}</span>
          </>
        ) : (
          <span className="max-w-[220px] truncate font-medium sm:max-w-[320px]" style={{ color: 'var(--ink)' }} title={displayName}>{displayName}</span>
        )}
      </div>

      {/* Header card */}
      <div className="glass p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            {/* Fondo claro FIJO bajo el logo: es una imagen ajena (muchos logos
                son PNG con transparencia pensados para papel blanco) y se vería
                recortada sobre el cristal oscuro. No es color de la interfaz.
                SmartImage: esqueleto mientras carga, fundido al llegar, e
                iniciales si no hay logo o la carga falla — sin parpadeo. */}
            <SmartImage
              src={logo}
              alt=""
              rounded="rounded-2xl"
              className="h-16 w-16 shrink-0 border"
              style={{ background: 'oklch(1 0 0)', borderColor: 'var(--hairline)' }}
              fallback={
                <span
                  className="grid h-full w-full place-items-center text-2xl font-bold"
                  style={{ background: 'var(--brand-wash)', color: 'var(--brand-text)' }}
                >
                  {nm.charAt(0).toUpperCase()}
                </span>
              }
            />
            <div className="min-w-0">
              <h1 className="font-display truncate text-2xl font-bold tracking-tight" style={{ color: 'var(--ink)' }}>{displayName}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                {client?.active !== undefined && (
                  <StatusBadge tone={client.active ? 'ok' : 'bad'}>
                    {client.active ? t('common.active', 'Activo') : t('common.archived', 'Archivado')}
                  </StatusBadge>
                )}
                {client?.personType && (
                  <StatusBadge tone="neutral" dot={false}>
                    {client.personType === 'PJ' ? t('clients.corporate', 'Cliente corporativo') : t('clients.individual', 'Cliente particular')}
                  </StatusBadge>
                )}
                {client?.code && (
                  <span style={{ color: 'var(--ink-soft)' }}>{t('clients.code', 'Código')}: <span className="font-medium" style={{ color: 'var(--ink)' }}>{client.code}</span></span>
                )}
                {risk && (
                  <StatusBadge tone={riskTone} className="capitalize">
                    {t('clients.risk', 'Riesgo')}: {client.riskLevel}
                  </StatusBadge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                {client?.contractDate && (
                  <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {t('clients.contractStart', 'Inicio de contrato')}: <span style={{ color: 'var(--ink)' }}>{fmtD(client.contractDate)}</span></span>
                )}
                {(() => {
                  // Only meaningful for a persona jurídica (the company title ≠ the
                  // rep person). For a persona natural the client IS the person.
                  if (client?.personType !== 'PJ') return null;
                  const rep = `${client?.legalRepFirstName || client?.name || ''} ${client?.legalRepLastName || client?.lastName || ''}`.trim();
                  return rep ? (
                    <span className="inline-flex items-center gap-1.5"><UserCog className="h-3.5 w-3.5" /> {t('clients.accountExec', 'Representante legal')}: <span style={{ color: 'var(--ink)' }}>{rep}</span></span>
                  ) : null;
                })()}
                {ov?.tenantTimezone && (
                  <span className="inline-flex items-center gap-1.5"><ClockIcon className="h-3.5 w-3.5" /> {t('clients.timezone', 'Zona horaria')}: <span style={{ color: 'var(--ink)' }}>{ov.tenantTimezone}</span></span>
                )}
              </div>
            </div>
          </div>
          {client?.id && (
            /* Sin `shrink-0`: con cuatro botones su ancho natural pasa de 600 px
               y en un teléfono empujaba la página entera de lado. Al poder
               encogerse, los botones envuelven dentro de la propia fila. */
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/clients/edit/${client.id}`)}><Pencil className="mr-1 h-4 w-4" /> {t('clients.editClient', 'Editar cliente')}</Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/post-sites/new?clientId=${client.id}`, { state: { clientName: displayName } })}><Plus className="mr-1 h-4 w-4" /> {t('clients.hero.newSite', 'Crear sede')}</Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/dispatch-tickets/new')}><AlertTriangle className="mr-1 h-4 w-4" /> {t('clients.newIncident', 'Crear incidente')}</Button>
              <Button variant="brand" size="sm" onClick={() => navigate(`${base}/reports`)}><FileText className="mr-1 h-4 w-4" /> {t('clients.generateReport', 'Generar reporte')}</Button>
            </div>
          )}
        </div>
      </div>

      {/* KPI row — shared across EVERY tab (coverage included) so the header
          cards never jump around when switching subpáginas. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {kpis.map((k, i) => <KpiCard key={i} {...k} navigate={navigate} />)}
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto">
        <nav className="flex min-w-max items-center gap-1 border-b" style={{ borderColor: 'var(--hairline)' }}>
          {items.map((it) => {
            const path = resolvePathWithId(it.path);
            const active = location.pathname === path;
            const badge = it.id === 'postSites' ? ov?.postSitesCount : undefined;
            const Icon = it.icon ? TAB_ICONS[it.icon] : null;
            return (
              <Link
                key={it.id}
                to={path}
                className="cg-focus relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors"
                style={{ color: active ? 'var(--brand-text)' : 'var(--ink-soft)' }}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {t(it.label)}
                {typeof badge === 'number' && badge > 0 && (
                  // Sobre el relleno de marca la tinta es `--brand-ink`, NO blanco:
                  // `--brand` es un color claro (L 0.72/0.78) y el blanco encima da
                  // ~2,2:1. Ver la medición de contraste en tokens.css.
                  <span
                    className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
                    style={active
                      ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
                      : { background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}
                  >{badge}</span>
                )}
                {active && (
                  <span
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
                    style={{ background: 'var(--brand)', boxShadow: '0 0 12px 0 var(--brand-glow)' }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div>{children}</div>
    </div>
  );
}
