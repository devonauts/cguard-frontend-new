import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, BellElectric, Camera, Car, Lock, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getServiceType, SERVICE_TYPES } from '@/lib/serviceTypes';
import type { ServiceTypeValue } from '@/lib/serviceTypes';
import { Input } from '@/components/ui/input';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  BellAlert: BellElectric,
  Camera,
  Car,
  Lock,
};

interface ServiceTypeBadgeProps {
  value?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}

export function ServiceTypeBadge({ value, className, size = 'sm' }: ServiceTypeBadgeProps) {
  const { t } = useTranslation();
  const def = getServiceType(value);
  if (!value) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 text-muted-foreground font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        className,
      )}>
        {t('ui.ServiceTypeBadge.sinTipo', 'Sin tipo')}
      </span>
    );
  }

  if (!def) {
    // Custom type – display the raw value
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted text-foreground/70 font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        className,
      )}>
        <Tag className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
        {value}
      </span>
    );
  }

  const Icon = ICONS[def.icon] ?? Shield;

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-medium',
      def.badgeBg, def.badgeText, def.borderColor,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      className,
    )}>
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
      {t(def.labelKey, def.label)}
    </span>
  );
}

interface ServiceTypePickerProps {
  value?: ServiceTypeValue | null;
  onChange: (value: string) => void;
  error?: string;
}

export function ServiceTypePicker({ value, onChange, error }: ServiceTypePickerProps) {
  const { t } = useTranslation();
  const isKnownType = !!value && SERVICE_TYPES.some((st) => st.value === value);
  const [isOther, setIsOther] = useState(!isKnownType && !!value);
  const [customText, setCustomText] = useState(!isKnownType && value ? value : '');

  const handleSelectKnown = (val: string) => {
    setIsOther(false);
    onChange(val);
  };

  const handleSelectOther = () => {
    setIsOther(true);
    onChange(customText);
  };

  const handleCustomTextChange = (text: string) => {
    setCustomText(text);
    onChange(text);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SERVICE_TYPES.map((st) => {
          const Icon = ICONS[st.icon] ?? Shield;
          const isSelected = !isOther && value === st.value;

          return (
            <button
              key={st.value}
              type="button"
              onClick={() => handleSelectKnown(st.value)}
              className={cn(
                'flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all duration-150 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isSelected
                  ? [st.color, st.borderColor, 'shadow-sm ring-1', st.borderColor.replace('border-', 'ring-')]
                  : 'border-border bg-card hover:border-border',
              )}
            >
              <span className={cn(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                isSelected ? [st.color, st.textColor] : 'bg-muted text-muted-foreground',
              )}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className={cn(
                  'block text-sm font-semibold',
                  isSelected ? st.textColor : 'text-foreground',
                )}>
                  {t(st.labelKey, st.label)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground leading-relaxed">
                  {t(st.descriptionKey, st.description)}
                </span>
              </span>
            </button>
          );
        })}

        {/* Custom / "Otro" option */}
        <button
          type="button"
          onClick={handleSelectOther}
          className={cn(
            'flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all duration-150 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            isOther
              ? 'border-gray-400 bg-muted/30 shadow-sm ring-1 ring-gray-400'
              : 'border-border bg-card hover:border-border',
          )}
        >
          <span className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isOther ? 'bg-muted text-foreground/70' : 'bg-muted text-muted-foreground',
          )}>
            <Tag className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className={cn('block text-sm font-semibold', isOther ? 'text-foreground' : 'text-foreground')}>
              {t('ui.ServiceTypeBadge.otro', 'Otro...')}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground leading-relaxed">
              {t('ui.ServiceTypeBadge.especifiqueUnTipoDeServicioPersonalizado', 'Especifique un tipo de servicio personalizado.')}
            </span>
          </span>
        </button>
      </div>

      {isOther && (
        <Input
          placeholder={t("ui.ServiceTypeBadge.ejGestionDeAccesoSeguridad", "Ej. Gestión de acceso, Seguridad industrial, Vigilancia VIP...")}
          value={customText}
          onChange={(e) => handleCustomTextChange(e.target.value)}
          maxLength={50}
          className="mt-2"
          autoFocus
        />
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
