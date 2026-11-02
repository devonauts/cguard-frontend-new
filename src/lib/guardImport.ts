/**
 * The guard importer's template and its answer, kept apart from the page so
 * they can be tested (QA personal 2026-11-01, #21 #22).
 */
import type { Traductor } from "@/lib/secuenciaDeRotacion";

/**
 * The example CSV. With the UTF-8 mark first, or Excel reads «Teléfono» as
 * «TelÃ©fono»; and an example address nobody owns, so importing the template
 * as it is never creates (or later invites) a real person.
 */
export function plantillaDeVigilantes(): string {
  const encabezado =
    "Nombre,Correo,Teléfono,Estado,Cédula,Fecha Contrato,Género,Tipo Sangre,Credenciales,Fecha Nac.,Lugar Nac.,Estado Civ.,Educación,Dirección";
  const ejemplo =
    "Ana Pérez,ana.perez@example.com,+593990000000,Activo,12345678888,30/11/2025,Femenino,AB-,7878787887878usahuia,10/6/2004,Pastocalle,Casado,Universidad,Calle principal";

  return `﻿${encabezado}\n${ejemplo}`;
}

export interface ResultadoDeImportacion {
  success?: number;
  failed?: number;
  skipped?: number;
  errors?: Array<{ row?: number; name?: string; error?: string }>;
}

/**
 * What the import did, in words: how many came in, which rows did not and
 * why (they used to vanish behind «Importación completada»), and that nobody
 * was invited — the server never mails a whole file at once.
 */
export function resumenDeImportacion(
  r: ResultadoDeImportacion | null | undefined,
  t: Traductor,
): { tipo: "ok" | "aviso"; titulo: string; detalle: string } {
  const ok = Math.max(0, Number(r?.success) || 0);
  const fallidas = Math.max(0, Number(r?.failed) || 0) + Math.max(0, Number(r?.skipped) || 0);
  const errores = Array.isArray(r?.errors) ? r!.errors! : [];

  const titulo = fallidas
    ? t("guards.list.importDialog.summaryWithErrors", {
        defaultValue: "Importados: {{ok}} · Sin importar: {{fallidas}}",
        ok,
        fallidas,
      })
    : t("guards.list.importDialog.summaryOk", {
        count: ok,
        defaultValue: "{{count}} vigilantes importados",
      });
  const filas = errores.slice(0, 3).map((e) =>
    t("guards.list.importDialog.rowError", {
      defaultValue: "Fila {{fila}} ({{nombre}}): {{error}}",
      fila: e.row ?? "?",
      nombre: e.name || "—",
      error: e.error || "",
    }),
  );
  const detalle = [
    ...filas,
    ...(ok
      ? [
          t("guards.list.importDialog.invitationsNotSent", {
            defaultValue:
              "No se envió ninguna invitación: envíalas desde la lista cuando quieras.",
          }),
        ]
      : []),
  ].join("\n");

  return { tipo: fallidas ? "aviso" : "ok", titulo, detalle };
}
