"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CompanyPhoneField from "./profile/CompanyPhoneField";
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';
import {
  Camera,
  Pencil,
  Search,
  Building2,
  MapPin,
  Clock,
  Phone,
  Lock,
  Wand2,
} from "lucide-react";
import { Section, Stagger, IconTile, EmptyState, SmartImage } from "@/components/kit";
import { useAuth } from "@/contexts/AuthContext";
import tenantService from '@/services/tenant.service';
import { invalidateTenantBranding } from '@/lib/tenantBranding';
import AddressAutocomplete, { AddressComponents } from "@/components/maps/AddressAutocomplete";
import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import CompanyDocumentsSection, { CompanyDocument } from "./profile/documents/CompanyDocumentsSection";
import TenantJoinModal from "@/components/TenantJoinModal";
import { validateTaxNumberForCountry, taxIdLabelFor, resolveCountryCode } from '@/lib/validators/id';
import { COUNTRIES } from '@/lib/data/countries';
import { Combobox } from '@/components/app/combobox';
import { DEFAULT_TIMEZONE, timezoneOptions, tzForCountry, browserTimezone } from '@/lib/timezones';
import { cacheTenantLocation } from '@/utils/tenantLocation';
import { geocodeRaw, parseGeocodeResult } from '@/utils/geocodeAddress';

// useEffect imported above

// Payload sent to tenantService.update when saving company profile.
type TenantUpdatePayload = {
  name: string;
  website?: string;
  address: string;
  billingAddress: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  email: string;
  licenseNumber: string;
  taxNumber: string;
  timezone: string;
  phone: string | null;
};

// A legal document as returned on the tenant record.
type TenantLegalDoc = {
  id: string;
  name: string;
  downloadUrl?: string;
  publicUrl?: string;
  type?: string;
  mimeType?: string;
};

// The tenant record as read back from tenantService.findById. Only the fields
// this form consumes are named. `settings` may arrive as a single object or an
// array (legacy vs. current backend shapes).
type TenantSettingsLike = { logoUrl?: string };
type TenantRecord = {
  name?: string;
  website?: string;
  address?: string;
  billingAddress?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  email?: string;
  licenseNumber?: string;
  license?: string;
  taxNumber?: string;
  ruc?: string;
  timezone?: string;
  phone?: string | number;
  logoUrl?: string;
  logo?: { downloadUrl?: string };
  settings?: TenantSettingsLike | TenantSettingsLike[];
  legalDocuments?: TenantLegalDoc[];
};
// findById may wrap the record as { data } or { tenant }, or return it directly.
type TenantResponse = TenantRecord & { data?: TenantRecord; tenant?: TenantRecord };

// Resolve a logo URL from the settings blob regardless of object/array shape.
const readSettingsLogo = (settings: TenantSettingsLike | TenantSettingsLike[] | undefined): string | undefined =>
  Array.isArray(settings) ? settings[0]?.logoUrl : settings?.logoUrl;

// Minimal shapes for the Google Maps geocoder results consumed below.
type GeocodeComponent = { types: string[]; long_name: string };
/**
 * ISO-2 en minúsculas con el que sesgar el geocodificador, o `undefined` si no
 * se reconoce el país. Sin sesgo se busca en todo el mundo, que es peor que
 * acertar el país pero infinitamente mejor que forzar el país equivocado.
 */
function regionDelPais(country?: string): string | undefined {
  const p = (country || '').trim();
  if (!p) return undefined;
  if (/^[A-Za-z]{2}$/.test(p)) return p.toLowerCase();
  const propio = resolveCountryCode(p);
  if (propio) return propio.toLowerCase();
  const encontrado = COUNTRIES.find((c) => c.name.toLowerCase() === p.toLowerCase());
  return encontrado ? encontrado.code.toLowerCase() : undefined;
}

type GeocodeResult = {
  geometry?: { location: { lat: () => number; lng: () => number } };
  formatted_address?: string;
  address_components?: GeocodeComponent[];
};

export default function ProfileCompanyForm() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const isAdmin = (() => {
    if (!user) return false;
    const parseRoles = (r: unknown): unknown[] => {
      if (!r) return [];
      if (Array.isArray(r)) return r;
      if (typeof r === 'string') {
        try {
          const parsed = JSON.parse(r);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {
          return [r];
        }
      }
      return [];
    };

    const topRoles = parseRoles(user.roles);
    if (topRoles.includes('admin')) return true;
    if (Array.isArray(user.tenants) && user.tenants.length > 0) {
      const t = user.tenants[0];
      const tRoles = parseRoles(t.roles);
      if (tRoles.includes('admin')) return true;
    }
    return false;
  })();

  const canEdit = isAdmin;
  const [logo, setLogo] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showAddressAutocomplete, setShowAddressAutocomplete] = useState(true);
  const [autocompleteOpenQuery, setAutocompleteOpenQuery] = useState('');
  const [showBillingAddressAutocomplete, setShowBillingAddressAutocomplete] = useState(true);
  // State for company legal documents
  const [companyDocuments, setCompanyDocuments] = useState<CompanyDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [country, setCountry] = useState({
    code: "US",
    dialCode: "+1",
    name: "United States",
    flag: "🇺🇸",
  });

  const [form, setForm] = useState({
    name: "",
    phone: "",
    website: "",
    address: "",
    billingAddress: "",
    addressLine2: "",
    city: "",
    postalCode: "",
    country: "",
    latitude: "",
    longitude: "",
    email: "",
    license: "",
    ruc: "",
    // El valor inicial es la zona del equipo de quien rellena el perfil. Estaba
    // fijo en "America/Guayaquil": una empresa de Madrid que no tocara el
    // selector quedaba siete horas corrida en turnos, rondas e informes.
    timezone: DEFAULT_TIMEZONE,
  });

  const [phoneE164, setPhoneE164] = useState("");
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);

  // resolved tenantId used across render and effect
  const resolvedTenantId =
    localStorage.getItem("tenantId") ||
    (user && Array.isArray(user.tenants) && user.tenants.length > 0
      ? (user.tenants[0].tenantId || (user.tenants[0].tenant && user.tenants[0].tenant.id))
      : null);
  const isPhoneValid = (() => {
    if (!phoneE164) return false;
    try {
      const parsed = parsePhoneNumberFromString(String(phoneE164));
      return !!parsed && parsed.isValid();
    } catch (err) {
      return false;
    }
  })();
  const onPickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(f);
    setLogoFile(f);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneE164 && !isPhoneValid) {
      toast.error(t('settings.companyProfile.phoneInvalidBeforeSave', { defaultValue: 'Por favor ingresa un número de teléfono válido antes de guardar.' }));
      return;
    }

    (async () => {
      try {
        const tenantId = resolvedTenantId;
        if (!tenantId) throw new Error('Tenant no definido');

        const payload: TenantUpdatePayload = {
          name: form.name,
          // website is optional: only include when non-empty
          // this prevents sending an empty string which some backends treat as a required field
          ...(form.website && String(form.website).trim() ? { website: form.website } : {}),
          address: form.address,
          billingAddress: form.billingAddress,
          addressLine2: form.addressLine2,
          city: form.city,
          postalCode: form.postalCode,
          country: form.country,
          latitude: form.latitude && form.latitude !== '' ? parseFloat(form.latitude) : null,
          longitude: form.longitude && form.longitude !== '' ? parseFloat(form.longitude) : null,
          email: form.email,
          licenseNumber: form.license,
          taxNumber: form.ruc,
          timezone: form.timezone,
          phone: phoneE164 || null,
        };

        await tenantService.update(String(tenantId), payload);
        cacheTenantLocation(payload.latitude, payload.longitude);
        toast.success(t('settings.companyProfile.savedOk', { defaultValue: 'Datos de la empresa guardados correctamente' }));
      } catch (err) {
        console.error('Error guardando tenant:', err);
        toast.error(t('settings.companyProfile.saveError', { defaultValue: 'Error al guardar datos de la empresa: ' }) + ((err as { message?: string })?.message || ''));
      }
    })();
  };

  // Auto-upload logo when user selects a file for an existing tenant
  useEffect(() => {
    if (!logoFile || !resolvedTenantId) return;
    let cancelled = false;
    (async () => {
      if (uploadingLogo) return;
      setUploadingLogo(true);
      try {
        await tenantService.uploadLogo(logoFile, String(resolvedTenantId));
        if (cancelled) return;
        // Logo changed -> bust the sidebar branding cache so it re-resolves.
        invalidateTenantBranding();
        toast.success(t('settings.companyProfile.logoUploadedOk', { defaultValue: 'Logo subido correctamente' }));
        // Refresh tenant to get new logoUrl for preview
        try {
          const res = (await tenantService.findById(String(resolvedTenantId))) as TenantResponse;
          const t: TenantRecord = (res && (res.data || res.tenant)) ? (res.data || res.tenant)! : res;
          if (t) {
            setLogo(t.logoUrl || readSettingsLogo(t.settings) || null);
          }
        } catch (e) {
          // ignore
        }
        setLogoFile(null);
      } catch (err) {
        if (!cancelled) toast.error(t('settings.companyProfile.logoUploadError', { defaultValue: 'No se pudo subir el logo: ' }) + ((err as { message?: string })?.message || ''));
      } finally {
        setUploadingLogo(false);
      }
    })();
    return () => { cancelled = true; };
  }, [logoFile, resolvedTenantId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tenantId = resolvedTenantId;
        if (!tenantId) return;

        const res = (await tenantService.findById(String(tenantId))) as TenantResponse;
        if (!mounted || !res) return;

        // Normalize response shape: some endpoints return { data: tenant } or { tenant: {...} }
        const t: TenantRecord = (res && (res.data || res.tenant)) ? (res.data || res.tenant)! : res;
        console.debug('Loaded tenant (normalized):', t, 'rawResponse:', res);

        setForm((s) => ({
          ...s,
          name: t.name ?? "",
          website: t.website ?? "",
          address: t.address ?? "",
          billingAddress: t.billingAddress ?? "",
          addressLine2: t.addressLine2 ?? "",
          city: t.city ?? "",
          postalCode: t.postalCode ?? "",
          country: t.country ?? "",
          latitude: t.latitude ? String(t.latitude) : "",
          longitude: t.longitude ? String(t.longitude) : "",
          email: t.email ?? "",
          license: t.licenseNumber ?? t.license ?? "",
          ruc: t.taxNumber ?? t.ruc ?? "",
          timezone: t.timezone ?? s.timezone,
        }));

        // Keep the business location cache in sync
        cacheTenantLocation(t.latitude, t.longitude);

        if (t.phone) setPhoneE164(String(t.phone));

        // Set existing logo preview if available
        try {
          const existingLogo = t.logoUrl || readSettingsLogo(t.settings) || (t.logo && t.logo.downloadUrl);
          if (existingLogo) setLogo(String(existingLogo));
        } catch (e) {
          // ignore
        }

        // Load company legal documents if present
        if (Array.isArray(t.legalDocuments)) {
          setCompanyDocuments(
            t.legalDocuments.map((doc: TenantLegalDoc) => ({
              id: doc.id,
              name: doc.name,
              url: doc.downloadUrl || doc.publicUrl || '',
              type: doc.type || doc.mimeType || '',
            }))
          );
        } else {
          setCompanyDocuments([]);
        }
      } catch (err) {
        console.warn('No se pudo cargar datos del tenant:', err);
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  // ── Dirección → coordenadas ────────────────────────────────────────────────
  //
  // DOS ARREGLOS DE COSTE EN EL MISMO EFECTO.
  //
  // 1. Ya no se construye `new google.maps.Geocoder()`. Ese camino iba directo a
  //    la Geocoding API de Google (~5 USD/1.000) sin caché de ninguna clase: la
  //    dirección de la empresa se pagaba entera cada vez que alguien entraba en
  //    Configuración. Ahora se pide por `geocodeAddress`, que resuelve por la
  //    caché compartida del servidor y sólo llega a Google si el proveedor
  //    gratuito no supo responder — una vez, para todas las empresas y para
  //    siempre.
  //
  // 2. El retardo era de 700 ms, que NO agrupa una dirección: agrupa hasta la
  //    siguiente pausa al teclear. Escribir "Av. Amazonas N24-03 y Colón, Quito"
  //    a mano eran fácilmente 4-6 consultas para una sola dirección. Ahora son
  //    1.500 ms y, sobre todo, hay un guardia de repetición: la misma cadena no
  //    se consulta dos veces aunque el efecto se vuelva a disparar.
  const ultimaConsultaRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    const direccion = String(form.address || '').trim();
    const faltanCoords = !form.latitude || !form.longitude || form.latitude === '' || form.longitude === '';
    // Menos de 8 caracteres no es una dirección, es alguien empezando a escribir.
    if (!direccion || direccion.length < 8 || !faltanCoords) return;
    if (ultimaConsultaRef.current === direccion) return;

    const timer = setTimeout(async () => {
      try {
        ultimaConsultaRef.current = direccion;
        // Antes se buscaba `${direccion} Ecuador` con region:'ec'. Eso devolvía
        // coordenadas ecuatorianas para una dirección de Madrid, y como el
        // resultado sobrescribe latitud, longitud, ciudad, código postal y país,
        // la empresa acababa con el centro de todos sus mapas y geocercos en
        // otro continente. Se busca la dirección tal cual, sesgada al país que
        // el propio formulario ya conoce (y sin sesgo si no se sabe).
        const region = regionDelPais(form.country);
        const best = (await geocodeRaw(direccion, region ? { region } : {}))[0] as GeocodeResult | undefined;
        if (cancelled || !best) return;

        const datos = parseGeocodeResult(best);
        if (!datos) return;

        setForm((s) => ({
          ...s,
          latitude: String(datos.latitude),
          longitude: String(datos.longitude),
          address: datos.formattedAddress || s.address,
          city: datos.city || s.city,
          postalCode: datos.postalCode || s.postalCode,
          country: datos.country || s.country,
        }));
        toast?.success?.(t('settings.companyProfile.coordsFound', { defaultValue: 'Coordenadas encontradas para la dirección' }));
      } catch (err) {
        // ignore
      }
    }, 1500);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.address, form.latitude, form.longitude, form.country]);
  // Handler to upload a new legal document
  const handleUploadDocument = useCallback(async (file: File) => {
    if (!resolvedTenantId) return;
    setUploadingDoc(true);
    try {
      await tenantService.uploadLegalDocument(file, String(resolvedTenantId));
      toast.success(t('settings.companyProfile.docUploadedOk', { defaultValue: 'Documento subido correctamente' }));
      // Refresh document list
      const res = (await tenantService.findById(String(resolvedTenantId))) as TenantResponse;
      if (Array.isArray(res.legalDocuments)) {
        setCompanyDocuments(
          res.legalDocuments.map((doc: TenantLegalDoc) => ({
            id: doc.id,
            name: doc.name,
            url: doc.downloadUrl || doc.publicUrl || '',
            type: doc.type || doc.mimeType || '',
          }))
        );
      }
    } catch (err) {
      toast.error(t('settings.companyProfile.docUploadError', { defaultValue: 'Error al subir documento: ' }) + ((err as { message?: string })?.message || ''));
    } finally {
      setUploadingDoc(false);
    }
  }, [resolvedTenantId]);

  // Handler to delete a document (future implementation)
  const handleDeleteDocument = useCallback(async (id: string) => {
    // TODO: Implement backend endpoint and logic for deleting a document
    toast.info(t('settings.companyProfile.deletePending', { defaultValue: 'Funcionalidad de eliminación pendiente' }));
  }, []);

  // If there's no tenant assigned, force admins to create one
  if (!resolvedTenantId) {
    if (isAdmin) {
      return (
        <>
          <EmptyState
            icon={<Building2 />}
            title={t('settings.companyProfile.noCompanyTitle', { defaultValue: 'Todavía no hay una empresa' })}
            description={t('settings.companyProfile.noCompanyDesc', { defaultValue: 'Aún no tienes una empresa asignada. Crea una para continuar configurando su información.' })}
            action={
              /* Opens the real join/create flow — the old navigate('/tenant/create')
                 pointed at a route that doesn't exist (dead-end 404). */
              <Button variant="brand" onClick={() => setCreateCompanyOpen(true)}>
                {t('settings.companyProfile.createCompany', { defaultValue: 'Crear empresa' })}
              </Button>
            }
          />
          <TenantJoinModal open={createCompanyOpen} onOpenChange={setCreateCompanyOpen} />
        </>
      );
    }
  }

  // ── Identificador fiscal, según el país de la empresa ──────────────────────
  // Esto medía a todo el mundo con la vara ecuatoriana: exigía exactamente 13
  // dígitos y el campo tenía maxLength=13, así que un CNPJ brasileño (14) o un
  // GSTIN indio (15) NO CABÍAN en el campo. La regla la pone ahora
  // `validateTaxNumberForCountry`, que es el mismo espejo del backend.
  // Nombre corto del documento (RUC, RFC, NIT…), para el aviso y el marcador.
  const docFiscal = taxIdLabelFor(form.country)
    || t('settings.companyProfile.taxIdGenericLabel', { defaultValue: 'Identificación fiscal' });
  // Ecuador conserva en la etiqueta el nombre largo, ya traducido a los 9 idiomas.
  const etiquetaFiscal = resolveCountryCode(form.country) === 'EC'
    ? t('settings.companyProfile.rucLabel', { defaultValue: 'RUC (Registro Único de Contribuyentes)' })
    : docFiscal;
  const ayudaFiscal = (() => {
    switch (resolveCountryCode(form.country)) {
      case 'EC': return t('settings.companyProfile.thirteenDigits', { defaultValue: '13 dígitos.' });
      case 'MX': return t('settings.companyProfile.taxIdHintMX', { defaultValue: '12 caracteres (empresa) o 13 (persona): letras, fecha y homoclave.' });
      case 'CO': return t('settings.companyProfile.taxIdHintCO', { defaultValue: 'De 8 a 10 dígitos, con dígito de verificación opcional.' });
      case 'PE': return t('settings.companyProfile.taxIdHintPE', { defaultValue: '11 dígitos que empiezan por 10, 15, 17 o 20.' });
      default: return t('settings.companyProfile.taxIdHintGeneric', { defaultValue: 'Entre 5 y 20 letras o números.' });
    }
  })();

  return (
    <form onSubmit={onSubmit}>
      <Stagger className="space-y-6">
        {!canEdit && (
          <div
            className="glass-flat flex items-start gap-3 p-4"
            style={{ borderColor: 'color-mix(in oklab, var(--warn) 32%, transparent)' }}
          >
            <IconTile tone="warn" size="sm"><Lock /></IconTile>
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {t('settings.companyProfile.readOnlyNotice', { defaultValue: 'Estás viendo la información en modo lectura. Sólo los administradores pueden modificar los datos de la empresa.' })}
            </p>
          </div>
        )}

        {/* ── Identidad ───────────────────────────────────────────────── */}
        <Section title={t('settings.companyProfile.sectionIdentity', { defaultValue: 'Identidad' })} icon={<Building2 />} contentClassName="space-y-5">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-5">
            <div className="relative shrink-0">
              <div
                className="glass-sunken grid h-24 w-24 place-items-center overflow-hidden"
                style={{ borderStyle: 'dashed', borderColor: 'var(--hairline)', borderRadius: 'var(--r-lg)' }}
              >
                <SmartImage
                  src={logo}
                  alt={t('settings.companyProfile.companyLogoAlt', { defaultValue: 'Logo de la empresa' })}
                  rounded="rounded-none"
                  className="h-full w-full"
                  fallback={<Building2 className="h-9 w-9" style={{ color: 'var(--ink-faint)' }} />}
                />
              </div>
              <label
                htmlFor="logo"
                className={`absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border [&_svg]:size-4 ${!canEdit ? 'pointer-events-none cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                style={{
                  background: 'var(--brand)',
                  borderColor: 'var(--brand-line)',
                  color: 'var(--brand-ink)',
                  boxShadow: 'var(--lift-2)',
                }}
                aria-label={t('settings.companyProfile.changeLogoAria', { defaultValue: 'Cambiar el logo de la empresa' })}
              >
                <Camera />
              </label>
              <input id="logo" type="file" accept="image/*" className="hidden" onChange={onPickLogo} disabled={!canEdit} />
            </div>
            <div className="text-center sm:text-left">
              <div className="text-sm font-semibold">{t('settings.companyProfile.companyLogoLabel', { defaultValue: 'Logo de la empresa' })}</div>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
                {uploadingLogo
                  ? t('settings.companyProfile.logoUploading', { defaultValue: 'Subiendo el logo…' })
                  : t('settings.companyProfile.logoHint', { defaultValue: 'Aparece en la barra lateral, en los informes y en los correos que envías. Se guarda al elegirlo.' })}
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('settings.companyProfile.companyNameLabel', { defaultValue: 'Nombre de la empresa*' })}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                disabled={!canEdit}
                placeholder={t('settings.companyProfile.namePlaceholder', { defaultValue: 'Nombre' })}
              />
            </div>

            <div className="space-y-2">
              <Label>{etiquetaFiscal}</Label>
              <Input
                value={form.ruc}
                onChange={(e) => setForm((s) => ({ ...s, ruc: e.target.value }))}
                onBlur={(e) => {
                  const v = ((e.target as HTMLInputElement).value || '').trim();
                  if (v && !validateTaxNumberForCountry(v, form.country)) {
                    toast.error(t('settings.companyProfile.taxIdInvalid', {
                      defaultValue: 'El {{doc}} no tiene un formato válido. {{ayuda}}',
                      doc: docFiscal,
                      ayuda: ayudaFiscal,
                    }));
                  }
                }}
                placeholder={t('settings.companyProfile.taxIdPlaceholder', {
                  defaultValue: '{{doc}} de la empresa',
                  doc: docFiscal,
                })}
                maxLength={24}
                disabled={!canEdit}
              />
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{ayudaFiscal}</p>
            </div>

            <div className="space-y-2">
              <Label>{t('settings.companyProfile.websiteLabel', { defaultValue: 'Sitio web' })}</Label>
              <Input
                type="url"
                value={form.website}
                onChange={(e) => setForm((s) => ({ ...s, website: e.target.value }))}
                placeholder={t('settings.companyProfile.websitePlaceholder', { defaultValue: 'https://tu-dominio.com' })}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('settings.companyProfile.licenseLabel', { defaultValue: 'Número de licencia de la empresa' })}</Label>
              <Input
                value={form.license}
                onChange={(e) => setForm((s) => ({ ...s, license: e.target.value }))}
                placeholder={t('settings.companyProfile.licensePlaceholder', { defaultValue: 'Licencia' })}
                disabled={!canEdit}
              />
            </div>
          </div>
        </Section>

        {/* ── Contacto ────────────────────────────────────────────────── */}
        <Section title={t('settings.companyProfile.sectionContact', { defaultValue: 'Contacto' })} icon={<Phone />} contentClassName="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('settings.companyProfile.companyPhoneLabel', { defaultValue: 'Teléfono de la empresa*' })}</Label>
            <CompanyPhoneField value={phoneE164} onChange={setPhoneE164} disabled={!canEdit} />
            {phoneE164 && !isPhoneValid ? (
              <p className="text-xs" style={{ color: 'var(--bad-text)' }}>
                {t('settings.companyProfile.phoneInvalidHint', { defaultValue: 'Número inválido. Usa el formato internacional, por ejemplo +12015550123.' })}
              </p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {t('settings.companyProfile.phoneExample', { defaultValue: 'Ejemplo: {{dialCode}}2015550123', dialCode: country.dialCode })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('settings.companyProfile.companyEmailLabel', { defaultValue: 'Correo electrónico de la empresa' })}</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              placeholder={t('settings.companyProfile.emailPlaceholder', { defaultValue: 'correo@empresa.com' })}
              disabled={!canEdit}
            />
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              {t('settings.companyProfile.emailHint', { defaultValue: 'Es el remitente y el contacto que ven tus clientes.' })}
            </p>
          </div>
        </Section>

        {/* ── Dirección ───────────────────────────────────────────────── */}
        <Section
          title={t('settings.companyProfile.sectionAddress', { defaultValue: 'Dirección' })}
          icon={<MapPin />}
          contentClassName="space-y-5"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddressAutocomplete(!showAddressAutocomplete)}
              disabled={!canEdit}
              className={!canEdit ? 'pointer-events-none opacity-50' : undefined}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {showAddressAutocomplete ? t('settings.companyProfile.writeByHand', { defaultValue: 'Escribir a mano' }) : t('settings.companyProfile.backToSearch', { defaultValue: 'Volver a la búsqueda' })}
            </Button>
          }
        >
          {showAddressAutocomplete && canEdit ? (
            <div style={{ position: 'relative', zIndex: 0 }}>
              <AddressAutocomplete
                onAddressSelect={(addressData: AddressComponents) => {
                  setForm((s) => ({
                    ...s,
                    address: addressData.address,
                    city: addressData.city,
                    postalCode: addressData.postalCode,
                    country: addressData.country,
                    latitude: String(addressData.latitude),
                    longitude: String(addressData.longitude),
                  }));
                  toast.success(t('settings.companyProfile.addressAutofilled', { defaultValue: 'Dirección completada automáticamente' }));
                }}
                defaultValue={form.address || ''}
                initialLat={form.latitude && !isNaN(Number(form.latitude)) ? Number(form.latitude) : undefined}
                initialLng={form.longitude && !isNaN(Number(form.longitude)) ? Number(form.longitude) : undefined}
                openWithQuery={autocompleteOpenQuery}
                placeholder={t('settings.companyProfile.searchAddressPlaceholder', { defaultValue: 'Buscar dirección...' })}
                // Mostrar mapa integrado como fuente única de ubicación
                showMap={true}
                mapHeight="320px"
              />
            </div>
          ) : null}

          {/* Mostrar el mapa solo si el usuario puede editar. Si no hay lat/lng usar coordenadas por defecto de Ecuador */}
          {canEdit && !showAddressAutocomplete && (
            <div style={{ position: 'relative', zIndex: 0 }}>
              {(() => {
                const defaultLat = -1.831239; // centro aproximado de Ecuador
                const defaultLng = -78.183406;
                const latVal = form.latitude && !isNaN(Number(form.latitude)) ? Number(form.latitude) : defaultLat;
                const lngVal = form.longitude && !isNaN(Number(form.longitude)) ? Number(form.longitude) : defaultLng;
                return (
                  <GoogleMapEmbed
                    lat={latVal}
                    lng={lngVal}
                    zoom={form.latitude && form.longitude ? 17 : 6}
                    height="320px"
                    draggable={true}
                    onMarkerMove={(lat, lng, address, addressDetails) => {
                      setForm((s) => ({
                        ...s,
                        latitude: String(lat),
                        longitude: String(lng),
                        address: address || s.address,
                        city: (addressDetails && (addressDetails.locality || addressDetails.administrative_area_level_2 || addressDetails.administrative_area_level_1)) || s.city,
                        postalCode: (addressDetails && addressDetails.postal_code) || s.postalCode,
                        country: (addressDetails && addressDetails.country) || s.country,
                      }));
                    }}
                  />
                );
              })()}
            </div>
          )}

          <div style={{ position: 'relative', zIndex: 2000 }}>
            {showAddressAutocomplete && canEdit && (
              <p className="mb-3 flex items-center gap-2 text-xs" style={{ color: 'var(--ink-faint)' }}>
                <Lock className="h-3.5 w-3.5" />
                {t('settings.companyProfile.autofillNotice', { defaultValue: 'Los campos de abajo se completan solos con la búsqueda. Pulsa «Escribir a mano» para editarlos.' })}
              </p>
            )}

            <div className={showAddressAutocomplete && canEdit ? 'pointer-events-none opacity-60' : ''}>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>{t('settings.companyProfile.mainAddressLabel', { defaultValue: 'Dirección principal' })}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.address}
                      onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                      placeholder={t('settings.companyProfile.addressPlaceholder', { defaultValue: 'Dirección' })}
                      disabled={!canEdit || showAddressAutocomplete}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      title={t('settings.companyProfile.searchAutocompleteTitle', { defaultValue: 'Buscar con autocompletado' })}
                      onClick={() => {
                        setAutocompleteOpenQuery(form.address || '');
                        setShowAddressAutocomplete(true);
                      }}
                      disabled={!canEdit}
                      className="shrink-0"
                    >
                      <Search className="mr-2 h-4 w-4" />
                      {t('settings.companyProfile.searchBtn', { defaultValue: 'Buscar' })}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t('settings.companyProfile.postalCodeLabel', { defaultValue: 'Código postal' })}</Label>
                    <Input
                      value={form.postalCode}
                      onChange={(e) => setForm((s) => ({ ...s, postalCode: e.target.value }))}
                      placeholder={t('settings.companyProfile.postalCodePlaceholder', { defaultValue: 'Código postal' })}
                      disabled={!canEdit || showAddressAutocomplete}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t('settings.companyProfile.cityLabel', { defaultValue: 'Ciudad' })}</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
                      placeholder={t('settings.companyProfile.cityPlaceholder', { defaultValue: 'Ciudad' })}
                      disabled={!canEdit || showAddressAutocomplete}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t('settings.companyProfile.countryLabel', { defaultValue: 'País' })}</Label>
                    <Input
                      value={form.country}
                      onChange={(e) => setForm((s) => ({ ...s, country: e.target.value }))}
                      placeholder={t('settings.companyProfile.countryPlaceholder', { defaultValue: 'País' })}
                      disabled={!canEdit || showAddressAutocomplete}
                    />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('settings.companyProfile.latitudeLabel', { defaultValue: 'Latitud' })}</Label>
                    <Input
                      value={form.latitude}
                      onChange={(e) => setForm((s) => ({ ...s, latitude: e.target.value }))}
                      placeholder={t('settings.companyProfile.latitudePlaceholder', { defaultValue: '-90 a 90' })}
                      disabled={!canEdit || showAddressAutocomplete}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t('settings.companyProfile.longitudeLabel', { defaultValue: 'Longitud' })}</Label>
                    <Input
                      value={form.longitude}
                      onChange={(e) => setForm((s) => ({ ...s, longitude: e.target.value }))}
                      placeholder={t('settings.companyProfile.longitudePlaceholder', { defaultValue: '-180 a 180' })}
                      disabled={!canEdit || showAddressAutocomplete}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('settings.companyProfile.addressLine2Label', { defaultValue: 'Dirección complementaria' })}</Label>
            <Input
              value={form.addressLine2}
              onChange={(e) => setForm((s) => ({ ...s, addressLine2: e.target.value }))}
              placeholder={t('settings.companyProfile.addressLine2Placeholder', { defaultValue: 'Opcional — edificio, piso, referencia' })}
              disabled={!canEdit}
            />
          </div>
        </Section>

        {/* ── Preferencias ────────────────────────────────────────────── */}
        <Section title={t('settings.companyProfile.sectionPreferences', { defaultValue: 'Preferencias' })} icon={<Clock />} contentClassName="space-y-2">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('settings.companyProfile.timezoneLabel', { defaultValue: 'Zona horaria' })}</Label>
              <Combobox
                value={form.timezone}
                onChange={(v) => setForm((s) => ({ ...s, timezone: v }))}
                options={timezoneOptions(form.timezone)}
                disabled={!canEdit}
                placeholder={t('settings.companyProfile.timezonePlaceholder', { defaultValue: 'Seleccionar zona horaria' })}
                empty={t('settings.companyProfile.timezoneEmpty', { defaultValue: 'Ninguna zona coincide con esa búsqueda.' })}
                aria-label={t('settings.companyProfile.timezoneLabel', { defaultValue: 'Zona horaria' })}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const porPais = tzForCountry(form.country);
                    const tz = porPais || browserTimezone();
                    setForm((s) => ({ ...s, timezone: tz }));
                    if (porPais) {
                      toast.success(t('settings.companyProfile.tzDetected', { defaultValue: 'Zona horaria detectada por la dirección: {{tz}}', tz }));
                    } else {
                      toast.info(t('settings.companyProfile.tzFromDevice', { defaultValue: 'Se aplicó la zona horaria de este equipo: {{tz}}. Si tu empresa opera en otra, elígela en la lista.', tz }));
                    }
                  }}
                  className="cg-focus inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold hover:underline"
                  style={{ color: 'var(--brand-text)' }}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {t('settings.companyProfile.detectByAddress', { defaultValue: 'Detectar por la dirección' })}
                </button>
              )}
            </div>

            <div
              className="glass-sunken p-4 text-xs leading-relaxed"
              style={{ color: 'var(--ink-soft)' }}
            >
              {t('settings.companyProfile.timezoneTruthPrefix', { defaultValue: 'La zona horaria es la ' })}
              <strong style={{ color: 'var(--ink)' }}>{t('settings.companyProfile.timezoneTruthEmphasis', { defaultValue: 'única fuente de verdad' })}</strong>
              {t('settings.companyProfile.timezoneTruthSuffix', { defaultValue: ' para los horarios: determina cómo se muestran y calculan turnos, registros e informes — para todos (administradores y vigilantes), sin importar la zona del dispositivo.' })}
            </div>
          </div>
        </Section>

        <CompanyDocumentsSection
          documents={companyDocuments}
          onUpload={handleUploadDocument}
          onDelete={handleDeleteDocument}
          canEdit={canEdit && !uploadingDoc}
        />

        <div className="flex justify-end">
          <Button
            variant="brand"
            type="submit"
            className="px-6"
            disabled={!canEdit}
            title={!canEdit ? t('settings.companyProfile.saveAdminOnlyTitle', { defaultValue: 'Sólo los administradores pueden guardar cambios' }) : undefined}
          >
            {t('settings.companyProfile.saveBtn', { defaultValue: 'Guardar' })}
          </Button>
        </div>
      </Stagger>
    </form>
  );
}
