# Pendientes que fueron apareciendo (fuera del alcance de su tanda)

- `AlarmPanels.tsx` › `COMMS_LABELS` ('Celular'): misma constante congelada,
  no figuraba en ningún lote.
- Literales sueltos en JSX que ninguna tanda reclamó:
  - `AlarmPanels.tsx`: «Autoridad» (cabecera de la tabla de contactos)
  - `ExtremoRutaField.tsx`: «Opcional», «Cambiar», «Quitar», «Cancelar»,
    «Se guardará:» y los marcadores del buscador
  - `TaskTracking.tsx`: cabeceras Tarea / Puesto / Estado / Prioridad
- `/style-guide` sigue en español A PROPÓSITO: es la galería interna de
  desarrollo, no la ve ningún cliente.
- La matriz de permisos (`config/permissionLabels.ts`) sólo existe en es/en/pt;
  los otros cinco idiomas caen a INGLÉS, no a español.
