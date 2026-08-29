import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  getProjectType,
  PROJECT_TYPES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
} from '@/lib/projectTypes';
import type { ProjectTypeValue, ProjectStatus } from '@/lib/projectTypes';

interface ProjectTypeBadgeProps {
  value?: string | null;
  className?: string;
  size?: 'sm' | 'md';
}

export function ProjectTypeBadge({ value, className, size = 'sm' }: ProjectTypeBadgeProps) {
  const { t } = useTranslation();
  const def = getProjectType(value);
  if (!def) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 text-muted-foreground font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        className,
      )}>
        {t('ui.ProjectBadge.sinTipo', 'Sin tipo')}
      </span>
    );
  }
  const Icon = def.icon;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-medium',
      def.badgeBg, def.badgeText, def.borderColor,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      className,
    )}>
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
      {def.label}
    </span>
  );
}

interface ProjectStatusBadgeProps {
  value?: string | null;
  className?: string;
}

export function ProjectStatusBadge({ value, className }: ProjectStatusBadgeProps) {
  const label = value ? PROJECT_STATUS_LABELS[value as ProjectStatus] ?? value : 'Sin estado';
  const colors = value ? PROJECT_STATUS_COLORS[value as ProjectStatus] ?? 'bg-muted text-foreground/70' : 'bg-muted text-foreground/70';
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
      colors,
      className,
    )}>
      {label}
    </span>
  );
}

interface ProjectTypePickerProps {
  value?: ProjectTypeValue | null;
  onChange: (value: ProjectTypeValue) => void;
  error?: string;
}

export function ProjectTypePicker({ value, onChange, error }: ProjectTypePickerProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {PROJECT_TYPES.map((pt) => {
          const Icon = pt.icon;
          const isSelected = value === pt.value;
          return (
            <button
              key={pt.value}
              type="button"
              onClick={() => onChange(pt.value)}
              className={cn(
                'flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all duration-150 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isSelected
                  ? [pt.color, pt.borderColor, 'shadow-sm']
                  : 'border-border bg-card hover:border-border',
              )}
            >
              <span className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                isSelected ? [pt.color, pt.textColor] : 'bg-muted text-muted-foreground',
              )}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className={cn(
                  'block text-sm font-semibold leading-tight',
                  isSelected ? pt.textColor : 'text-foreground',
                )}>
                  {pt.label}
                </span>
                <span className="block text-xs text-muted-foreground leading-snug truncate">
                  {pt.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
