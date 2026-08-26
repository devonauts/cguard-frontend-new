import React, { useEffect, useState, useRef, RefObject } from 'react';
import { clientDisplayName } from '@/lib/clientName';
import { Link, useParams } from 'react-router-dom';
import { getTenantTimezone } from '@/utils/tenantLocation';
import { useTranslation } from "react-i18next";
import IncidentMap from "@/components/IncidentMap/IncidentMap";
import { categoryService } from '@/lib/api/categoryService';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';
import { ServiceTypeBadge } from '@/components/post-sites/ServiceTypeBadge';
import { postSiteService } from '@/lib/api/postSiteService';
import { stationService } from '@/lib/api/stationService';
import { toast } from 'sonner';
import { StatusBadge, EmptyState, SkeletonCards, SmartImage } from '@/components/kit';
import { MapPin, Phone, Mail, Building2, Globe, Tag, Pencil, Check, X, Shield, ShieldCheck, ShieldOff, Clock, UserCircle2 } from 'lucide-react';
import i18n from "@/i18n";

function formatDate(d?: string) {
    if (!d) return '-';
    try {
        return new Date(d).toLocaleDateString();
    } catch {
        return d;
    }
}

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col gap-0.5">
        <span className="cg-eyebrow">{label}</span>
        <span className="text-sm font-semibold">{value || '-'}</span>
    </div>
);

const RateRow = ({
    label, value, editing, saving,
    inputRef, onChange,
    onEdit, onSave, onCancel,
}: {
    label: string; value: string; editing: boolean; saving: boolean;
    inputRef: RefObject<HTMLInputElement>;
    onChange: (v: string) => void;
    onEdit: () => void; onSave: () => void; onCancel: () => void;
}) => (
    <div className="flex flex-col gap-0.5">
        <span className="cg-eyebrow">{label}</span>
        {editing ? (
            <div className="flex items-center gap-1">
                <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>$</span>
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d*\.?\d*$/.test(v)) onChange(v);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
                    className="cg-input cg-focus w-32 px-2 py-0.5 text-sm"
                    disabled={saving}
                    placeholder="0.00"
                />
                <button onClick={onSave} disabled={saving} aria-label={i18n.t('ui.Profile.guardarTarifa')} className="cg-focus rounded p-1 disabled:opacity-40" style={{ color: 'var(--ok-text)' }}>
                    <Check size={14} />
                </button>
                <button onClick={onCancel} disabled={saving} aria-label={i18n.t('actions.cancel')} className="cg-focus rounded p-1 disabled:opacity-40" style={{ color: 'var(--bad-text)' }}>
                    <X size={14} />
                </button>
            </div>
        ) : (
            <div className="group flex items-center gap-1.5">
                <span className="text-sm font-semibold">
                    {value ? `$${parseFloat(value).toFixed(2)}` : '-'}
                </span>
                {/* En táctil no hay `hover`: con `opacity-0` el lápiz era
                    invisible y la tarifa no se podía editar desde un teléfono. */}
                <button
                    onClick={onEdit}
                    className="cg-btn-ghost cg-focus grid h-8 w-8 place-items-center rounded transition-opacity md:h-auto md:w-auto md:p-0.5 md:opacity-0 md:group-hover:opacity-100"
                    title={i18n.t('actions.edit')}
                    aria-label={i18n.t('ui.Profile.editarTarifa')}
                >
                    <Pencil size={12} />
                </button>
            </div>
        )}
    </div>
);

export default function PostSiteProfile({ site }: { site?: any }) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement | null>(null);
    useScrollToTopOnMount(containerRef);
    const { id } = useParams<{ id: string }>();

    // "Cliente" = la empresa. clientAccountName ya viene resuelto por el backend
    // (businessNameOf); commercialName cubre el caso del objeto crudo.
    const clientName = clientDisplayName(site?.client ?? site?.clientAccount, '')
      || site?.clientAccountName || '-';
    const siteName = site?.companyName || site?.name || '-';
    const addedOn = formatDate(site?.createdAt || site?.created_at || site?.created_date);
    const address = site?.address || site?.secondAddress || '-';
    const client = site?.client || site?.clientAccount;
    const contactPhone = site?.contactPhone || site?.phone || site?.contact_phone || client?.phoneNumber || client?.phone || '-';
    const contactEmail = site?.contactEmail || site?.email || site?.contact_email || client?.email || '-';
    const fax = site?.fax || '-';

    // Inline-editable rates
    const [chargeRate, setChargeRate] = useState<string>('');
    const [payRate, setPayRate] = useState<string>('');
    const [editingCharge, setEditingCharge] = useState(false);
    const [editingPay, setEditingPay] = useState(false);
    const [savingCharge, setSavingCharge] = useState(false);
    const [savingPay, setSavingPay] = useState(false);
    const chargeInputRef = useRef<HTMLInputElement>(null);
    const payInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setChargeRate(site?.chargeRate != null ? String(site.chargeRate) : '');
        setPayRate(site?.payRate != null ? String(site.payRate) : '');
    }, [site]);

    useEffect(() => { if (editingCharge) chargeInputRef.current?.focus(); }, [editingCharge]);
    useEffect(() => { if (editingPay) payInputRef.current?.focus(); }, [editingPay]);

    const saveRate = async (field: 'chargeRate' | 'payRate', value: string, setSaving: (v: boolean) => void, setEditing: (v: boolean) => void) => {
        if (!id) return;
        setSaving(true);
        try {
            const numVal = value.trim() === '' ? null : parseFloat(value);
            await postSiteService.update(id, { [field]: numVal } as any);
            toast.success(t('postSites.profile.rateSaved', 'Rate saved'));
            setEditing(false);
        } catch {
            toast.error(t('postSites.profile.rateSaveError', 'Failed to save rate'));
        } finally {
            setSaving(false);
        }
    };

    const [categoryNames, setCategoryNames] = useState<string[] | null>(null);
    // Shape comes straight from stationService.activeStatus (stations + on-duty guards).
    type ActiveStatus = Awaited<ReturnType<typeof stationService.activeStatus>>;
    const [activeStatus, setActiveStatus] = useState<ActiveStatus | null>(null);
    const [activeStatusLoading, setActiveStatusLoading] = useState(false);

    useEffect(() => {
        let mounted = true;
        async function loadCategoryNames() {
            try {
                if (site?.categoryNames && Array.isArray(site.categoryNames) && site.categoryNames.length) {
                    if (mounted) setCategoryNames(site.categoryNames.map(String));
                    return;
                }
                const ids = site?.categoryIds;
                if (!ids || !Array.isArray(ids) || ids.length === 0) {
                    if (mounted) setCategoryNames([]);
                    return;
                }
                const resp = await categoryService.list({ filter: { module: 'postSite' }, limit: 1000 });
                const map = new Map<string, string>();
                (resp.rows || []).forEach((c: any) => map.set(String(c.id), c.name));
                const names = ids.map((id: any) => map.get(String(id)) || String(id));
                if (mounted) setCategoryNames(names);
            } catch (e) {
                if (mounted) setCategoryNames((site?.categoryNames && Array.isArray(site.categoryNames)) ? site.categoryNames.map(String) : []);
            }
        }
        loadCategoryNames();
        return () => { mounted = false; };
    }, [site]);

    // Fetch active status (stations + on-duty guards)
    useEffect(() => {
        if (!id) return;
        let mounted = true;
        setActiveStatusLoading(true);
        stationService.activeStatus(id)
            .then(data => { if (mounted) setActiveStatus(data); })
            .catch(() => { /* silently ignore */ })
            .finally(() => { if (mounted) setActiveStatusLoading(false); });
        return () => { mounted = false; };
    }, [id]);

    const categories = (() => {
        if (Array.isArray(site?.categories) && site.categories.length > 0)
            return site.categories.map((c: any) => c?.name || c?.label || c?.title || String(c)).join(', ');
        if (categoryNames && categoryNames.length) return categoryNames.join(', ');
        if (Array.isArray(site?.categoryNames) && site.categoryNames.length > 0) return site.categoryNames.join(', ');
        if (Array.isArray(site?.categoryIds) && site.categoryIds.length > 0) {
            if (site.categoryLookup && typeof site.categoryLookup === 'object')
                return site.categoryIds.map((id: any) => site.categoryLookup[id] ?? id).join(', ');
            return site.categoryIds.join(', ');
        }
        return '-';
    })();

    const postalCode = site?.postalCode || site?.zipCode || '-';
    const city = site?.city || '-';
    const country = site?.country || '-';

    // Images from client account
    const logoArr = client?.logoUrl;
    const logoImgUrl = Array.isArray(logoArr) && logoArr.length > 0
        ? (logoArr[0].downloadUrl || logoArr[0].publicUrl || null) : null;
    const placeArr = client?.placePictureUrl;
    const placePicImgUrl = Array.isArray(placeArr) && placeArr.length > 0
        ? (placeArr[0].downloadUrl || placeArr[0].publicUrl || null) : null;

    // Map coordinates
    const mapLat = site?.latitud ?? site?.latitude ?? site?.lat ?? (site?.location && site.location.lat);
    const mapLng = site?.longitud ?? site?.longitude ?? site?.lng ?? (site?.location && site.location.lng);
    const mapAddress = site?.address || site?.secondAddress || site?.companyAddress || '';
    const mapLatNum = mapLat ? Number(mapLat) : NaN;
    const mapLngNum = mapLng ? Number(mapLng) : NaN;

    return (
        <div ref={containerRef} className="space-y-0 animate-fade-up">
            <div className="glass overflow-hidden">

                {/* ── Cover photo ─────────────────────────────────────────── */}
                <div className="relative h-64 overflow-hidden md:h-80" style={{ background: 'var(--glass-sunken)' }}>
                    <SmartImage
                        src={placePicImgUrl}
                        alt={siteName}
                        rounded="rounded-none"
                        className="h-full w-full"
                        fallback={
                            <div className="flex h-full w-full items-center justify-center" style={{ color: 'var(--ink-faint)' }}>
                                <Building2 size={64} />
                            </div>
                        }
                    />
                    {id && (
                        <Link
                            to={`/post-sites/${id}/edit`}
                            className="cg-btn-glass cg-focus absolute right-4 top-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition"
                        >
                            <Pencil size={12} />
                            {t('postSites.profile.Edit', 'Editar')}
                        </Link>
                    )}
                </div>

                {/* ── Identity strip ──────────────────────────────────────── */}
                <div className="relative z-10 px-6 pb-6">
                    {/* Logo sits on the border just below the cover */}
                    <div className="mb-5 mt-4 flex items-center gap-4">
                        <div
                            className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border-4"
                            style={{ borderColor: 'var(--glass-solid)', background: 'var(--glass-sunken)', boxShadow: 'var(--lift-2)' }}
                        >
                            <SmartImage
                                src={logoImgUrl}
                                alt={clientName}
                                fit="contain"
                                rounded="rounded-none"
                                className="h-full w-full p-1"
                                fallback={
                                    <div className="flex h-full w-full items-center justify-center" style={{ color: 'var(--ink-faint)' }}>
                                        <Building2 size={26} />
                                    </div>
                                }
                            />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-display text-xl font-bold leading-tight">{siteName}</h2>
                                <ServiceTypeBadge value={site?.serviceType} size="md" />
                            </div>
                            <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-soft)' }}>{clientName}</p>
                        </div>
                    </div>

                    {site?.description && (
                        <p className="mb-5 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{site.description}</p>
                    )}

                    {/* ── Lo que se pidió al dar de alta la sede ─────────────
                        El asistente recoge nivel de riesgo, puestos requeridos,
                        consignas, equipo especial y formación exigida, los guarda
                        en `serviceConfig`… y NO LOS MOSTRABA NADIE. Datos de sólo
                        escritura: el operador los teclea al crear el sitio y no
                        vuelve a verlos jamás — las consignas del puesto, que es
                        justo lo que un vigilante nuevo necesita leer.
                        (El formulario de 45 campos que existía para esto era un
                        archivo sin importadores; se eliminó.) */}
                    {(() => {
                        const cfg: any = (site as any)?.serviceConfig || {};
                        const lista = (v: any) => (Array.isArray(v) ? v.filter(Boolean) : []);
                        const equipo = lista(cfg.specialEquipment);
                        const formacion = lista(cfg.trainingRequired);
                        // Las 12 casillas de despliegue del asistente. Eran el
                        // último resto de sólo-escritura de serviceConfig: se
                        // marcaban al crear la sede y no se veían nunca más.
                        // Mostrarlas aquí es lo prometido al cliente, a la vista
                        // de quien opera la sede.
                        const DESPLIEGUE: Array<[string, string]> = [
                            // MISMAS etiquetas que DEPLOY_CHECKS del asistente:
                            // el operador reencuentra las palabras que marcó.
                            ['armedService', 'Vigilante armado'],
                            ['uniformRequired', 'Uniforme obligatorio'],
                            ['periodicPatrol', 'Patrullaje perimetral'],
                            ['k9Service', 'Canes / K9'],
                            ['vehicleControl', 'Control acceso vehicular'],
                            ['cctvMonitoring', 'Monitoreo CCTV'],
                            ['visitorLog', 'Registro de visitantes'],
                            ['incidentLog', 'Libro de novedades'],
                            ['formalHandover', 'Entrega de turno formal'],
                            ['keyCustody', 'Custodia de llaves'],
                            ['alarmResponse', 'Respuesta a alarmas'],
                            ['radioComms', 'Comunicación por radio'],
                        ];
                        const despliegueActivo = DESPLIEGUE.filter(([k]) => cfg[k] === true);
                        const hayAlgo =
                            cfg.postInstructions || cfg.riskLevel || cfg.stationsRequired ||
                            equipo.length || formacion.length || despliegueActivo.length;
                        if (!hayAlgo) return null;
                        return (
                            <div className="glass-sunken mb-5 space-y-3 p-4">
                                <h4 className="cg-eyebrow">{t('ui.Profile.condicionesDelServicio')}</h4>
                                {cfg.riskLevel && <InfoRow label="Nivel de riesgo" value={String(cfg.riskLevel)} />}
                                {cfg.stationsRequired ? (
                                    <InfoRow label="Puestos requeridos" value={String(cfg.stationsRequired)} />
                                ) : null}
                                {equipo.length ? (
                                    <InfoRow label="Equipo especial" value={equipo.join(', ')} />
                                ) : null}
                                {formacion.length ? (
                                    <InfoRow label={t("ui.Profile.formacionExigida", "Formación exigida")} value={formacion.join(', ')} />
                                ) : null}
                                {despliegueActivo.length ? (
                                    <div>
                                        <p className="cg-eyebrow mb-1">Servicio contratado</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {despliegueActivo.map(([k, label]) => (
                                                <span key={k} className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                                                    style={{ background: 'color-mix(in oklab, var(--brand) 14%, transparent)', color: 'var(--brand-text)' }}>
                                                    {label}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                {cfg.postInstructions && (
                                    <div>
                                        <p className="cg-eyebrow mb-1">{t('ui.Profile.consignasDelPuesto')}</p>
                                        <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                                            {String(cfg.postInstructions)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* ── Three info cards ───────────────────────────────── */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* General Information */}
                        <div className="glass-sunken space-y-3 p-4">
                            <h4 className="cg-eyebrow">{t('postSites.profile.GeneralInformation.title')}</h4>
                            <InfoRow label={t('postSites.profile.GeneralInformation.client')} value={clientName} />
                            <InfoRow label={t('postSites.profile.GeneralInformation.siteName')} value={siteName} />
                            <InfoRow label={t('postSites.profile.GeneralInformation.addedOn')} value={addedOn} />
                            <InfoRow
                                label={t('postSites.profile.GeneralInformation.address')}
                                value={address !== '-' ? (
                                    <span className="flex items-start gap-1">
                                        <MapPin size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-text)' }} />
                                        {address}
                                    </span>
                                ) : '-'}
                            />
                        </div>

                        {/* Contact Details */}
                        <div className="glass-sunken space-y-3 p-4">
                            <h4 className="cg-eyebrow">{t('postSites.profile.ContactDetails.title')}</h4>
                            <InfoRow
                                label={t('postSites.profile.ContactDetails.phoneNumber')}
                                value={contactPhone !== '-' ? (
                                    <a href={`tel:${contactPhone}`} className="cg-btn-link cg-focus flex items-center gap-1 rounded hover:underline">
                                        <Phone size={12} />{contactPhone}
                                    </a>
                                ) : '-'}
                            />
                            <InfoRow
                                label={t('postSites.profile.ContactDetails.email')}
                                value={contactEmail !== '-' ? (
                                    <a href={`mailto:${contactEmail}`} className="cg-btn-link cg-focus flex items-center gap-1 break-all rounded hover:underline">
                                        <Mail size={12} />{contactEmail}
                                    </a>
                                ) : '-'}
                            />
                            <InfoRow label={t('postSites.profile.ContactDetails.fax')} value={fax} />
                        </div>

                        {/* More Information + Rates */}
                        <div className="glass-sunken space-y-3 p-4">
                            <h4 className="cg-eyebrow">{t('postSites.profile.MoreInformation.title')}</h4>
                            {categories !== '-' && (
                                <InfoRow
                                    label={t('postSites.profile.MoreInformation.categories')}
                                    value={<span className="flex items-center gap-1"><Tag size={12} style={{ color: 'var(--brand-text)' }} />{categories}</span>}
                                />
                            )}
                            <InfoRow label={t('postSites.profile.MoreInformation.city')} value={
                                <span className="flex items-center gap-1">
                                    {city !== '-' && <Globe size={12} style={{ color: 'var(--brand-text)' }} />}
                                    {[city, country].filter(v => v && v !== '-').join(', ') || '-'}
                                </span>
                            } />
                            <InfoRow label={t('postSites.profile.MoreInformation.postalCode')} value={postalCode} />

                            <div className="space-y-3 border-t pt-1" style={{ borderColor: 'var(--hairline)' }}>
                                <RateRow
                                    label={t('postSites.profile.MoreInformation.postSiteChargeRate')}
                                    value={chargeRate}
                                    editing={editingCharge}
                                    saving={savingCharge}
                                    inputRef={chargeInputRef}
                                    onChange={setChargeRate}
                                    onEdit={() => setEditingCharge(true)}
                                    onSave={() => saveRate('chargeRate', chargeRate, setSavingCharge, setEditingCharge)}
                                    onCancel={() => { setChargeRate(site?.chargeRate != null ? String(site.chargeRate) : ''); setEditingCharge(false); }}
                                />
                                <RateRow
                                    label={t('postSites.profile.MoreInformation.postSitePayRate')}
                                    value={payRate}
                                    editing={editingPay}
                                    saving={savingPay}
                                    inputRef={payInputRef}
                                    onChange={setPayRate}
                                    onEdit={() => setEditingPay(true)}
                                    onSave={() => saveRate('payRate', payRate, setSavingPay, setEditingPay)}
                                    onCancel={() => { setPayRate(site?.payRate != null ? String(site.payRate) : ''); setEditingPay(false); }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Map ─────────────────────────────────────────────────── */}
                <div className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                    {!isNaN(mapLatNum) && !isNaN(mapLngNum) ? (
                        <div className="h-64">
                            <IncidentMap lat={mapLatNum} lng={mapLngNum} label={siteName} />
                        </div>
                    ) : mapAddress ? (
                        <div className="flex h-20 items-center justify-center gap-3 text-sm" style={{ background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}>
                            <MapPin size={16} />
                            <span>{t('postSites.profile.Map.NoCoordinates')}</span>
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress)}`}
                                target="_blank" rel="noreferrer"
                                className="cg-btn-link cg-focus rounded underline"
                            >Abrir en Google Maps</a>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* ── Stations & On-Duty Guards ────────────────────────────────── */}
            <div className="glass mt-4 overflow-hidden">
                <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: 'var(--hairline)' }}>
                    <div className="flex items-center gap-2">
                        <Shield size={16} style={{ color: 'var(--brand-text)' }} />
                        <h3 className="text-sm font-bold uppercase tracking-wide">Estaciones de servicio</h3>
                    </div>
                    {activeStatusLoading && (
                        <span
                            className="inline-block h-4 w-4 animate-spin rounded-full border-2"
                            style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
                        />
                    )}
                </div>

                {!Array.isArray(activeStatus?.stations) || activeStatus.stations.length === 0 ? (
                    activeStatusLoading ? (
                        <div className="p-6"><SkeletonCards count={2} /></div>
                    ) : (
                        <div className="p-6">
                            <EmptyState icon={<Shield />} title={t('ui.Profile.noHayEstacionesRegistradasPara')} />
                        </div>
                    )
                ) : (
                    <div>
                        {activeStatus.stations.map((station) => (
                            <div key={station.id} className="border-b px-6 py-4 last:border-0" style={{ borderColor: 'var(--hairline)' }}>
                                {/* Station header */}
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    {station.isActive ? (
                                        <ShieldCheck size={16} className="flex-shrink-0" style={{ color: 'var(--ok-text)' }} />
                                    ) : (
                                        <ShieldOff size={16} className="flex-shrink-0" style={{ color: 'var(--ink-faint)' }} />
                                    )}
                                    <span className="text-sm font-semibold">{station.stationName}</span>
                                    <StatusBadge tone={station.isActive ? 'ok' : 'neutral'} className="ml-auto">
                                        {station.isActive ? 'Activo' : 'Sin cobertura'}
                                    </StatusBadge>
                                </div>

                                {/* Active guards grid */}
                                {station.isActive && (station.activeGuards?.length ?? 0) > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {station.activeGuards?.map((guard) => (
                                            <div
                                                key={guard.id}
                                                className="flex flex-col items-center gap-1.5 rounded-xl border p-3"
                                                style={{
                                                    background: 'color-mix(in oklab, var(--ok) 10%, transparent)',
                                                    borderColor: 'color-mix(in oklab, var(--ok) 26%, transparent)',
                                                }}
                                            >
                                                <SmartImage
                                                    src={guard.photoUrl}
                                                    alt={guard.fullName}
                                                    rounded="rounded-full"
                                                    className="h-12 w-12 border-2"
                                                    style={{ borderColor: 'color-mix(in oklab, var(--ok) 40%, transparent)' }}
                                                    fallback={
                                                        <span
                                                            className="grid h-full w-full place-items-center"
                                                            style={{ background: 'color-mix(in oklab, var(--ok) 18%, transparent)', color: 'var(--ok-text)' }}
                                                        >
                                                            <UserCircle2 size={26} />
                                                        </span>
                                                    }
                                                />
                                                <span className="text-center text-xs font-semibold leading-tight">{guard.fullName}</span>
                                                <span
                                                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                                    style={{ background: 'color-mix(in oklab, var(--ok) 16%, transparent)', color: 'var(--ok-text)' }}
                                                >
                                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--ok)' }} />
                                                    En turno
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* No active guards — show next shift */}
                                {!station.isActive && (
                                    <div className="glass-sunken mt-1 flex items-start gap-3 px-4 py-3">
                                        <Clock size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--ink-faint)' }} />
                                        {station.nextShift ? (
                                            <div className="text-sm">
                                                <span className="cg-eyebrow mb-0.5 block">{t("ui.Profile.proximoTurno", "Próximo turno")}</span>
                                                <span className="font-semibold">
                                                    {new Date(station.nextShift.startTime).toLocaleString('es', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: getTenantTimezone() })}
                                                </span>
                                                {station.nextShift.guard && (
                                                    <span style={{ color: 'var(--ink-soft)' }}> · {station.nextShift.guard.fullName}</span>
                                                )}
                                                <span className="ml-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                                                    hasta {new Date(station.nextShift.endTime).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: getTenantTimezone() })}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t("ui.Profile.sinTurnosProgramadosEnLos", "Sin turnos programados en los próximos 7 días.")}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

