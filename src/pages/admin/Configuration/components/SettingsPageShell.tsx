/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — ARMAZÓN DE UNA PÁGINA DE CONFIGURACIÓN
 *
 * `AppLayout` → `SettingsLayout` → `PageContainer` → `PageHeader` estaba
 * escrito a mano en las 26 páginas de Configuración. Que se repita no era el
 * problema; el problema es que se repetía MAL: cinco anchos distintos para el
 * mismo tipo de contenido (`narrow` en Rondas, por defecto en Otras
 * Configuraciones, `wide` en Campos de Perfil — las tres son la misma clase de
 * página), y `navKey="configuracion"` copiado 26 veces esperando que nadie lo
 * escriba mal.
 *
 * ── EL ANCHO SALE DEL TIPO, NO DEL GUSTO ───────────────────────────────────
 * `kind="form"`  → columna de lectura. Un formulario de ajustes a 1280 px deja
 *                  el conmutador a medio metro de su etiqueta.
 * `kind="table"` → ancho, que es lo que necesita un catálogo con columnas.
 *
 * Es la decisión que hace que 62 páginas no parezcan 62 productos.
 * ════════════════════════════════════════════════════════════════════════════
 */
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/SettingsLayout';
import { PageContainer, PageHeader } from '@/components/kit';

export function SettingsPageShell({
  title,
  subtitle,
  icon,
  actions,
  badges,
  /** Título de la barra lateral de Configuración. Por defecto, el de la página. */
  navTitle,
  kind = 'form',
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  badges?: React.ReactNode;
  navTitle?: string;
  kind?: 'form' | 'table';
  children: React.ReactNode;
}) {
  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={navTitle ?? title}>
        <PageContainer width={kind === 'table' ? 'wide' : 'default'}>
          <PageHeader
            icon={icon}
            title={title}
            subtitle={subtitle}
            actions={actions}
            badges={badges}
          />
          {children}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}

export default SettingsPageShell;
