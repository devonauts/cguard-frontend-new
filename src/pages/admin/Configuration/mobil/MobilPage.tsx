import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/SettingsLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Pencil, Trash2, Smartphone, Image as ImageIcon, Tag, BadgeCheck, Upload, ShieldCheck } from 'lucide-react';
import CustomerAppPreview, { serviceIcon, SERVICE_ICONS } from './CustomerAppPreview';

/** Pre-made security-service templates: pick one to pre-fill title/description + a
 * named icon (rendered in the app + preview without an uploaded image). */
const SERVICE_TEMPLATES: { titleKey: string; title: string; description: string; iconName: string }[] = [
  { titleKey: 'settings.mobil.serviceTemplates.guard', title: 'Vigilancia física', description: 'Vigilantes uniformados en sitio, 24/7, para disuasión y control de accesos.', iconName: 'guard' },
  { titleKey: 'settings.mobil.serviceTemplates.armed', title: 'Vigilante armado', description: 'Personal de seguridad armado y certificado para entornos de alto riesgo.', iconName: 'shield' },
  { titleKey: 'settings.mobil.serviceTemplates.cctv', title: 'Monitoreo CCTV', description: 'Videovigilancia con cámaras y monitoreo remoto en tiempo real desde nuestra central.', iconName: 'cctv' },
  { titleKey: 'settings.mobil.serviceTemplates.alarms', title: 'Monitoreo de alarmas', description: 'Recepción y verificación de señales de alarma con respuesta inmediata.', iconName: 'monitoring' },
  { titleKey: 'settings.mobil.serviceTemplates.panic', title: 'Botón de pánico / SOS', description: 'Alerta de emergencia con un toque y despacho prioritario de unidades.', iconName: 'panic' },
  { titleKey: 'settings.mobil.serviceTemplates.patrol', title: 'Rondas de seguridad', description: 'Recorridos programados con verificación por QR/GPS y reporte de novedades.', iconName: 'patrol' },
  { titleKey: 'settings.mobil.serviceTemplates.access', title: 'Control de acceso', description: 'Gestión de ingreso de personas y vehículos con registro y credenciales.', iconName: 'access' },
  { titleKey: 'settings.mobil.serviceTemplates.investigation', title: 'Investigaciones privadas', description: 'Investigación, inteligencia y recopilación de evidencia confidencial.', iconName: 'investigation' },
  { titleKey: 'settings.mobil.serviceTemplates.verification', title: 'Verificación de antecedentes', description: 'Estudios de confiabilidad y verificación de antecedentes del personal.', iconName: 'verification' },
  { titleKey: 'settings.mobil.serviceTemplates.custody', title: 'Custodia de mercancía', description: 'Resguardo y acompañamiento de bienes y mercancía en sitio o en ruta.', iconName: 'custody' },
  { titleKey: 'settings.mobil.serviceTemplates.cash', title: 'Transporte de valores', description: 'Traslado blindado de efectivo y valores con personal especializado.', iconName: 'cash' },
  { titleKey: 'settings.mobil.serviceTemplates.escort', title: 'Escolta ejecutiva', description: 'Protección personal y acompañamiento para ejecutivos y VIP.', iconName: 'escort' },
  { titleKey: 'settings.mobil.serviceTemplates.bodyguard', title: 'Custodia de personas (guardaespaldas)', description: 'Protección cercana y permanente para personas en riesgo.', iconName: 'escort' },
  { titleKey: 'settings.mobil.serviceTemplates.bank', title: 'Seguridad bancaria', description: 'Protección de sucursales, cajeros y operaciones bancarias.', iconName: 'bank' },
  { titleKey: 'settings.mobil.serviceTemplates.industrial', title: 'Seguridad industrial', description: 'Protección de plantas, bodegas y procesos industriales.', iconName: 'industrial' },
  { titleKey: 'settings.mobil.serviceTemplates.construction', title: 'Seguridad en obra / construcción', description: 'Vigilancia y control de acceso en proyectos de construcción.', iconName: 'construction' },
  { titleKey: 'settings.mobil.serviceTemplates.residential', title: 'Seguridad residencial', description: 'Protección de conjuntos, urbanizaciones y residencias.', iconName: 'residential' },
  { titleKey: 'settings.mobil.serviceTemplates.events', title: 'Seguridad de eventos', description: 'Control de acceso, aforo y orden en eventos y espectáculos.', iconName: 'events' },
  { titleKey: 'settings.mobil.serviceTemplates.crowd', title: 'Control de multitudes', description: 'Manejo de aforo y multitudes con protocolos de evacuación.', iconName: 'crowd' },
  { titleKey: 'settings.mobil.serviceTemplates.gps', title: 'Rastreo GPS / vehicular', description: 'Localización y monitoreo GPS de flotas y unidades en tiempo real.', iconName: 'gps' },
  { titleKey: 'settings.mobil.serviceTemplates.vehicle', title: 'Custodia vehicular', description: 'Acompañamiento de vehículos y caravanas con unidades de seguridad.', iconName: 'vehicle' },
  { titleKey: 'settings.mobil.serviceTemplates.electronic', title: 'Seguridad electrónica', description: 'Instalación y mantenimiento de alarmas, sensores y sistemas integrados.', iconName: 'electronic' },
  { titleKey: 'settings.mobil.serviceTemplates.reception', title: 'Portería y recepción', description: 'Control de ingreso, registro de visitas y atención en recepción.', iconName: 'reception' },
  { titleKey: 'settings.mobil.serviceTemplates.response', title: 'Respuesta a emergencias', description: 'Unidades móviles de reacción ante incidentes y emergencias.', iconName: 'response' },
  { titleKey: 'settings.mobil.serviceTemplates.firstaid', title: 'Primeros auxilios / paramédico', description: 'Atención prehospitalaria y respuesta médica en sitio.', iconName: 'firstaid' },
  { titleKey: 'settings.mobil.serviceTemplates.k9', title: 'Unidad canina (K9)', description: 'Detección y patrullaje con binomios caninos certificados.', iconName: 'k9' },
  { titleKey: 'settings.mobil.serviceTemplates.fire', title: 'Prevención de incendios', description: 'Inspección, prevención y respuesta ante conatos de incendio.', iconName: 'fire' },
  { titleKey: 'settings.mobil.serviceTemplates.cyber', title: 'Ciberseguridad', description: 'Protección de redes, datos y sistemas frente a amenazas digitales.', iconName: 'cyber' },
  { titleKey: 'settings.mobil.serviceTemplates.risk', title: 'Análisis de riesgos', description: 'Evaluación de vulnerabilidades y planes de mitigación de riesgos.', iconName: 'risk' },
  { titleKey: 'settings.mobil.serviceTemplates.advisory', title: 'Asesoría en seguridad', description: 'Consultoría y diseño de esquemas de seguridad a la medida.', iconName: 'advisory' },
];
import { toast } from 'sonner';
import { PageContainer, PageHeader, Section, EmptyState, StatusBadge, SkeletonBlock, SmartImage } from '@/components/kit';
import {
  createBanner,
  createCertification,
  deleteBanner,
  deleteCertification,
  listBanners,
  listCertifications,
  updateBanner,
  updateCertification,
  uploadBannerImage,
  uploadServiceImage,
  uploadCertificationIcon,
  uploadCertificationImage,
  listServices,
  updateService,
  createService,
  deleteService,
  getCustomerGuardVisibility,
  saveCustomerGuardVisibility,
} from './MobilService';

// Stored file relation as produced by securityGuardService.uploadFileToStorage
// and returned (with a token-based downloadUrl added server-side) on read.
interface UploadedFile {
  id?: string;
  new?: boolean;
  name?: string;
  sizeInBytes?: number;
  privateUrl?: string | null;
  publicUrl?: string | null;
  downloadUrl?: string;
  fileToken?: string | null;
}

// A service row from the mobile Pricebook (GET /tenant/:id/service).
interface MobileService {
  id: string;
  title?: string;
  description?: string;
  price?: string | number | null;
  publishedOnMobile?: boolean;
  iconName?: string | null;
  serviceImages?: UploadedFile[];
  iconImage?: UploadedFile[];
}

interface BannerItem {
  id: string;
  title: string;
  description?: string;
  link?: string;
  imageUrl?: UploadedFile[];
}

interface CertificationItem {
  id: string;
  title: string;
  code: string;
  description: string;
  acquisitionDate?: string;
  expirationDate?: string;
  image?: UploadedFile[];
  icon?: UploadedFile[];
}

// Payloads POSTed/PUT to MobilService (create/update endpoints). Declared as
// type aliases (not interfaces) so they carry an implicit index signature and
// stay assignable to the services' Record<string, unknown> parameter.
type BannerPayload = {
  title: string;
  description?: string;
  imageUrl: UploadedFile[];
  link?: string;
};

type CertificationPayload = {
  title: string;
  code: string;
  description: string;
  acquisitionDate?: string;
  expirationDate?: string;
  image: UploadedFile[];
  icon: UploadedFile[];
};

type ServicePayload = {
  title: string;
  description?: string;
  price: string | number | null;
  publishedOnMobile: boolean;
  iconName: string | null;
  serviceImages: UploadedFile[];
};

const defaultBannerForm = {
  title: '',
  description: '',
  link: '',
  imageFile: null as File | null,
  imageUrl: [] as UploadedFile[],
};

const defaultCertificationForm = {
  title: '',
  code: '',
  description: '',
  acquisitionDate: '',
  expirationDate: '',
  imageFile: null as File | null,
  iconFile: null as File | null,
  image: [] as UploadedFile[],
  icon: [] as UploadedFile[],
};

export default function MobilPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [guardVis, setGuardVis] = useState<{
    name: boolean;
    photo: boolean;
    document: boolean;
    address: boolean;
    email: boolean;
    phone: boolean;
  }>({ name: true, photo: true, document: true, address: true, email: true, phone: true });
  const [savingGuardVis, setSavingGuardVis] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [bannerItems, setBannerItems] = useState<BannerItem[]>([]);
  const [certItems, setCertItems] = useState<CertificationItem[]>([]);
  const [bannerForm, setBannerForm] = useState(defaultBannerForm);
  const [certForm, setCertForm] = useState(defaultCertificationForm);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [editingCertificateId, setEditingCertificateId] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<{
    id: string;
    label: string;
    type: 'banner' | 'certification' | 'service';
  } | null>(null);

  const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api').replace(/\/+$/, '');

    // Token migration: always prefer the backend-attached token `downloadUrl`
    // (fillDownloadUrl). `publicUrl`/`privateUrl` remain only as transitional
    // fallbacks for legacy file objects that lack a downloadUrl. The raw
    // `?privateUrl=` path below is reached only when neither token nor public
    // URL is present; it can't use the useFileUrl hook because this helper runs
    // inside `.map()` render callbacks.
    const resolveFileUrl = (file?: UploadedFile) => {
    const rawUrl = file?.downloadUrl || file?.publicUrl || file?.privateUrl || '';
    const url = String(rawUrl || '').trim();
    if (!url) return '';

    if (/^https?:\/\//i.test(url)) {
      try {
        return encodeURI(url);
      } catch {
        return url;
      }
    }

    const apiBase = API_BASE_URL.replace(/\/+$/g, '');
    const apiRoot = apiBase.replace(/\/api$/i, '');

    if (url.startsWith('/')) {
      try {
        return new URL(url, apiRoot).toString();
      } catch {
        return `${apiRoot}${url}`;
      }
    }

    return `${apiBase}/file/download?privateUrl=${encodeURIComponent(url)}`;
  };

  const resolveBannerImageUrl = (item: BannerItem) => {
    return resolveFileUrl(item.imageUrl?.[0]);
  };

  const resolveCertificationImageUrl = (item: CertificationItem) => {
    return resolveFileUrl(item.image?.[0]);
  };

  const resolveCertificationIconUrl = (item: CertificationItem) => {
    return resolveFileUrl(item.icon?.[0]);
  };

  const openBannerPreview = (url: string) => {
    setImagePreviewUrl(url);
    setImagePreviewOpen(true);
  };

  const closeBannerPreview = () => {
    setImagePreviewOpen(false);
    setImagePreviewUrl(null);
  };

  const IMAGE_MAX_SIZE_MB = 10;
  const IMAGE_MAX_SIZE_BYTES = IMAGE_MAX_SIZE_MB * 1024 * 1024;
  const ICON_MAX_SIZE_MB = 3;
  const ICON_MAX_SIZE_BYTES = ICON_MAX_SIZE_MB * 1024 * 1024;

  const setBannerImageFile = (file: File | null) => {
    if (!file) {
      setBannerForm({ ...bannerForm, imageFile: null });
      return;
    }
    if (file.size > IMAGE_MAX_SIZE_BYTES) {
      toast.error(t('settings.mobil.fileTooLarge', { defaultValue: 'El archivo supera el límite de {{mb}} MB.', mb: IMAGE_MAX_SIZE_MB }));
      return;
    }
    setBannerForm({ ...bannerForm, imageFile: file });
  };

  const setCertImageFile = (file: File | null) => {
    if (!file) {
      setCertForm({ ...certForm, imageFile: null });
      return;
    }
    if (file.size > IMAGE_MAX_SIZE_BYTES) {
      toast.error(t('settings.mobil.fileTooLarge', { defaultValue: 'El archivo supera el límite de {{mb}} MB.', mb: IMAGE_MAX_SIZE_MB }));
      return;
    }
    setCertForm({ ...certForm, imageFile: file });
  };

  const setCertIconFile = (file: File | null) => {
    if (!file) {
      setCertForm({ ...certForm, iconFile: null });
      return;
    }
    if (file.size > ICON_MAX_SIZE_BYTES) {
      toast.error(t('settings.mobil.fileTooLarge', { defaultValue: 'El archivo supera el límite de {{mb}} MB.', mb: ICON_MAX_SIZE_MB }));
      return;
    }
    setCertForm({ ...certForm, iconFile: file });
  };

  const hasBannerImage = bannerForm.imageFile || bannerForm.imageUrl?.length > 0;
  const hasCertImage = certForm.imageFile || certForm.image?.length > 0;
  const hasCertIcon = certForm.iconFile || certForm.icon?.length > 0;

  const loadData = async () => {
    setLoading(true);
    try {
      const [banners, certifications, services, visibility] = await Promise.all([
        listBanners(),
        listCertifications(),
        listServices(),
        getCustomerGuardVisibility(),
      ]);
      setBannerItems(banners);
      setCertItems(certifications);
      setServices(services);
      setGuardVis(visibility);
    } catch (err) {
      console.error(err);
      toast.error(t('settings.mobil.loadError', { defaultValue: 'No se pudo cargar la información de Mobil.' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateGuardVis = async (
    patch: Partial<{
      name: boolean;
      photo: boolean;
      document: boolean;
      address: boolean;
      email: boolean;
      phone: boolean;
    }>,
  ) => {
    const prev = guardVis;
    const next = { ...guardVis, ...patch };
    setGuardVis(next);
    setSavingGuardVis(true);
    try {
      await saveCustomerGuardVisibility(next);
      toast.success(t('settings.mobil.guardVisSaved', { defaultValue: 'Preferencia guardada.' }));
    } catch (err) {
      console.error(err);
      setGuardVis(prev);
      toast.error(t('settings.mobil.guardVisError', { defaultValue: 'No se pudo guardar la preferencia.' }));
    } finally {
      setSavingGuardVis(false);
    }
  };

  const openCreateBanner = () => {
    setEditingBannerId(null);
    setBannerForm(defaultBannerForm);
    setBannerDialogOpen(true);
  };

  const openEditBanner = (item: BannerItem) => {
    setEditingBannerId(item.id);
    setBannerForm({
      title: item.title || '',
      description: item.description || '',
      link: item.link || '',
      imageFile: null,
      imageUrl: item.imageUrl ?? [],
    });
    setBannerDialogOpen(true);
  };

  const openCreateCertification = () => {
    setEditingCertificateId(null);
    setCertForm(defaultCertificationForm);
    setCertDialogOpen(true);
  };

  const openEditCertification = (item: CertificationItem) => {
    setEditingCertificateId(item.id);
    setCertForm({
      title: item.title || '',
      code: item.code || '',
      description: item.description || '',
      acquisitionDate: item.acquisitionDate || '',
      expirationDate: item.expirationDate || '',
      imageFile: null,
      iconFile: null,
      image: item.image ?? [],
      icon: item.icon ?? [],
    });
    setCertDialogOpen(true);
  };

  const handleSaveBanner = async () => {
    if (!bannerForm.title.trim()) {
      toast.error(t('settings.mobil.bannerTitleRequired', { defaultValue: 'El título del banner es obligatorio.' }));
      return;
    }

    setLoading(true);
    try {
      const payload: BannerPayload = {
        title: bannerForm.title,
        description: bannerForm.description,
        imageUrl: bannerForm.imageUrl,
      };

      if (bannerForm.imageFile) {
        const uploaded = await uploadBannerImage(bannerForm.imageFile);
        if (uploaded) {
          payload.imageUrl = [uploaded];
          payload.link = uploaded.privateUrl || uploaded.publicUrl || '';
        }
      } else if (bannerForm.imageUrl?.length > 0) {
        const existingFile = bannerForm.imageUrl[0];
        payload.link = bannerForm.link || existingFile?.privateUrl || existingFile?.publicUrl || '';
      }

      if (editingBannerId) {
        await updateBanner(editingBannerId, payload);
        toast.success(t('settings.mobil.bannerUpdated', { defaultValue: 'Banner actualizado.' }));
      } else {
        await createBanner(payload);
        toast.success(t('settings.mobil.bannerCreated', { defaultValue: 'Banner creado.' }));
      }
      setBannerDialogOpen(false);
      loadData();
    } catch (error) {
      console.error(error);
      toast.error(t('settings.mobil.bannerSaveError', { defaultValue: 'Error al guardar el banner.' }));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCertification = async () => {
    if (!certForm.title.trim() || !certForm.code.trim() || !certForm.description.trim()) {
      toast.error(t('settings.mobil.certFieldsRequired', { defaultValue: 'Título, código y descripción son obligatorios.' }));
      return;
    }

    setLoading(true);
    try {
      const payload: CertificationPayload = {
        title: certForm.title,
        code: certForm.code,
        description: certForm.description,
        acquisitionDate: certForm.acquisitionDate || undefined,
        expirationDate: certForm.expirationDate || undefined,
        image: certForm.image,
        icon: certForm.icon,
      };

      if (certForm.imageFile) {
        const uploaded = await uploadCertificationImage(certForm.imageFile);
        if (uploaded) {
          payload.image = [uploaded];
        }
      }

      if (certForm.iconFile) {
        const uploaded = await uploadCertificationIcon(certForm.iconFile);
        if (uploaded) {
          payload.icon = [uploaded];
        }
      }

      if (editingCertificateId) {
        await updateCertification(editingCertificateId, payload);
        toast.success(t('settings.mobil.certUpdated', { defaultValue: 'Certificación actualizada.' }));
      } else {
        await createCertification(payload);
        toast.success(t('settings.mobil.certCreated', { defaultValue: 'Certificación creada.' }));
      }
      setCertDialogOpen(false);
      loadData();
    } catch (error) {
      console.error(error);
      toast.error(t('settings.mobil.certSaveError', { defaultValue: 'Error al guardar la certificación.' }));
    } finally {
      setLoading(false);
    }
  };

  const openDeleteConfirmation = (id: string, label: string, type: 'banner' | 'certification' | 'service') => {
    setConfirmDeleteItem({ id, label, type });
    setConfirmDeleteOpen(true);
  };

  const closeDeleteConfirmation = () => {
    setConfirmDeleteOpen(false);
    setConfirmDeleteItem(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteItem) return;
    setConfirmDeleteOpen(false);
    setLoading(true);
    try {
      if (confirmDeleteItem.type === 'banner') {
        await deleteBanner(confirmDeleteItem.id);
        toast.success(t('settings.mobil.bannerDeleted', { defaultValue: 'Banner eliminado.' }));
      } else if (confirmDeleteItem.type === 'certification') {
        await deleteCertification(confirmDeleteItem.id);
        toast.success(t('settings.mobil.certDeleted', { defaultValue: 'Certificación eliminada.' }));
      } else if (confirmDeleteItem.type === 'service') {
        await deleteService(confirmDeleteItem.id);
        toast.success(t('settings.mobil.serviceDeleted', { defaultValue: 'Servicio eliminado.' }));
      }
      loadData();
    } catch (error) {
      console.error(error);
      toast.error(
        confirmDeleteItem.type === 'banner'
          ? t('settings.mobil.bannerDeleteError', { defaultValue: 'No se pudo eliminar el banner.' })
          : confirmDeleteItem.type === 'certification'
          ? t('settings.mobil.certDeleteError', { defaultValue: 'No se pudo eliminar la certificación.' })
          : t('settings.mobil.serviceDeleteError', { defaultValue: 'No se pudo eliminar el servicio.' }),
      );
    } finally {
      setLoading(false);
      setConfirmDeleteItem(null);
    }
  };

  const bannerTitle = editingBannerId
    ? t('settings.mobil.editBannerTitle', { defaultValue: 'Editar Banner Superior' })
    : t('settings.mobil.newBannerTitle', { defaultValue: 'Nuevo Banner Superior' });
  const certTitle = editingCertificateId
    ? t('settings.mobil.editCertTitle', { defaultValue: 'Editar Certificación' })
    : t('settings.mobil.newCertTitle', { defaultValue: 'Nueva Certificación' });

  const [services, setServices] = useState<MobileService[]>([]);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const defaultServiceForm = {
    title: '',
    description: '',
    price: '' as string | number,
    publishedOnMobile: false,
    iconName: '' as string,
    images: [] as UploadedFile[], // existing serviceImages (file objects)
    newImageFiles: [] as File[], // newly selected images to upload on save
  };
  const [serviceForm, setServiceForm] = useState(defaultServiceForm);
  const publishedServices = services.filter((s) => s.publishedOnMobile).length;

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t('settings.mobil.layoutTitle', { defaultValue: 'App del cliente (Mi Seguridad)' })}>
        <PageContainer width="wide">
          <PageHeader
            icon={<Smartphone />}
            title={t('settings.mobil.pageTitle', { defaultValue: 'App móvil del cliente (Mi Seguridad)' })}
            subtitle={t('settings.mobil.pageSubtitle', { defaultValue: 'Configura los banners, servicios y certificaciones. La vista previa muestra cómo se verá en el teléfono mientras editas.' })}
            badges={
              <>
                <StatusBadge tone={bannerItems.length ? 'ok' : 'neutral'}>
                  {t('settings.mobil.bannersBadge', { defaultValue: '{{count}} banner{{plural}}', count: bannerItems.length, plural: bannerItems.length === 1 ? '' : 's' })}
                </StatusBadge>
                <StatusBadge tone={publishedServices ? 'ok' : 'neutral'}>
                  {t('settings.mobil.publishedServicesBadge', { defaultValue: '{{count}} servicio{{plural}} publicado{{plural}}', count: publishedServices, plural: publishedServices === 1 ? '' : 's' })}
                </StatusBadge>
                <StatusBadge tone={certItems.length ? 'ok' : 'neutral'}>
                  {t('settings.mobil.certsBadge', { defaultValue: '{{count}} certificación{{plural}}', count: certItems.length, plural: certItems.length === 1 ? '' : 'es' })}
                </StatusBadge>
              </>
            }
          />
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Tabs className="min-w-0 space-y-6" defaultValue="contenido">
              <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsList className="w-max min-w-full justify-start">
                  <TabsTrigger value="contenido">{t('settings.mobil.tabContent', { defaultValue: 'Contenido' })}</TabsTrigger>
                  <TabsTrigger value="vigilante">{t('settings.mobil.tabGuard', { defaultValue: 'Privacidad del vigilante' })}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent className="space-y-6" value="contenido">

          <Section
            title={t('settings.mobil.bannerSectionTitle', { defaultValue: 'Banner Superior' })}
            icon={<ImageIcon />}
            contentClassName="space-y-4"
            action={
              <Button onClick={openCreateBanner} variant="brand" size="sm" className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> {t('settings.mobil.newBannerBtn', { defaultValue: 'Nuevo banner' })}
              </Button>
            }
          >
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {t('settings.mobil.bannerSectionDesc', { defaultValue: 'Las imágenes que giran en la portada de la app del cliente.' })}
            </p>

            <Table className="cg-tabla-fichas table-fixed min-w-[560px]">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '45%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.mobil.colTitle', { defaultValue: 'Título' })}</TableHead>
                  <TableHead>{t('settings.mobil.descriptionLabel', { defaultValue: 'Descripción' })}</TableHead>
                  <TableHead className="text-center">{t('settings.mobil.imageLabel', { defaultValue: 'Imagen' })}</TableHead>
                  <TableHead className="text-right">{t('settings.mobil.colActions', { defaultValue: 'Acciones' })}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bannerItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center">
                      {loading ? (
                        <div className="space-y-2">
                          <SkeletonBlock className="h-10" />
                          <SkeletonBlock className="h-10" />
                        </div>
                      ) : (
                        <EmptyState
                          className="border-0 py-4"
                          icon={<ImageIcon />}
                          title={t('settings.mobil.noBannersTitle', { defaultValue: 'Todavía no hay banners' })}
                          description={t('settings.mobil.noBannersDesc', { defaultValue: 'Añade uno para destacar tus servicios en la portada de la app.' })}
                          action={
                            <Button onClick={openCreateBanner} variant="brand" size="sm" className="gap-2">
                              <Plus className="h-4 w-4" /> {t('settings.mobil.newBannerBtn', { defaultValue: 'Nuevo banner' })}
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {bannerItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell data-rotulo={t('settings.mobil.colTitle', { defaultValue: 'Título' })}>{item.title}</TableCell>
                      <TableCell data-rotulo={t('settings.mobil.descriptionLabel', { defaultValue: 'Descripción' })}>{item.description || '-'}</TableCell>
                      <TableCell className="text-center" data-rotulo={t('settings.mobil.imageLabel', { defaultValue: 'Imagen' })}>
                        {resolveBannerImageUrl(item) ? (
                          <button
                            type="button"
                            onClick={() => openBannerPreview(resolveBannerImageUrl(item))}
                            className="glass-flat glass-hover cg-focus group inline-flex items-center justify-center overflow-hidden p-0"
                          >
                            <SmartImage
                              src={resolveBannerImageUrl(item)}
                              alt={item.title || t('settings.mobil.bannerAlt', { defaultValue: 'Banner' })}
                              rounded="rounded-none"
                              className="h-16 w-32 transition duration-200 group-hover:scale-105"
                              crossOrigin="anonymous"
                            />
                          </button>
                        ) : (
                          <StatusBadge tone="neutral" dot={false}>{t('settings.mobil.noImage', { defaultValue: 'Sin imagen' })}</StatusBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="icon-sm" variant="outline" aria-label={t('settings.mobil.editAction', { defaultValue: 'Editar' })} onClick={() => openEditBanner(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon-sm" variant="destructive" aria-label={t('settings.mobil.deleteAction', { defaultValue: 'Eliminar' })} onClick={() => openDeleteConfirmation(item.id, item.title || t('settings.mobil.thisBanner', { defaultValue: 'este banner' }), 'banner')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Section>

          <Section
            title={t('settings.mobil.serviceSectionTitle', { defaultValue: 'Pricebook (Servicios)' })}
            icon={<Tag />}
            contentClassName="space-y-4"
            action={
              <div>
                <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
                    <DialogTrigger asChild>
                    <Button onClick={() => { setEditingServiceId(null); setServiceForm(defaultServiceForm); setServiceDialogOpen(true); }} variant="brand" size="sm" className="inline-flex items-center gap-2">
                      <Plus className="h-4 w-4" /> {t('settings.mobil.newServiceBtn', { defaultValue: 'Nuevo servicio' })}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{editingServiceId ? t('settings.mobil.editServiceTitle', { defaultValue: 'Editar Servicio' }) : t('settings.mobil.newServiceTitle', { defaultValue: 'Nuevo Servicio' })}</DialogTitle>
                      <DialogDescription>{t('settings.mobil.serviceDialogDesc', { defaultValue: 'Configura un servicio para la app móvil.' })}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      {/* Plantillas de servicios de seguridad — pre-llenan título, descripción e ícono */}
                      <div>
                        <Label>{t('settings.mobil.securityTemplatesLabel', { defaultValue: 'Plantillas de seguridad' })}</Label>
                        <div className="mt-1.5 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                          {SERVICE_TEMPLATES.map((tpl) => {
                            const Ic = serviceIcon(tpl.iconName);
                            const tplTitle = t(tpl.titleKey, tpl.title);
                            const activa = serviceForm.title === tplTitle;
                            return (
                              <button
                                key={tpl.title}
                                type="button"
                                onClick={() => setServiceForm((p) => ({ ...p, title: tplTitle, description: tpl.description, iconName: tpl.iconName, publishedOnMobile: true }))}
                                className="cg-focus inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition"
                                style={{
                                  background: activa ? 'var(--brand-wash)' : 'var(--glass-sunken)',
                                  borderColor: activa ? 'var(--brand-line)' : 'var(--hairline)',
                                  color: activa ? 'var(--brand-text)' : 'var(--ink-soft)',
                                }}
                              >
                                <Ic className="size-3.5" /> {tplTitle}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <Label>{t('settings.mobil.titleRequiredLabel', { defaultValue: 'Título*' })}</Label>
                        <Input value={serviceForm.title} onChange={(e) => setServiceForm({ ...serviceForm, title: e.target.value })} placeholder={t('settings.mobil.serviceTitlePlaceholder', { defaultValue: 'Título del servicio' })} />
                      </div>
                      <div>
                        <Label>{t('settings.mobil.descriptionLabel', { defaultValue: 'Descripción' })}</Label>
                        <Textarea value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} rows={4} />
                      </div>
                      <div>
                        <Label>{t('settings.mobil.iconSentLabel', { defaultValue: 'Ícono (se envía a la app)' })}</Label>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {Object.entries(SERVICE_ICONS).map(([key, Ic]) => (
                            <button
                              key={key}
                              type="button"
                              title={key}
                              onClick={() => setServiceForm({ ...serviceForm, iconName: key })}
                              className="cg-focus grid size-9 place-items-center rounded-xl border transition"
                              style={
                                serviceForm.iconName === key
                                  ? { background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }
                                  : { background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }
                              }
                            >
                              <Ic className="size-4" />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label>{t('settings.mobil.serviceImagesLabel', { defaultValue: 'Imágenes del servicio' })}</Label>
                        <p className="mb-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.serviceImagesHint', { defaultValue: 'Se muestran en la pantalla de detalle del servicio en la app. Puedes agregar varias.' })}</p>
                        <div className="flex flex-wrap gap-2">
                          {serviceForm.images.map((img: UploadedFile, i: number) => (
                            <div key={`ex-${i}`} className="glass-flat relative size-16 overflow-hidden">
                              <SmartImage src={resolveFileUrl(img)} alt="" rounded="rounded-none" className="size-full" />
                              <button
                                type="button"
                                aria-label={t('settings.mobil.removeImage', { defaultValue: 'Quitar imagen' })}
                                onClick={() => setServiceForm((p) => ({ ...p, images: p.images.filter((_: UploadedFile, j: number) => j !== i) }))}
                                className="cg-btn-bad cg-focus absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          ))}
                          {serviceForm.newImageFiles.map((file: File, i: number) => (
                            <div key={`new-${i}`} className="glass-flat glass-brand relative size-16 overflow-hidden">
                              <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" />
                              <button
                                type="button"
                                aria-label={t('settings.mobil.removeImage', { defaultValue: 'Quitar imagen' })}
                                onClick={() => setServiceForm((p) => ({ ...p, newImageFiles: p.newImageFiles.filter((_: File, j: number) => j !== i) }))}
                                className="cg-btn-bad cg-focus absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          ))}
                          <label
                            className="cg-focus grid size-16 cursor-pointer place-items-center rounded-xl border border-dashed transition hover:opacity-80"
                            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-faint)', background: 'var(--glass-sunken)' }}
                          >
                            <Plus className="size-5" />
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length) setServiceForm((p) => ({ ...p, newImageFiles: [...p.newImageFiles, ...files] }));
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <div>
                        <Label>{t('settings.mobil.priceLabel', { defaultValue: 'Precio' })}</Label>
                        <Input value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })} placeholder="0.00" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label>{t('settings.mobil.publishedInAppLabel', { defaultValue: 'Publicado en App' })}</Label>
                        <Switch checked={Boolean(serviceForm.publishedOnMobile)} onCheckedChange={(val) => setServiceForm({ ...serviceForm, publishedOnMobile: !!val })} />
                      </div>
                    </div>
                    <DialogFooter className="mt-6 flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setServiceDialogOpen(false)}>{t('settings.mobil.cancelBtn', { defaultValue: 'Cancelar' })}</Button>
                      <Button variant="brand" onClick={async () => {
                        try {
                          // Upload any newly selected images, then keep existing + new.
                          const uploadedImages: UploadedFile[] = [];
                          for (const file of serviceForm.newImageFiles) {
                            const up = await uploadServiceImage(file);
                            if (up) uploadedImages.push(up);
                          }
                          const payload: ServicePayload = {
                            title: serviceForm.title,
                            description: serviceForm.description,
                            price: serviceForm.price || null,
                            publishedOnMobile: serviceForm.publishedOnMobile,
                            iconName: serviceForm.iconName || null,
                            serviceImages: [...serviceForm.images, ...uploadedImages],
                          };
                          if (editingServiceId) {
                            await updateService(editingServiceId, payload);
                            toast.success(t('settings.mobil.serviceUpdated', { defaultValue: 'Servicio actualizado.' }));
                          } else {
                            await createService(payload);
                            toast.success(t('settings.mobil.serviceCreated', { defaultValue: 'Servicio creado.' }));
                          }
                          setServiceDialogOpen(false);
                          loadData();
                        } catch (err) {
                          console.error(err);
                          toast.error(t('settings.mobil.serviceSaveError', { defaultValue: 'No se pudo guardar el servicio.' }));
                        }
                      }}>{t('settings.mobil.saveBtn', { defaultValue: 'Guardar' })}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            }
          >
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.serviceSectionDesc', { defaultValue: 'Lista de servicios de tu empresa. Sólo los publicados se ven en la app.' })}</p>

            <div>
              <Table className="cg-tabla-fichas table-fixed min-w-[720px]">
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('settings.mobil.colTitle', { defaultValue: 'Título' })}</TableHead>
                    <TableHead>{t('settings.mobil.descriptionLabel', { defaultValue: 'Descripción' })}</TableHead>
                    <TableHead>{t('settings.mobil.priceLabel', { defaultValue: 'Precio' })}</TableHead>
                    <TableHead className="text-center">{t('settings.mobil.colInApp', { defaultValue: 'En la app' })}</TableHead>
                    <TableHead className="text-right">{t('settings.mobil.colActions', { defaultValue: 'Acciones' })}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center">
                        {loading ? (
                          <div className="space-y-2">
                            <SkeletonBlock className="h-10" />
                            <SkeletonBlock className="h-10" />
                          </div>
                        ) : (
                          <EmptyState
                            className="border-0 py-4"
                            icon={<Tag />}
                            title={t('settings.mobil.noServicesTitle', { defaultValue: 'Todavía no hay servicios' })}
                            description={t('settings.mobil.noServicesDesc', { defaultValue: 'Crea uno desde una plantilla y publícalo para que aparezca en la app del cliente.' })}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  {services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell data-rotulo={t('settings.mobil.colTitle', { defaultValue: 'Título' })}>{s.title}</TableCell>
                      <TableCell className="truncate" data-rotulo={t('settings.mobil.descriptionLabel', { defaultValue: 'Descripción' })}>{s.description}</TableCell>
                      <TableCell className="tabular-nums" data-rotulo={t('settings.mobil.priceLabel', { defaultValue: 'Precio' })}>{s.price === null || s.price === undefined || s.price === '' ? '-' : s.price}</TableCell>
                      <TableCell className="text-center" data-rotulo={t('settings.mobil.colInApp', { defaultValue: 'En la app' })}>
                        <StatusBadge tone={s.publishedOnMobile ? 'ok' : 'neutral'}>
                          {s.publishedOnMobile ? t('settings.mobil.published', { defaultValue: 'Publicado' }) : t('settings.mobil.hidden', { defaultValue: 'Oculto' })}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="icon-sm" variant="outline" aria-label={t('settings.mobil.editAction', { defaultValue: 'Editar' })} onClick={() => { setEditingServiceId(s.id); setServiceForm({ title: s.title || '', description: s.description || '', price: s.price ?? '', publishedOnMobile: !!s.publishedOnMobile, iconName: s.iconName || '', images: s.serviceImages || [], newImageFiles: [] }); setServiceDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon-sm" variant="destructive" aria-label={t('settings.mobil.deleteAction', { defaultValue: 'Eliminar' })} onClick={() => openDeleteConfirmation(s.id, s.title || t('settings.mobil.thisService', { defaultValue: 'este servicio' }), 'service')}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section
            title={t('settings.mobil.certSectionTitle', { defaultValue: 'Certificaciones' })}
            icon={<BadgeCheck />}
            contentClassName="space-y-4"
            action={
              <Button onClick={openCreateCertification} variant="brand" size="sm" className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> {t('settings.mobil.newCertBtn', { defaultValue: 'Nueva certificación' })}
              </Button>
            }
          >
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.certSectionDesc', { defaultValue: 'Los sellos y acreditaciones de tu empresa, con sus fechas y archivos.' })}</p>

            <Table className="cg-tabla-fichas table-fixed min-w-[900px]">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.mobil.colTitle', { defaultValue: 'Título' })}</TableHead>
                  <TableHead>{t('settings.mobil.colCode', { defaultValue: 'Código' })}</TableHead>
                  <TableHead className="text-center">{t('settings.mobil.imageLabel', { defaultValue: 'Imagen' })}</TableHead>
                  <TableHead className="text-center">{t('settings.mobil.iconLabel', { defaultValue: 'Icono' })}</TableHead>
                  <TableHead className="text-center">{t('settings.mobil.colAcquisition', { defaultValue: 'Adquisición' })}</TableHead>
                  <TableHead className="text-center">{t('settings.mobil.colExpiration', { defaultValue: 'Vencimiento' })}</TableHead>
                  <TableHead className="text-right">{t('settings.mobil.colActions', { defaultValue: 'Acciones' })}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center">
                      {loading ? (
                        <div className="space-y-2">
                          <SkeletonBlock className="h-10" />
                          <SkeletonBlock className="h-10" />
                        </div>
                      ) : (
                        <EmptyState
                          className="border-0 py-4"
                          icon={<BadgeCheck />}
                          title={t('settings.mobil.noCertsTitle', { defaultValue: 'Todavía no hay certificaciones' })}
                          description={t('settings.mobil.noCertsDesc', { defaultValue: 'Añade tus acreditaciones para que el cliente las vea en la app.' })}
                          action={
                            <Button onClick={openCreateCertification} variant="brand" size="sm" className="gap-2">
                              <Plus className="h-4 w-4" /> {t('settings.mobil.newCertBtn', { defaultValue: 'Nueva certificación' })}
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {certItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell data-rotulo={t('settings.mobil.colTitle', { defaultValue: 'Título' })}>{item.title}</TableCell>
                    <TableCell data-rotulo={t('settings.mobil.colCode', { defaultValue: 'Código' })}>{item.code}</TableCell>
                    <TableCell className="text-center" data-rotulo={t('settings.mobil.imageLabel', { defaultValue: 'Imagen' })}>
                      {resolveCertificationImageUrl(item) ? (
                        <button
                          type="button"
                          onClick={() => openBannerPreview(resolveCertificationImageUrl(item))}
                          className="glass-flat glass-hover cg-focus group inline-flex items-center justify-center overflow-hidden p-0"
                        >
                          <SmartImage
                            src={resolveCertificationImageUrl(item)}
                            alt={item.title || t('settings.mobil.certImageAlt', { defaultValue: 'Imagen certificación' })}
                            rounded="rounded-none"
                            fit="contain"
                            className="h-16 w-32 transition duration-200 group-hover:scale-105"
                            crossOrigin="anonymous"
                          />
                        </button>
                      ) : (
                        <StatusBadge tone="neutral" dot={false}>{t('settings.mobil.noImage', { defaultValue: 'Sin imagen' })}</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-center" data-rotulo={t('settings.mobil.iconLabel', { defaultValue: 'Icono' })}>
                      {resolveCertificationIconUrl(item) ? (
                        <button
                          type="button"
                          onClick={() => openBannerPreview(resolveCertificationIconUrl(item))}
                          className="glass-flat glass-hover cg-focus group inline-flex items-center justify-center overflow-hidden p-0"
                        >
                          <SmartImage
                            src={resolveCertificationIconUrl(item)}
                            alt={item.title || t('settings.mobil.certIconAlt', { defaultValue: 'Icono certificación' })}
                            rounded="rounded-none"
                            fit="contain"
                            className="h-16 w-16 transition duration-200 group-hover:scale-105"
                            crossOrigin="anonymous"
                          />
                        </button>
                      ) : (
                        <StatusBadge tone="neutral" dot={false}>{t('settings.mobil.noIcon', { defaultValue: 'Sin icono' })}</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell data-rotulo={t('settings.mobil.colAcquisition', { defaultValue: 'Adquisición' })}>{item.acquisitionDate || '-'}</TableCell>
                    <TableCell data-rotulo={t('settings.mobil.colExpiration', { defaultValue: 'Vencimiento' })}>{item.expirationDate || '-'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="icon-sm" variant="outline" aria-label={t('settings.mobil.editAction', { defaultValue: 'Editar' })} onClick={() => openEditCertification(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon-sm" variant="destructive" aria-label={t('settings.mobil.deleteAction', { defaultValue: 'Eliminar' })} onClick={() => openDeleteConfirmation(item.id, item.title || t('settings.mobil.thisCert', { defaultValue: 'esta certificación' }), 'certification')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
              </TabsContent>

              <TabsContent className="space-y-6" value="vigilante">
                <Section
                  title={t('settings.mobil.guardVisTitle', { defaultValue: 'Datos del vigilante visibles para el cliente' })}
                  icon={<ShieldCheck />}
                  contentClassName="space-y-4"
                >
                  <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                    {t('settings.mobil.guardVisDesc', { defaultValue: 'Elige qué datos del vigilante ve el cliente en la app Mi Seguridad. El cambio se aplica de inmediato, sin actualizar la app. El puesto y el estado (en turno) siempre se muestran; los datos de RRHH (nacimiento, tipo de sangre, estado civil, etc.) nunca se comparten.' })}
                  </p>
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--hairline)' }}>
                    <div>
                      <div className="text-sm font-medium">{t('settings.mobil.guardVisName', { defaultValue: 'Nombre del vigilante' })}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.guardVisNameHint', { defaultValue: 'Si se apaga, el cliente ve "Vigilante" en vez del nombre.' })}</div>
                    </div>
                    <Switch checked={guardVis.name} disabled={savingGuardVis || loading} onCheckedChange={(v) => updateGuardVis({ name: !!v })} />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--hairline)' }}>
                    <div>
                      <div className="text-sm font-medium">{t('settings.mobil.guardVisPhoto', { defaultValue: 'Foto del vigilante' })}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.guardVisPhotoHint', { defaultValue: 'Si se apaga, el cliente ve las iniciales.' })}</div>
                    </div>
                    <Switch checked={guardVis.photo} disabled={savingGuardVis || loading} onCheckedChange={(v) => updateGuardVis({ photo: !!v })} />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--hairline)' }}>
                    <div>
                      <div className="text-sm font-medium">{t('settings.mobil.guardVisDocument', { defaultValue: 'Cédula / Documento' })}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.guardVisDocumentHint', { defaultValue: 'Número de identificación del vigilante.' })}</div>
                    </div>
                    <Switch checked={guardVis.document} disabled={savingGuardVis || loading} onCheckedChange={(v) => updateGuardVis({ document: !!v })} />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--hairline)' }}>
                    <div>
                      <div className="text-sm font-medium">{t('settings.mobil.guardVisAddress', { defaultValue: 'Dirección' })}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.guardVisAddressHint', { defaultValue: 'Dirección del vigilante.' })}</div>
                    </div>
                    <Switch checked={guardVis.address} disabled={savingGuardVis || loading} onCheckedChange={(v) => updateGuardVis({ address: !!v })} />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--hairline)' }}>
                    <div>
                      <div className="text-sm font-medium">{t('settings.mobil.guardVisEmail', { defaultValue: 'Email' })}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.guardVisEmailHint', { defaultValue: 'Correo del vigilante.' })}</div>
                    </div>
                    <Switch checked={guardVis.email} disabled={savingGuardVis || loading} onCheckedChange={(v) => updateGuardVis({ email: !!v })} />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--hairline)' }}>
                    <div>
                      <div className="text-sm font-medium">{t('settings.mobil.guardVisPhone', { defaultValue: 'Teléfono' })}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.guardVisPhoneHint', { defaultValue: 'Teléfono del vigilante (botón de llamada en la app).' })}</div>
                    </div>
                    <Switch checked={guardVis.phone} disabled={savingGuardVis || loading} onCheckedChange={(v) => updateGuardVis({ phone: !!v })} />
                  </div>
                </Section>
              </TabsContent>
            </Tabs>
            {/* Live phone preview (sticky) — reflects the configured banners. */}
            <div className="lg:sticky lg:top-6">
              <CustomerAppPreview
                banners={bannerItems.map((item) => ({
                  title: item.title,
                  description: item.description,
                  image: resolveBannerImageUrl(item),
                }))}
                services={services
                  .filter((s) => s.publishedOnMobile)
                  .map((s) => ({
                    title: s.title,
                    description: s.description,
                    image: resolveFileUrl(s.serviceImages?.[0]) || resolveFileUrl(s.iconImage?.[0]) || undefined,
                    iconName: s.iconName,
                  }))}
                certifications={certItems.map((c) => ({
                  title: c.title,
                  description: c.description,
                  image: resolveCertificationImageUrl(c),
                }))}
              />
            </div>
          </div>
        </PageContainer>

        <Dialog open={bannerDialogOpen} onOpenChange={setBannerDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
            <DialogHeader className="text-center">
              <DialogTitle className="mx-auto">{bannerTitle}</DialogTitle>
              <DialogDescription>{t('settings.mobil.bannerDialogDesc', { defaultValue: 'Configura el banner que se mostrará en el módulo MOBIL.' })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>{t('settings.mobil.titleRequiredLabel', { defaultValue: 'Título*' })}</Label>
                <Input
                  value={bannerForm.title}
                  onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                  placeholder={t('settings.mobil.bannerTitlePlaceholder', { defaultValue: 'Título del banner' })}
                  required
                />
              </div>
              <div>
                <Label>{t('settings.mobil.descriptionLabel', { defaultValue: 'Descripción' })}</Label>
                <Textarea
                  value={bannerForm.description}
                  onChange={(e) => setBannerForm({ ...bannerForm, description: e.target.value })}
                  placeholder={t('settings.mobil.bannerDescPlaceholder', { defaultValue: 'Descripción del banner' })}
                  rows={3}
                />
              </div>
              <div>
                <Label>{t('settings.mobil.imageLabel', { defaultValue: 'Imagen' })}</Label>
                <div className="grid gap-2">
                  <div className="flex justify-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label
                            htmlFor="bannerImage"
                            className="cg-btn-brand cg-focus inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                          >
                            <Upload className="h-4 w-4" /> {t('settings.mobil.selectFileBtn', { defaultValue: 'Seleccionar archivo' })}
                          </label>
                        </TooltipTrigger>
                        <TooltipContent>{t('settings.mobil.fileLimitTooltip', { defaultValue: 'Límite de archivo: {{mb}} MB.', mb: IMAGE_MAX_SIZE_MB })}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <input
                      id="bannerImage"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => setBannerImageFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <p className="mt-1 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>{t('settings.mobil.imageSizeLimit', { defaultValue: 'Límite de tamaño por imagen: {{mb}} MB.', mb: IMAGE_MAX_SIZE_MB })}</p>
                  <div className="glass-sunken flex min-h-[54px] items-center justify-center px-4 py-3 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
                    {bannerForm.imageFile ? bannerForm.imageFile.name : bannerForm.imageUrl?.[0]?.name || t('settings.mobil.noFileSelected', { defaultValue: 'No se ha seleccionado archivo' })}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBannerDialogOpen(false)}>{t('settings.mobil.cancelBtn', { defaultValue: 'Cancelar' })}</Button>
              <Button variant="brand" onClick={handleSaveBanner} disabled={loading}>
                {t('settings.mobil.saveBtn', { defaultValue: 'Guardar' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={certDialogOpen} onOpenChange={setCertDialogOpen}>
          <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
            <DialogHeader className="text-center">
              <DialogTitle className="mx-auto">{certTitle}</DialogTitle>
              <DialogDescription>{t('settings.mobil.certDialogDesc', { defaultValue: 'Configura los datos de la certificación y sus archivos.' })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>{t('settings.mobil.titleRequiredLabel', { defaultValue: 'Título*' })}</Label>
                <Input
                  value={certForm.title}
                  onChange={(e) => setCertForm({ ...certForm, title: e.target.value })}
                  placeholder={t('settings.mobil.certTitlePlaceholder', { defaultValue: 'Título de la certificación' })}
                  required
                />
              </div>
              <div>
                <Label>{t('settings.mobil.codeRequiredLabel', { defaultValue: 'Código*' })}</Label>
                <Input
                  value={certForm.code}
                  onChange={(e) => setCertForm({ ...certForm, code: e.target.value })}
                  placeholder={t('settings.mobil.codePlaceholder', { defaultValue: 'Código interno' })}
                  required
                />
              </div>
              <div>
                <Label>{t('settings.mobil.descriptionRequiredLabel', { defaultValue: 'Descripción*' })}</Label>
                <Textarea
                  value={certForm.description}
                  onChange={(e) => setCertForm({ ...certForm, description: e.target.value })}
                  placeholder={t('settings.mobil.certDescPlaceholder', { defaultValue: 'Descripción de la certificación' })}
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t('settings.mobil.acquisitionDateLabel', { defaultValue: 'Fecha de adquisición' })}</Label>
                  <Input
                    type="date"
                    value={certForm.acquisitionDate}
                    onChange={(e) => setCertForm({ ...certForm, acquisitionDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('settings.mobil.expirationDateLabel', { defaultValue: 'Fecha de expiración' })}</Label>
                  <Input
                    type="date"
                    value={certForm.expirationDate}
                    onChange={(e) => setCertForm({ ...certForm, expirationDate: e.target.value })}
                  />
                </div>
              </div>
              <Separator />
              <div>
                <Label>{t('settings.mobil.imageLabel', { defaultValue: 'Imagen' })}</Label>
                <div className="grid gap-2">
                  <div className="flex justify-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label
                            htmlFor="certImage"
                            className="cg-btn-brand cg-focus inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                          >
                            <Upload className="h-4 w-4" /> {t('settings.mobil.selectFileBtn', { defaultValue: 'Seleccionar archivo' })}
                          </label>
                        </TooltipTrigger>
                        <TooltipContent>{t('settings.mobil.fileLimitTooltip', { defaultValue: 'Límite de archivo: {{mb}} MB.', mb: IMAGE_MAX_SIZE_MB })}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <input
                      id="certImage"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => setCertImageFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <p className="mt-1 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>{t('settings.mobil.imageSizeLimit', { defaultValue: 'Límite de tamaño por imagen: {{mb}} MB.', mb: IMAGE_MAX_SIZE_MB })}</p>
                  <div className="glass-sunken flex min-h-[54px] items-center justify-center px-4 py-3 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
                    {certForm.imageFile ? certForm.imageFile.name : certForm.image?.[0]?.name || t('settings.mobil.noFileSelected', { defaultValue: 'No se ha seleccionado archivo' })}
                  </div>
                </div>
              </div>
              <div>
                <Label>{t('settings.mobil.iconLabel', { defaultValue: 'Icono' })}</Label>
                <div className="grid gap-2">
                  <div className="flex justify-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label
                            htmlFor="certIcon"
                            className="cg-btn-brand cg-focus inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                          >
                            <Upload className="h-4 w-4" /> {t('settings.mobil.selectFileBtn', { defaultValue: 'Seleccionar archivo' })}
                          </label>
                        </TooltipTrigger>
                        <TooltipContent>{t('settings.mobil.iconLimitTooltip', { defaultValue: 'Límite de icono: {{mb}} MB.', mb: ICON_MAX_SIZE_MB })}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <input
                      id="certIcon"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => setCertIconFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <p className="mt-1 text-center text-xs" style={{ color: 'var(--ink-faint)' }}>{t('settings.mobil.iconSizeLimit', { defaultValue: 'Límite de tamaño del icono: {{mb}} MB.', mb: ICON_MAX_SIZE_MB })}</p>
                  <div className="glass-sunken flex min-h-[54px] items-center justify-center px-4 py-3 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
                    {certForm.iconFile ? certForm.iconFile.name : certForm.icon?.[0]?.name || t('settings.mobil.noFileSelected', { defaultValue: 'No se ha seleccionado archivo' })}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCertDialogOpen(false)}>{t('settings.mobil.cancelBtn', { defaultValue: 'Cancelar' })}</Button>
              <Button variant="brand" onClick={handleSaveCertification} disabled={loading}>
                {t('settings.mobil.saveBtn', { defaultValue: 'Guardar' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={imagePreviewOpen} onOpenChange={setImagePreviewOpen}>
          <DialogContent
            showCloseButton={false}
            className="max-h-[90vh] w-full max-w-[calc(100%-2rem)] overflow-hidden rounded-3xl border p-0 sm:max-w-[920px]"
          >
            <DialogHeader
              className="flex items-center justify-center gap-4 border-b px-4 py-4"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <DialogTitle className="text-lg font-semibold">{t('settings.mobil.previewTitle', { defaultValue: 'Vista previa' })}</DialogTitle>
            </DialogHeader>
            <div
              className="flex min-h-[60vh] items-center justify-center overflow-hidden p-4"
              style={{ background: 'var(--glass-sunken)' }}
            >
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt={t('settings.mobil.previewAlt', { defaultValue: 'Vista previa de la imagen' })}
                  className="max-h-[82vh] max-w-full rounded-3xl border object-contain"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--glass-raised)' }}
                  decoding="async"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('settings.mobil.noImageToPreview', { defaultValue: 'No hay imagen para previsualizar.' })}</div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
            <DialogHeader className="text-center">
              <DialogTitle>{t('settings.mobil.confirmDeleteTitle', { defaultValue: 'Confirmar eliminación' })}</DialogTitle>
              <DialogDescription>
                {t('settings.mobil.confirmDeleteQuestion', { defaultValue: '¿Estás seguro que quieres eliminar {{label}}?', label: confirmDeleteItem?.label })}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 text-sm text-foreground">
              {t('settings.mobil.cannotUndo', { defaultValue: 'Esta acción no se puede deshacer.' })}
            </div>
            <DialogFooter className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeDeleteConfirmation}>
                {t('settings.mobil.cancelBtn', { defaultValue: 'Cancelar' })}
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirmed}>
                {t('settings.mobil.deleteAction', { defaultValue: 'Eliminar' })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsLayout>
    </AppLayout>
  );
}
