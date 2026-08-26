import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/phone/PhoneInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Edit, Search } from 'lucide-react';
import tenantService from "@/services/tenant.service";
import AddressAutocomplete, { AddressComponents } from "@/components/maps/AddressAutocomplete";
import { AuthService } from "@/services/auth/authService";
import { setTenantId as setClientTenantId } from "@/lib/api/clientService";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from 'react-i18next';
import { validateTaxNumberForCountry, validatePhoneForCountry, digitsOnly } from '@/lib/validators/id';

export default function TenantJoinModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const [mode, setMode] = useState<'join' | 'create'>('join');
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const { signInWithToken, user, loading: authLoading } = useAuth();
    const { t } = useTranslation();
    const DRAFT_KEY = 'tenantCreateFormDraft_v1';
    const reopenDelayMs = 25 * 1000; // 25 seconds
    const suppressReopen = useRef(false as boolean);
    const reopenTimer = useRef<number | null>(null);
    const logoInputRef = useRef<HTMLInputElement | null>(null);
    const AUTO_OPEN_KEY = 'tenantModalAutoOpen';
    // El borrador y el auto-open siempre están activos por defecto
    const [autoOpen, setAutoOpen] = useState<boolean>(true);
    // Start closed to avoid a flash while auth/profile loads. We'll decide
    // whether to open after authLoading is false to prevent microsecond flashes.
    const [internalOpen, setInternalOpen] = useState<boolean>(false);

    // Defensive helper: detect superadmin presence in profile or persisted flag
    const userIsSuperAdmin = (u: any) => {
        try {
            // quick check from persisted admin flag
            const cached = typeof window !== 'undefined' ? localStorage.getItem('userIsAdmin') : null;
            if (cached === 'true') return true;
        } catch (e) {}
        if (!u) return false;
        const normalize = (r: any) => {
            if (!r) return [];
            if (Array.isArray(r)) return r.map((it) => (typeof it === 'string' ? it : (it?.name || it?.key || it?.slug || ''))).filter(Boolean);
            if (typeof r === 'string') return [r];
            return [];
        };
        const global = normalize(u.roles ?? u.role ?? []);
        const tenantsArr = Array.isArray(u.tenants) ? u.tenants.flatMap((t: any) => normalize(t.roles ?? t.role ?? [])) : [];
        const singleTenant = u.tenant ? normalize(u.tenant.roles ?? u.tenant.role ?? []) : [];
        const all = [...global, ...tenantsArr, ...singleTenant].map((s) => (s || '').toString().toLowerCase());
        return all.some((n) => n.includes('superadmin'));
    };

    // helper to detect tenant presence in various profile shapes
    const profileHasTenant = (u: any) => {
        if (!u) return false;
        if (u.tenant) return Boolean(u.tenant.tenantId || u.tenant.id || (u.tenant.tenant && (u.tenant.tenant.id || u.tenant.tenantId)));
        if (Array.isArray(u.tenants) && u.tenants.length > 0) {
            return u.tenants.some((t: any) => Boolean(t.tenantId || (t.tenant && (t.tenant.id || t.tenant.tenantId))));
        }
        return false;
    };

    useEffect(() => {
        // Avoid opening modal until auth/profile is loaded to prevent a flash.
        // Read draft/auto-open preferences but only act when `authLoading` is false.
        try {
            if (authLoading) return; // wait until auth/profile ready

            const pref = localStorage.getItem(AUTO_OPEN_KEY);
            const auto = pref === null ? true : pref === 'true';
            const draft = Boolean(localStorage.getItem(DRAFT_KEY));

            // If parent requested open, respect it but close immediately if
            // user already has tenant or is superadmin.
            if (open) {
                if (profileHasTenant(user) || userIsSuperAdmin(user)) {
                    try { suppressReopen.current = true; } catch {}
                    try { setInternalOpen(false); } catch {}
                    try { onOpenChange(false); } catch {}
                    return;
                }
                // show 'create' tab if a draft exists
                setMode(draft ? 'create' : 'join');
                setToken('');
                setInternalOpen(true);
                return;
            }

            // If parent didn't open but we have a draft + autoOpen preference,
            // and user lacks tenant, open modal on mount.
            if (auto && draft && !profileHasTenant(user) && !userIsSuperAdmin(user)) {
                setMode('create');
                setInternalOpen(true);
                return;
            }

            // Otherwise ensure modal is closed
            setInternalOpen(false);
        } catch (e) {
            // If anything goes wrong, keep modal closed to avoid flashing it.
            setInternalOpen(false);
        }
    }, [open, user, authLoading]);

    // Ensure modal is closed whenever the authenticated user becomes a superadmin
    // or gains a tenant, even if the modal was opened via draft/auto-open preference.
    useEffect(() => {
        if (authLoading) return;
        if (user && (profileHasTenant(user) || userIsSuperAdmin(user))) {
            try { suppressReopen.current = true; } catch {}
            try { setInternalOpen(false); } catch {}
            try { onOpenChange(false); } catch {}
        }
    }, [user, authLoading]);

    const handleAccept = async () => {
            if (!token) {
            toast.error(t('tenantJoinModal.invitationPlaceholder'));
            return;
        }
        setLoading(true);
        try {
            const resp: any = await tenantService.acceptInvitation(token);
            const tenantId = resp?.tenantId || resp?.data?.tenantId || resp?.data?.id || resp?.id;
            if (tenantId) {
                try { setClientTenantId(String(tenantId)); } catch (e) { }
                try { localStorage.setItem('tenantId', String(tenantId)); } catch { }
            }
            // Refresh profile until backend reflects the new tenant assignment.
            await refreshProfileAndSignIn();
            toast.success('Invitación aceptada. Ya estás vinculado a la empresa');
            // prevent scheduled reopen when closing after successful accept
            try { suppressReopen.current = true; } catch {}
            onOpenChange(false);
            // Give UI a moment to update, then reload so the app fully recognizes tenantId
            try { setTimeout(() => window.location.reload(), 300); } catch {}
        } catch (err: any) {
            toast.error(err?.message || 'No se pudo aceptar la invitación');
        } finally {
            setLoading(false);
        }
    };

        // After accept/create we need to refresh the authenticated user's profile
        // because the backend may not have propagated the tenant->user relationship
        // to the /auth/me endpoint immediately. Retry briefly until the profile
        // shows a tenant for this user, then hydrate the Auth context via
        // `signInWithToken(token, userData)` so UI updates without a manual reload.
        const refreshProfileAndSignIn = async () => {
            const token = localStorage.getItem('authToken') || '';
            const maxAttempts = 6;
            const delayMs = 500;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    const profile = await AuthService.getProfile();
                    // detect a tenant in the profile (tenant or tenants array)
                    const tenantPresent = Boolean(
                        (profile && profile.tenant && (profile.tenant.tenantId || (profile.tenant.tenant && profile.tenant.tenant.id))) ||
                        (Array.isArray(profile.tenants) && profile.tenants.length > 0 && (
                            profile.tenants.some((t: any) => Boolean(t.tenantId || (t.tenant && (t.tenant.id || t.tenant.tenantId))))
                        ))
                    );

                    if (tenantPresent) {
                        // hydrate AuthContext with the fresh profile
                        try { await signInWithToken(token, profile); } catch { /* ignore */ }
                        return;
                    }
                } catch (e) {
                    // ignore and retry
                }

                // wait before next attempt
                await new Promise((r) => setTimeout(r, delayMs));
            }

            // final fallback: call signInWithToken without userData (will fetch once)
            try { await signInWithToken(token); } catch (e) { /* ignore */ }
        };

    // Minimal create form state (expanded to match tenants table)
    const EMPTY_FORM = {
        name: '',
        address: '',
        addressLine2: '',
        city: '',
        postalCode: '',
        country: '',
        // phoneCountry set from PhoneInput (country code or name)
        phoneCountry: '',
        latitude: '',
        longitude: '',
        phone: '',
        landline: '',
        email: '',
        website: '',
        taxNumber: '',
        businessTitle: '',
    };
    const [form, setForm] = useState<any>({ ...EMPTY_FORM });
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [taxError, setTaxError] = useState<string | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [websiteError, setWebsiteError] = useState<string | null>(null);
    const [landlineCountry, setLandlineCountry] = useState<string>('EC');
    const [landlineError, setLandlineError] = useState<string | null>(null);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoError, setLogoError] = useState<string | null>(null);
    // Validación de teléfono fijo
    const getLandlineErrorMessage = (landline: string | undefined, country?: string) => {
        const p = (landline || '').toString().trim();
        if (!p) return null; // opcional
        // PhoneInput entrega el número en formato internacional: +593 2 3456789
        // Queremos validar que la parte local (sin código país) tenga 7 dígitos
        let d = digitsOnly(p);
        const c = (country || '').toString().toLowerCase();

        // Detectar y quitar código de país
        if (c === 'ec' || c === 'ecuador' || d.startsWith('593')) {
            if (d.startsWith('593')) d = d.slice(3);
            // Si empieza con 0, quitarlo (caso nacional)
            if (d.startsWith('0')) d = d.slice(1);
            if (d.length !== 7) return 'El teléfono fijo ecuatoriano debe tener 7 dígitos (sin incluir el código de país).';
            if (!/^[2-7]/.test(d)) return 'El teléfono fijo ecuatoriano debe comenzar con un dígito entre 2 y 7.';
            return null;
        }
        // Fallback genérico: 5-12 dígitos (sin código país)
        // Detectar y quitar códigos de país comunes
        const paises = [
            { code: '51', len: 2 }, // Perú
            { code: '57', len: 2 }, // Colombia
            { code: '52', len: 2 }, // México
            { code: '54', len: 2 }, // Argentina
            { code: '56', len: 2 }, // Chile
            { code: '1', len: 1 },  // USA
        ];
        for (const pais of paises) {
            if (d.startsWith(pais.code)) {
                d = d.slice(pais.len);
                break;
            }
        }
        if (d.length < 5 || d.length > 12) return 'Número de teléfono fijo inválido.';
        return null;
    };
    // Live-validate landline as user types or country changes
    useEffect(() => {
        if (!form.landline) {
            setLandlineError(null);
            return;
        }
        const msg = getLandlineErrorMessage(form.landline, landlineCountry);
        setLandlineError(msg);
    }, [form.landline, landlineCountry]);

    // Return a localized, specific error message for phone validation or null if valid
    const getPhoneErrorMessage = (phone: string | undefined, country?: string) => {
        const p = (phone || '').toString().trim();
        if (!p) return null;
        const d = digitsOnly(p);
        const c = (country || '').toString().toLowerCase();

        const isEcuador = c.includes('ec') || c.includes('ecuador') || d.startsWith('593');
        if (isEcuador) {
            // Normalize local part
            let local = d;
            if (local.startsWith('593')) local = local.slice(3);
            // If starts with 0 -> expect 10 digits starting with 09
            if (local.startsWith('0')) {
                if (!(local.length === 10 && local.startsWith('09'))) {
                    return 'El celular debe tener 10 dígitos y comenzar con 09.';
                }
                return null;
            }
            // otherwise expect 9 digits starting with 9
            if (!(local.length === 9 && local.startsWith('9'))) {
                return 'El celular debe tener 9 dígitos y comenzar con 9.';
            }
            return null;
        }

        // generic fallback: require 7-15 digits
        if (d.length < 7 || d.length > 15) return 'Número de teléfono inválido.';
        return null;
    };
    // Return a localized, specific error message for tax/ID numbers
    const getTaxErrorMessage = (tax: string | undefined, country?: string) => {
        const v = (tax || '').toString().trim();
        if (!v) return null;
        const d = digitsOnly(v);
        const c = (country || '').toString().toLowerCase();

        // Ecuador: handle cédula vs RUC cases
        if (c.includes('ec') || c.includes('ecuador') || d.startsWith('593')) {
            // If the number corresponds to a RUC-like length (>10), require it to end in 001
            if (d.length > 10) {
                if (!d.endsWith('001')) {
                    return 'Si tiene más de 10 dígitos, el RUC ecuatoriano debe terminar en 001.';
                }
                if (d.length !== 13) {
                    return 'El RUC ecuatoriano debe tener 13 dígitos.';
                }
                // full RUC shape present, validate with validator helper
                if (!validateTaxNumberForCountry(v, 'EC')) {
                    return 'RUC inválido: verifique la cédula base y los dígitos (debe terminar en 001).';
                }
                return null;
            }

            // Otherwise treat as cédula (10 dígitos). Validate cedula base.
            if (d.length !== 10) return 'Cédula ecuatoriana inválida: debe tener 10 dígitos.';
            if (!validateTaxNumberForCountry(v, 'EC')) return 'Cédula ecuatoriana inválida.';
            return null;
        }

        // Ecuador: basic checks for RUC (13 dígitos termina en 001) y cédula (10 dígitos)
        if (c.includes('ec') || c.includes('ecuador')) {
            const digits = digitsOnly(v);
            // RUC-like: more than 10 digits -> expect 13 and end with 001
            if (digits.length > 10) {
                if (!digits.endsWith('001')) return 'Si tiene más de 10 dígitos, el RUC ecuatoriano debe terminar en 001.';
                if (digits.length !== 13) return 'El RUC ecuatoriano debe tener 13 dígitos.';
                if (!validateTaxNumberForCountry(v, 'EC')) return 'RUC inválido: verifique la cédula base y los dígitos (debe terminar en 001).';
                return null;
            }

            // Cédula: expect 10 digits
            if (digits.length === 10) {
                if (!validateTaxNumberForCountry(v, 'EC')) return 'Cédula ecuatoriana inválida.';
                return null;
            }

            return 'Número de identificación inválido para Ecuador.';
        }

        // Fallback generic message
        if (!validateTaxNumberForCountry(v, country)) return 'Número de identificación inválido, debe tener 13 dígitos (001).';
        return null;
    };

    const getEmailErrorMessage = (email: string | undefined) => {
        const v = (email || '').toString().trim();
        if (!v) return null;
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(v)) return 'Correo electrónico inválido. Ej: nombre@dominio.com';
        return null;
    };

    const getWebsiteErrorMessage = (website: string | undefined) => {
        const v = (website || '').toString().trim();
        if (!v) return null;
        try {
            const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
            const u = new URL(normalized);
            if (!u.hostname || !u.hostname.includes('.')) {
                return 'Sitio web inválido. Ej: empresa.com';
            }
            return null;
        } catch {
            return 'Sitio web inválido. Ej: empresa.com';
        }
    };
    const [showAddressAutocomplete, setShowAddressAutocomplete] = useState(true);
    const [autocompleteOpenQuery, setAutocompleteOpenQuery] = useState('');

    const clearDraft = () => {
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
        try { setForm({ ...EMPTY_FORM }); } catch (e) {}
        try { setPhoneError(null); setTaxError(null); setEmailError(null); setWebsiteError(null); } catch (e) {}
        try { setLogoFile(null); setLogoError(null); } catch (e) {}
        try { if (logoInputRef.current) logoInputRef.current.value = ''; } catch (e) {}
    };

    // Live-validate phone as user types or country changes
    useEffect(() => {
        const pd = digitsOnly(form.phone || '');
        let pc = form.country || form.phoneCountry || undefined;
        if (pd.startsWith('593')) pc = 'EC';
        if (!form.phone) {
            setPhoneError(null);
            return;
        }
        const phoneMsg = getPhoneErrorMessage(form.phone, pc);
        setPhoneError(phoneMsg);
    }, [form.phone, form.country, form.phoneCountry, t]);

    // Persist draft to localStorage whenever the form changes (en tiempo real)
    useEffect(() => {
        const isEmpty = Object.values(form).every(v => v === '' || v == null);
        if (isEmpty) return;
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        } catch (e) {
            // ignore storage errors
        }
    }, [form]);

    // El switch y la preferencia quedan siempre activos, no se muestra más el control

    // Restore draft when the modal opens (internalOpen === true)
    // Restore draft when the modal opens (internalOpen === true)
    useEffect(() => {
        if (!internalOpen) return;
        // Solo restaurar si el formulario está vacío
        const isEmpty = Object.values(form).every(v => v === '' || v == null);
        if (!isEmpty) return;
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    setForm({ ...EMPTY_FORM, ...parsed });
                }
            }
        } catch (e) {
            // ignore parse errors
        }
    }, [internalOpen]);

    // Live-validate tax number
    useEffect(() => {
        const td = digitsOnly(form.taxNumber || '');
        let tc = form.country || undefined;
        if (td.length === 13 && td.endsWith('001')) tc = 'EC';
        if (!form.taxNumber) {
            setTaxError(null);
            return;
        }
        const taxMsg = getTaxErrorMessage(form.taxNumber, tc);
        setTaxError(taxMsg);
    }, [form.taxNumber, form.country, t]);

    // Live-validate email
    useEffect(() => {
        if (!form.email) {
            setEmailError(null);
            return;
        }
        setEmailError(getEmailErrorMessage(form.email));
    }, [form.email]);

    // Live-validate website
    useEffect(() => {
        if (!form.website) {
            setWebsiteError(null);
            return;
        }
        setWebsiteError(getWebsiteErrorMessage(form.website));
    }, [form.website]);

    const handleLogoChange = (file?: File | null) => {
        if (!file) {
            setLogoFile(null);
            setLogoError(null);
            return;
        }

        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
        if (!allowed.includes(file.type)) {
            setLogoFile(null);
            setLogoError('El logo debe ser PNG, JPG, SVG o WEBP.');
            return;
        }

        const maxBytes = 5 * 1024 * 1024;
        if (file.size > maxBytes) {
            setLogoFile(null);
            setLogoError('El logo no debe superar 5MB.');
            return;
        }

        setLogoFile(file);
        setLogoError(null);
    };

        const handleCreate = async () => {
            // Validaciones según especificación del cliente

            if (!form.name || !form.email || !form.phone || !form.address) {
            toast.error(t('tenantValidations.required_fields'));
            return;
        }

        // name: min6 max30
        if ((form.name || '').trim().length < 6 || (form.name || '').trim().length > 30) {
            toast.error(t('tenantValidations.name_length'));
            return;
        }

        // email: basic validation
        const emailMsg = getEmailErrorMessage(form.email);
        if (emailMsg) {
            setEmailError(emailMsg);
            return;
        } else {
            setEmailError(null);
        }

        const websiteMsg = getWebsiteErrorMessage(form.website);
        if (websiteMsg) {
            setWebsiteError(websiteMsg);
            return;
        } else {
            setWebsiteError(null);
        }

        // celular: validar en base al país (usa país de dirección; si no, usa selector de teléfono)
        // If phone starts with Ecuador dial code, prefer Ecuador validation.
        const phoneDigits = digitsOnly(form.phone || '');
        let phoneCountry = form.country || form.phoneCountry || undefined;
        if (phoneDigits.startsWith('593')) {
            phoneCountry = 'EC';
        }
        const phoneMsg = getPhoneErrorMessage(form.phone, phoneCountry);
        if (phoneMsg) {
            setPhoneError(phoneMsg);
            return;
        } else {
            setPhoneError(null);
        }

        // razón social: max 40 caracteres
        if ((form.businessTitle || '').trim().length > 40) {
            toast.error(t('tenantValidations.business_max'));
            return;
        }

        // tax/RUC: validar en base al país. If the tax number matches Ecuador pattern
        // (13 digits and ends with 001) validate as Ecuador regardless of address country.
        const taxDigits = digitsOnly(form.taxNumber || '');
        let taxCountry = form.country || undefined;
        if (taxDigits.length === 13 && taxDigits.endsWith('001')) {
            taxCountry = 'EC';
        }
        const taxMsg = getTaxErrorMessage(form.taxNumber, taxCountry);
        if (taxMsg) {
            setTaxError(taxMsg);
            return;
        } else {
            setTaxError(null);
        }

        // landline optional: validar según país
        const landlineMsg = getLandlineErrorMessage(form.landline, landlineCountry);
        if (landlineMsg) {
            setLandlineError(landlineMsg);
            toast.error(landlineMsg);
            return;
        } else {
            setLandlineError(null);
        }

        setLoading(true);
        try {
            // Build payload matching tenant model
            const payload: any = {
                name: form.name,
                    address: form.address || undefined,
                    addressLine2: form.addressLine2 || undefined,
                    city: form.city || undefined,
                    postalCode: form.postalCode || undefined,
                    country: form.country || undefined,
                    latitude: form.latitude && form.latitude !== '' ? parseFloat(form.latitude) : undefined,
                    longitude: form.longitude && form.longitude !== '' ? parseFloat(form.longitude) : undefined,
                    phone: form.phone || undefined,
                    landline: form.landline || undefined,
                    email: form.email || undefined,
                    website: (form.website || '').trim() || undefined,
                // Provide defaults for required tenant fields to avoid DB validation errors
                // Use a temporary placeholder for taxNumber if user didn't provide one
                taxNumber: (form.taxNumber && String(form.taxNumber).trim()) || 'PENDING',
                businessTitle: (form.businessTitle && String(form.businessTitle).trim()) || form.name || 'Empresa',
            };

            // If logo file provided, attempt basic upload flow: POST /tenant/file or similar not implemented here.
            // For now, we send logoId if provided; advanced upload should be implemented separately.

            const resp: any = await tenantService.create(payload);
            const tenantId = resp?.id || resp?.data?.id || resp?.tenantId || resp?.data?.tenantId;
            if (tenantId) {
                try { setClientTenantId(String(tenantId)); } catch (e) { }
                try { localStorage.setItem('tenantId', String(tenantId)); } catch (e) { }

                if (logoFile) {
                    try {
                        await tenantService.uploadLogo(logoFile, String(tenantId));
                    } catch (uploadErr: any) {
                        toast.error(uploadErr?.message || 'Empresa creada, pero no se pudo subir el logo');
                    }
                }
            }
            // Refresh profile until backend reflects the new tenant assignment.
            await refreshProfileAndSignIn();
            toast.success('Empresa creada y vinculada correctamente');
            // prevent scheduled reopen when closing after successful create
            try { suppressReopen.current = true; } catch {}
            onOpenChange(false);
            // clear saved draft after successful create
            try { localStorage.removeItem(DRAFT_KEY); } catch (e) { }
            try { setLogoFile(null); setLogoError(null); } catch (e) {}
            // Refresh the page so the frontend picks up the new tenant context
            try { setTimeout(() => window.location.reload(), 300); } catch {}
        } catch (err: any) {
            toast.error(err?.message || 'No se pudo crear la empresa');
        } finally {
            setLoading(false);
        }
    };

    // Close modal without scheduling a reopen (used for Cancel and internal closes)
    const closeWithoutReopen = () => {
        try { suppressReopen.current = true; } catch {}
        // clear any scheduled reopen and close immediately
        if (reopenTimer.current) {
            clearTimeout(reopenTimer.current);
            reopenTimer.current = null;
        }
        try { setInternalOpen(false); } catch {}
        try { onOpenChange(false); } catch {}
    };

    useEffect(() => {
        // When the local modal state closes (internalOpen -> false) and we did not
        // suppress, schedule a reopen after `reopenDelayMs`. Before scheduling
        // we also ensure the current authenticated user still lacks a tenant;
        // otherwise we should not reopen the modal.
        if (!internalOpen) {
            // If the authenticated user already has a tenant, do not schedule reopen
            if (!authLoading && profileHasTenant(user)) {
                try { suppressReopen.current = true; } catch {}
                if (reopenTimer.current) {
                    clearTimeout(reopenTimer.current);
                    reopenTimer.current = null;
                }
                return;
            }

            if (!suppressReopen.current) {
                // schedule reopen
                reopenTimer.current = window.setTimeout(() => {
                    // before reopening, re-check profile to avoid opening for users
                    // who received a tenant in the meantime
                    try {
                        if (!profileHasTenant(user)) {
                            try { setInternalOpen(true); } catch {}
                            try { onOpenChange(true); } catch {}
                        } else {
                            // if tenant present now, suppress future reopens
                            try { suppressReopen.current = true; } catch {}
                        }
                    } catch (e) {
                        try { setInternalOpen(true); } catch {}
                        try { onOpenChange(true); } catch {}
                    }
                }, reopenDelayMs);
            } else {
                // reset the suppress flag for next interactions
                suppressReopen.current = false;
            }
        } else {
            // opened: clear any scheduled reopen
            if (reopenTimer.current) {
                clearTimeout(reopenTimer.current);
                reopenTimer.current = null;
            }
        }

        return () => {
            if (reopenTimer.current) {
                clearTimeout(reopenTimer.current);
                reopenTimer.current = null;
            }
        };
    }, [internalOpen, user, authLoading]);

    // Intercept dialog open/close events so we can suppress the scheduled
    // reopen when the user explicitly closes the dialog (click outside or ESC).
    // Call `onOpenChange(v)` directly to avoid double-calls and only set the
    // suppress flag when `v` is false (closing).
    const handleDialogOpenChange = (v: boolean) => {
        // Do NOT set `suppressReopen` here — clicks on the X or outside
        // should allow the modal to reopen after `reopenDelayMs`.
        try { setInternalOpen(v); } catch {}
        try { onOpenChange(v); } catch {}
    };

    return (
        <Dialog open={internalOpen} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg text-center">{t('tenantJoinModal.title')}</DialogTitle>
                    <DialogDescription>{t('tenantJoinModal.description')}</DialogDescription>
                </DialogHeader>

                <div className="mt-4">
                    <div className="flex gap-3 mb-4">
                        {/* Conmutador de modo. El negro plano de antes no salía de
                            ningún token y no se veía en tema oscuro; ahora es el
                            relleno de marca con tinta `--brand-ink`, que sigue al
                            acento configurado. */}
                        <button
                            className="cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-colors"
                            style={mode === 'join'
                                ? { background: 'var(--brand)', color: 'var(--brand-ink)', boxShadow: '0 0 18px -6px var(--brand-glow)' }
                                : { background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}
                            onClick={() => setMode('join')}>{t('tenantJoinModal.joinButton')}</button>
                        <button
                            className="cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-colors"
                            style={mode === 'create'
                                ? { background: 'var(--brand)', color: 'var(--brand-ink)', boxShadow: '0 0 18px -6px var(--brand-glow)' }
                                : { background: 'transparent', color: 'var(--ink-soft)', border: '1px solid var(--hairline)' }}
                            onClick={() => setMode('create')}>{t('tenantJoinModal.createButton')}</button>
                    </div>

                    {mode === 'join' ? (
                        <div className="grid gap-3">
                            <Input
                                placeholder={t('tenantJoinModal.invitationPlaceholder')}
                                value={token}
                                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setToken('')} disabled={loading}>{t('actions.cancel') || 'Limpiar'}</Button>
                                <Button className="px-8"
                                    onClick={handleAccept} disabled={loading}>{t('tenantJoinModal.joinButton') /* reuse join text */}</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-sm">{t('tenantJoinModal.companyName')}<span className="ml-1" style={{ color: "var(--bad-text)" }}>*</span></label>
                                    <Input value={form.name} onChange={(e) => setForm((s: any) => ({ ...s, name: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">{t("ui.TenantJoinModal.telefonoFijo", "Teléfono fijo")}</label>
                                    <PhoneInput
                                        value={form.landline}
                                        onChange={(v) => setForm((s: any) => ({ ...s, landline: v }))}
                                        onCountryChange={(c: any) => setLandlineCountry(c?.code || c?.name || '')}
                                        placeholder={t("ui.TenantJoinModal.numeroFijo", "Número fijo")}
                                    />
                                    {landlineError && <div className="text-xs mt-1" style={{ color: "var(--bad-text)" }}>{landlineError}</div>}
                                </div>
                                <div>
                                    <label className="text-sm">{t('tenantJoinModal.mobilePhone')}<span className="ml-1" style={{ color: "var(--bad-text)" }}>*</span></label>
                                    <PhoneInput
                                        value={form.phone}
                                        onChange={(v) => setForm((s: any) => ({ ...s, phone: v }))}
                                        onCountryChange={(c: any) => setForm((s: any) => ({ ...s, phoneCountry: c?.code || c?.name || '' }))}
                                        placeholder={t("ui.TenantJoinModal.numeroMovil", "Número móvil")}
                                    />
                                    {phoneError && <p className="text-sm mt-1" style={{ color: "var(--bad-text)" }}>{phoneError}</p>}
                                </div>
                                <div>
                                    <label className="text-sm">Email<span className="ml-1" style={{ color: "var(--bad-text)" }}>*</span></label>
                                    <Input
                                        value={form.email}
                                        onChange={e => setForm((s: any) => ({ ...s, email: e.target.value }))}
                                        placeholder={t('ui.TenantJoinModal.correoEjemploCom')}
                                        type="email"
                                    />
                                    {emailError && <p className="text-sm mt-1" style={{ color: "var(--bad-text)" }}>{emailError}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-sm">{t('tenantJoinModal.website')}</label>
                                    <Input
                                        value={form.website}
                                        onChange={e => setForm((s: any) => ({ ...s, website: e.target.value }))}
                                        placeholder={t('comun.empresaCom')}
                                        type="url"
                                    />
                                    {websiteError && <p className="text-sm mt-1" style={{ color: "var(--bad-text)" }}>{websiteError}</p>}
                                </div>
                                <div>
                                    <label className="text-sm">{t('tenantJoinModal.businessLogo')}</label>
                                    <input
                                        ref={logoInputRef}
                                        type="file"
                                        accept=".png,.jpg,.jpeg,.webp,.svg"
                                        className="hidden"
                                        onChange={(e) => handleLogoChange(e.target.files?.[0] || null)}
                                    />
                                    <div className="flex items-center gap-2">
                                        <Button type="button" variant="outline" onClick={() => logoInputRef.current?.click()}>
                                            {t('tenantJoinModal.uploadLogo')}
                                        </Button>
                                        {logoFile && <span className="text-xs text-foreground/70 truncate max-w-[220px]">{logoFile.name}</span>}
                                    </div>
                                    {logoError && <p className="text-sm mt-1" style={{ color: "var(--bad-text)" }}>{logoError}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="text-sm">{t('tenantJoinModal.businessTitle')}<span className="ml-1" style={{ color: "var(--bad-text)" }}>*</span></label>
                                    <Input value={form.businessTitle} onChange={(e) => setForm((s: any) => ({ ...s, businessTitle: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="text-sm">{t('tenantJoinModal.taxNumber')}<span className="ml-1" style={{ color: "var(--bad-text)" }}>*</span></label>
                                    <Input value={form.taxNumber} onChange={(e) => setForm((s: any) => ({ ...s, taxNumber: e.target.value }))} />
                                    {taxError && <p className="text-sm mt-1" style={{ color: "var(--bad-text)" }}>{taxError}</p>}
                                </div>
                            </div>

                            <div className="grid gap-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm">{t('tenantJoinModal.searchAddress')}<span className="ml-1" style={{ color: "var(--bad-text)" }}>*</span></label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowAddressAutocomplete(!showAddressAutocomplete)}
                                        className="flex items-center gap-2"
                                    >
                                        <Edit className="h-4 w-4" />
                                        <span>{showAddressAutocomplete ? 'Ingresar dirección manualmente' : 'Volver a búsqueda automática'}</span>
                                    </Button>
                                </div>

                                {showAddressAutocomplete && (
                                    <div>
                                        <AddressAutocomplete
                                            defaultValue={form.address || ''}
                                            initialLat={form.latitude && form.latitude !== '' ? parseFloat(form.latitude) : undefined}
                                            initialLng={form.longitude && form.longitude !== '' ? parseFloat(form.longitude) : undefined}
                                            openWithQuery={autocompleteOpenQuery}
                                            placeholder={t("ui.TenantJoinModal.buscarDireccion", "Buscar dirección...")}
                                            onAddressSelect={(data: AddressComponents) => {
                                                // Si la dirección sugerida es la de Madrid, no la pongas automáticamente
                                                const forbidden = 'reloj de la puerta del sol, 7, puerta del sol, barrio delos austrias, sol, centro, madrid, comunidad de madrid, 28013, españa';
                                                const incoming = (data.address || '').trim().toLowerCase();
                                                setForm((s: any) => {
                                                    if (incoming === forbidden) {
                                                        return {
                                                            ...s,
                                                            city: data.city || s.city,
                                                            postalCode: data.postalCode || s.postalCode,
                                                            country: data.country || s.country,
                                                            latitude: String(data.latitude),
                                                            longitude: String(data.longitude),
                                                        };
                                                    }
                                                    return {
                                                        ...s,
                                                        address: data.address || s.address,
                                                        city: data.city || s.city,
                                                        postalCode: data.postalCode || s.postalCode,
                                                        country: data.country || s.country,
                                                        latitude: String(data.latitude),
                                                        longitude: String(data.longitude),
                                                    };
                                                });
                                            }}
                                            showMap={true}
                                        />
                                    </div>
                                )}

                                {!showAddressAutocomplete && (
                                    <div>
                                        <label className="text-sm">{t("ui.TenantJoinModal.direccion", "Dirección")}<span className="ml-1" style={{ color: "var(--bad-text)" }}>*</span></label>
                                        <Input value={form.address} onChange={(e) => setForm((s: any) => ({ ...s, address: e.target.value }))} placeholder={t("ui.TenantJoinModal.ingreseLaDireccionCompleta", "Ingrese la dirección completa")} />
                                    </div>
                                )}

                                {/* Se elimina el mapa secundario para evitar duplicidad. Usar el mapa integrado en AddressAutocompleteOSM para seleccionar la dirección. */}

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="text-sm">{t("ui.TenantJoinModal.direccionComplementaria", "Dirección Complementaria")}</label>
                                        <Input value={form.addressLine2} onChange={(e) => setForm((s: any) => ({ ...s, addressLine2: e.target.value }))} disabled={false} />
                                    </div>
                                    <div>
                                        <label className="text-sm">{t("ui.TenantJoinModal.codigoPostal", "Código Postal")}</label>
                                        <Input value={form.postalCode} onChange={(e) => setForm((s: any) => ({ ...s, postalCode: e.target.value }))} disabled={showAddressAutocomplete} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="text-sm">{t('comun.ciudad')}</label>
                                        <Input value={form.city} onChange={(e) => setForm((s: any) => ({ ...s, city: e.target.value }))} disabled={showAddressAutocomplete} />
                                    </div>
                                    <div>
                                        <label className="text-sm">{t("ui.TenantJoinModal.pais", "País")}</label>
                                        <Input value={form.country} onChange={(e) => setForm((s: any) => ({ ...s, country: e.target.value }))} disabled={showAddressAutocomplete} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="text-sm">Latitud</label>
                                        <Input value={form.latitude} onChange={(e) => setForm((s: any) => ({ ...s, latitude: e.target.value }))} disabled={showAddressAutocomplete} />
                                    </div>
                                    <div>
                                        <label className="text-sm">Longitud</label>
                                        <Input value={form.longitude} onChange={(e) => setForm((s: any) => ({ ...s, longitude: e.target.value }))} disabled={showAddressAutocomplete} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
                                <div className="flex flex-col gap-2">
                                    <Button variant="destructive" onClick={clearDraft} disabled={loading}>Borrar borrador</Button>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <Button variant="ghost" onClick={() => closeWithoutReopen()} disabled={loading}>{t('actions.cancel')}</Button>
                                    <Button className="px-8"
                                        onClick={handleCreate}
                                        disabled={
                                            loading ||
                                            !(form.name && form.email && form.phone && form.address && form.taxNumber && form.businessTitle) ||
                                            Boolean(phoneError) ||
                                            Boolean(taxError) ||
                                            Boolean(emailError) ||
                                            Boolean(websiteError) ||
                                            Boolean(logoError) ||
                                            form.address && form.address.trim().toLowerCase() === 'reloj de la puerta del sol, 7, puerta del sol, barrio de los austrias, sol, centro, madrid, comunidad de madrid, 28013, españa'
                                        }
                                    >
                                        {loading ? t('tenantJoinModal.creating') : t('tenantJoinModal.createAndLink')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter />
            </DialogContent>
        </Dialog>
    );
}
