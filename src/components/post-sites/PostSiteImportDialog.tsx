import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { postSiteService } from "@/lib/api/postSiteService";
import { clientService } from "@/lib/api/clientService";
import { Upload, FileSpreadsheet } from "lucide-react";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function PostSiteImportDialog({ open, onOpenChange, onSuccess }: ImportDialogProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoCreateClients, setAutoCreateClients] = useState<boolean>(true);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);

  const requiredHeaders = [
    "clientName",
    "clientLastName",
    "clientEmail",
    "siteName",
    "address",
    "postalCode",
    "city",
    "country",
    "contactPhone",
    "contactEmail",
    "description",
  ];

  // Spanish -> English header aliases for site fields only. Do NOT map client-* headers to Spanish terms.
  const headerAliases: Record<string, string> = {
    // site name
    'sitio': 'siteName', 'nombresitio': 'siteName', 'sitename': 'siteName',
    // address
    'direccion': 'address', 'direccion1': 'address', 'direccion2': 'address',
    // postal
    'codigopostal': 'postalCode', 'postalcode': 'postalCode', 'postal': 'postalCode', 'zipcode': 'postalCode',
    // city/country
    'ciudad': 'city', 'pais': 'country',
    // contact
    'telefonocontacto': 'contactPhone', 'telefono_contacto': 'contactPhone', 'contactphone': 'contactPhone',
    'emailcontacto': 'contactEmail', 'contactemail': 'contactEmail',
    // description
    'descripcion': 'description', 'descripciondelservicio': 'description'
  };

  function normalizeHeaders(headers: string[]) {
    const map: Record<string, string> = {};
    const mapped: string[] = headers.map((h) => {
      const raw = String(h || '').trim();
      // support bilingual headers like "clientName/NombreCliente" => prefer left side (English) for mapping
      const primary = raw.split(/[\/|]/)[0].trim();
      const key = primary.toLowerCase().replace(/\s+/g, '');

      // Preserve and normalize client-* headers; accept case-insensitive variants but require 'client' prefix
      if (key.startsWith('client')) {
        if (key.includes('id')) {
          map[raw] = 'clientId';
          return 'clientId';
        }
        if (key.includes('email') || key.includes('correo')) {
          map[raw] = 'clientEmail';
          return 'clientEmail';
        }
        if (key.includes('last') || key.includes('apellido')) {
          map[raw] = 'clientLastName';
          return 'clientLastName';
        }
        if (key.includes('phone') || key.includes('telefono')) {
          map[raw] = 'clientPhone';
          return 'clientPhone';
        }
        if (key.includes('name') || key.includes('nombre')) {
          map[raw] = 'clientName';
          return 'clientName';
        }
        // unknown client field - keep as-is
        map[raw] = raw;
        return raw;
      }

      // Map Spanish/alias site headers to internal names
      // If the primary token already matches a required header (english canonical), map directly.
      const canonicalFromRequired = requiredHeaders.find(r => r.toLowerCase() === key);
      if (canonicalFromRequired) {
        map[raw] = canonicalFromRequired;
        return canonicalFromRequired;
      }

      if (headerAliases[key]) {
        map[raw] = headerAliases[key];
        return headerAliases[key];
      }

      // Also allow matching by primary token even if original header contained a slash
      if (headerAliases[primary.toLowerCase().replace(/\s+/g, '')]) {
        const ali = headerAliases[primary.toLowerCase().replace(/\s+/g, '')];
        map[raw] = ali;
        return ali;
      }

      // Default: keep original header
      map[raw] = raw;
      return raw;
    });
    return { mapped, map };
  }

  function downloadTemplate() {
    // Bilingual headers (English/Spanish) in the first row. Keep client* prefixes to make client fields explicit.
    const csvContent = `clientName/NombreCliente,clientLastName/ApellidoCliente,clientEmail/CorreoCliente,clientPhone/TelefonoCliente,siteName/NombreSitio,address/Direccion,postalCode/CodigoPostal,city/Ciudad,country/Pais,contactPhone/TelefonoContacto,contactEmail/EmailContacto,description/Descripcion\nEjemplo Cliente/Cliente Ejemplo,EjemploApellido/Apellido Ejemplo,cliente@ejemplo.com/cliente@ejemplo.com,+593987654321/+593987654321,Ejemplo Sitio/Sitio Ejemplo,Calle Falsa 123/Calle Falsa 123,170123/170123,Quito/Quito,Ecuador/Ecuador,+593987654321/+593987654321,contacto@ejemplo.com/contacto@ejemplo.com,Descripción del sitio/Descripción del sitio`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-sitios-bilingue.csv';
    link.click();
    window.URL.revokeObjectURL(url);
    toast.success("Plantilla descargada");
  }

  async function handleImport() {
    if (!file) {
      toast.error("Selecciona un archivo");
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Procesando archivo...");
    try {
      // If file is CSV and user enabled auto-creation, preprocess to ensure clientId present
      let fileToUpload: File = file;
      const isCSV = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
      if (isCSV && autoCreateClients) {
        try {
          const text = await file.text();
          let parsed = parseCSV(text);
          // normalize headers and remap rows keys to normalized names
          const { mapped: normalizedHeaders, map: headerMap } = normalizeHeaders(parsed.headers);
          const remappedRows = parsed.rows.map((r) => {
            const nr: Record<string, string> = {};
            for (const orig of parsed.headers) {
              const mappedName = headerMap[orig] || orig;
              nr[mappedName] = r[orig] ?? '';
            }
            return nr;
          });
          parsed = { headers: normalizedHeaders, rows: remappedRows };
          if (parsed.headers.includes('clientId')) {
            // nothing to do
          } else {
            // attempt to resolve or create clients for each row
            for (let i = 0; i < parsed.rows.length; i++) {
              const row = parsed.rows[i];
              // Prefer explicit client fields: clientId, clientEmail, clientName, companyName
              const explicitClientId = row['clientId'] || row['clientid'] || row['client_id'];
              const clientEmail = row['clientEmail'] || row['clientemail'] || row['client_email'];
              const clientPhone = row['clientPhone'] || row['clientphone'] || row['client_phone'] || row['phone'] || row['phoneNumber'];
              const clientLastName = row['clientLastName'] || row['clientlastname'] || row['client_lastname'] || row['lastName'] || row['lastname'] || row['apellido'];
              const clientName = row['clientName'] || row['clientname'] || row['client'] || row['companyName'];
              let resolvedId: string | undefined = undefined;

              if (explicitClientId) {
                resolvedId = explicitClientId;
              }

              if (!resolvedId && clientEmail) {
                // try to find by client email
                try {
                  const found = await clientService.getClients({ email: clientEmail });
                  if (found && (found as any).rows && (found as any).rows.length > 0) {
                    resolvedId = (found as any).rows[0].id;
                  }
                } catch (e) {
                  // ignore and continue
                }
              }

              if (!resolvedId && clientPhone) {
                try {
                  const foundByPhone = await clientService.getClients({ phoneNumber: clientPhone });
                  if (foundByPhone && (foundByPhone as any).rows && (foundByPhone as any).rows.length > 0) {
                    resolvedId = (foundByPhone as any).rows[0].id;
                  }
                } catch (e) {
                  // ignore
                }
              }
              // try to resolve by client last name if provided
              if (!resolvedId && clientLastName) {
                try {
                  const foundByLast = await clientService.getClients({ lastName: clientLastName });
                  if (foundByLast && (foundByLast as any).rows && (foundByLast as any).rows.length > 0) {
                    resolvedId = (foundByLast as any).rows[0].id;
                  }
                } catch (e) {
                  // ignore
                }
              }

              // try to resolve by full client name (handles name + lastName stored in `name` field or full name search)
              if (!resolvedId && clientName) {
                try {
                  const foundByName = await clientService.getClients({ name: clientName });
                  if (foundByName && (foundByName as any).rows && (foundByName as any).rows.length > 0) {
                    resolvedId = (foundByName as any).rows[0].id;
                  }
                } catch (e) {
                  // ignore
                }
              }

              if (!resolvedId && (clientEmail || clientName || clientPhone || clientLastName)) {
                // create a minimal client record using available client-specific fields only
                try {
                  // split clientName into name and lastName if possible
                  // prefer explicit clientLastName if provided, otherwise split clientName
                  const nameParts = (clientName || '').trim().split(/\s+/).filter(Boolean);
                  const firstName = nameParts.length > 0 ? nameParts[0] : undefined;
                  const splitLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
                  const payload: any = {
                    name: firstName || clientEmail || clientPhone || 'Cliente importado',
                    email: clientEmail || undefined,
                    phoneNumber: clientPhone || undefined,
                  };
                  const finalLastName = clientLastName || splitLastName;
                  if (finalLastName) payload.lastName = finalLastName;

                  const created = await clientService.createClient(payload);
                  resolvedId = created.id;
                } catch (e) {
                  // if creation fails, leave undefined and let backend handle (or mark row failed)
                  console.error('Error creando cliente durante import:', e);
                }
              }

              // inject clientId into row (leave empty string if unresolved so backend can decide)
              parsed.rows[i]['clientId'] = resolvedId ?? '';
            }

            // rebuild CSV with clientId as first column
            const newCsv = buildCSVWithClientId(parsed);
            fileToUpload = new File([newCsv], file.name, { type: 'text/csv' });
          }
        } catch (e) {
          console.warn('No se pudo preprocesar CSV para auto-creación de clientes:', e);
        }
      } else if (!isCSV && autoCreateClients) {
        // Try to dynamically import xlsx and preprocess XLSX files in-browser
        try {
          const mod = await import('xlsx');
          const XLSX = (mod && (mod as any).default) ? (mod as any).default : mod;
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const sheetRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          const headersRaw = (sheetRows[0] || []).map((h: any) => String(h).trim());
          const rows = sheetRows.slice(1).map((r) => {
            const obj: Record<string, string> = {};
            headersRaw.forEach((h: string, i: number) => {
              obj[h] = r[i] ?? '';
            });
            return obj;
          });

          // normalize headers and remap rows keys
          const { mapped: normalizedHeaders, map: headerMap } = normalizeHeaders(headersRaw);
          const remappedRows = rows.map((r) => {
            const nr: Record<string, string> = {};
            for (const orig of headersRaw) {
              const mappedName = headerMap[orig] || orig;
              nr[mappedName] = r[orig] != null ? String(r[orig]) : '';
            }
            return nr;
          });

            const parsed = { headers: normalizedHeaders, rows: remappedRows };
          if (!parsed.headers.includes('clientId')) {
            for (let i = 0; i < parsed.rows.length; i++) {
              const row = parsed.rows[i];
              // Prefer explicit client fields: clientId, clientEmail, clientPhone, clientLastName, clientName
              const explicitClientId = row['clientId'] || row['clientid'] || row['client_id'];
              const clientEmail = row['clientEmail'] || row['clientemail'] || row['client_email'];
              const clientPhone = row['clientPhone'] || row['clientphone'] || row['client_phone'] || row['phone'] || row['phoneNumber'];
              const clientLastName = row['clientLastName'] || row['clientlastname'] || row['client_lastname'] || row['lastName'] || row['lastname'] || row['apellido'];
              const clientName = row['clientName'] || row['clientname'] || row['client'] || row['companyName'];
              let resolvedId: string | undefined = undefined;

              if (explicitClientId) resolvedId = explicitClientId;

              if (!resolvedId && clientEmail) {
                try {
                  const found = await clientService.getClients({ email: clientEmail });
                  if (found && (found as any).rows && (found as any).rows.length > 0) {
                    resolvedId = (found as any).rows[0].id;
                  }
                } catch (e) {
                  // ignore
                }
              }

              if (!resolvedId && clientPhone) {
                try {
                  const foundByPhone = await clientService.getClients({ phoneNumber: clientPhone });
                  if (foundByPhone && (foundByPhone as any).rows && (foundByPhone as any).rows.length > 0) {
                    resolvedId = (foundByPhone as any).rows[0].id;
                  }
                } catch (e) {
                  // ignore
                }
              }

              // try to resolve by client last name if provided
              if (!resolvedId && clientLastName) {
                try {
                  const foundByLast = await clientService.getClients({ lastName: clientLastName });
                  if (foundByLast && (foundByLast as any).rows && (foundByLast as any).rows.length > 0) {
                    resolvedId = (foundByLast as any).rows[0].id;
                  }
                } catch (e) {
                  // ignore
                }
              }

              // try to resolve by full client name
              if (!resolvedId && clientName) {
                try {
                  const foundByName = await clientService.getClients({ name: clientName });
                  if (foundByName && (foundByName as any).rows && (foundByName as any).rows.length > 0) {
                    resolvedId = (foundByName as any).rows[0].id;
                  }
                } catch (e) {
                  // ignore
                }
              }

              if (!resolvedId && (clientEmail || clientName || clientPhone || clientLastName)) {
                try {
                  // prefer explicit clientLastName if provided, otherwise split clientName
                  const nameParts = (clientName || '').trim().split(/\s+/).filter(Boolean);
                  const firstName = nameParts.length > 0 ? nameParts[0] : undefined;
                  const splitLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined;
                  const payload: any = {
                    name: firstName || clientEmail || clientPhone || 'Cliente importado',
                    email: clientEmail || undefined,
                    phoneNumber: clientPhone || undefined,
                  };
                  const finalLastName = clientLastName || splitLastName;
                  if (finalLastName) payload.lastName = finalLastName;

                  const created = await clientService.createClient(payload);
                  resolvedId = created.id;
                } catch (e) {
                  console.error('Error creando cliente durante import:', e);
                }
              }

              parsed.rows[i]['clientId'] = resolvedId ?? '';
            }

            // Build an XLSX file from the parsed data (include clientAccount as first column)
            try {
              const aoa: any[][] = [];
              const normalizeOutHeader = (h: string) => {
                if (!h) return h;
                const lk = String(h).toLowerCase();
                if (lk === 'sitename' || h === 'siteName') return 'companyName';
                return h;
              };
              const filteredOut = parsed.headers.filter(h => !/^(clientid|client_account|clientaccount|client_id)$/i.test(String(h)));
              const headersOut = ['clientAccount', ...filteredOut.map(normalizeOutHeader)];
              aoa.push(headersOut);
              for (const r of parsed.rows) {
                const rowVals = headersOut.map((h) => {
                  const sourceKey = (h === 'companyName') ? (r['companyName'] != null ? 'companyName' : 'siteName') : (h === 'clientAccount' ? 'clientId' : h);
                  return String(r[sourceKey] ?? '');
                });
                aoa.push(rowVals);
              }
              const sheet = XLSX.utils.aoa_to_sheet(aoa);
              const workbookOut = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(workbookOut, sheet, 'Sheet1');
              const wbout = XLSX.write(workbookOut, { bookType: 'xlsx', type: 'array' });
              fileToUpload = new File([wbout], file.name.replace(/\.(xlsx|xls)$/i, '.xlsx'), {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              });
            } catch (e) {
              // Fallback to CSV if workbook build fails
              const newCsv = buildCSVWithClientId(parsed);
              fileToUpload = new File([newCsv], file.name.replace(/\.(xlsx|xls)$/i, '.csv'), { type: 'text/csv' });
            }
          }
        } catch (err) {
          console.warn('No se pudo procesar XLSX en el navegador (¿instalaste `xlsx`?):', err);
          toast.error('Para procesar archivos .xlsx habilita la opción e instala la dependencia `xlsx` (SheetJS).');
        }
      }

      // Debug: log the file details and allow quick inspection of the generated file
      try {
        console.log('[PostSiteImport] uploading file', { name: fileToUpload.name, type: fileToUpload.type, size: fileToUpload.size });
        if (typeof window !== 'undefined') {
          try {
            const tmpUrl = window.URL.createObjectURL(fileToUpload);
            console.log('[PostSiteImport] temporary file URL (copy to browser to download):', tmpUrl);
          } catch (e) {
            console.warn('Could not create object URL for debug file:', e);
          }
        }

        // If XLSX available, try to read back a sample to ensure it's a valid workbook
        try {
          const mod = await import('xlsx');
          const XLSXcheck = (mod && (mod as any).default) ? (mod as any).default : mod;
          const ab = await fileToUpload.arrayBuffer();
          const wb2 = XLSXcheck.read(ab, { type: 'array' });
          const sample = XLSXcheck.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 });
          console.log('[PostSiteImport] built workbook sample rows (first 5):', sample.slice(0, 5));
        } catch (e) {
          console.warn('Could not parse generated file with XLSX for debug:', e);
        }
      } catch (e) {
        console.warn('Debug logging failed:', e);
      }

      // Dump file content (CSV or XLSX) to console for debugging
      try {
        if (fileToUpload.name.toLowerCase().endsWith('.csv') || fileToUpload.type === 'text/csv') {
          const txt = await fileToUpload.text();
          console.log('[PostSiteImport] CSV content (first 20000 chars):', txt.slice(0, 20000));
        } else {
          try {
            const mod2 = await import('xlsx');
            const XLSXdbg = (mod2 && (mod2 as any).default) ? (mod2 as any).default : mod2;
            const ab2 = await fileToUpload.arrayBuffer();
            const wb3 = XLSXdbg.read(ab2, { type: 'array' });
            for (const sname of wb3.SheetNames) {
              const csvOut = XLSXdbg.utils.sheet_to_csv(wb3.Sheets[sname]);
              console.log(`[PostSiteImport] Sheet ${sname} CSV (first 20000 chars):`, csvOut.slice(0, 20000));
              const jsonOut = XLSXdbg.utils.sheet_to_json(wb3.Sheets[sname], { defval: null });
              console.log(`[PostSiteImport] Sheet ${sname} JSON (first 50 rows):`, jsonOut.slice(0, 50));
            }
          } catch (e) {
            console.warn('Could not parse generated file for full dump with XLSX:', e);
          }
        }
      } catch (e) {
        console.warn('Failed dumping file content for debug:', e);
      }

      const result = await postSiteService.import(fileToUpload);
      toast.dismiss(toastId);

      if ((result as any).success > 0) {
        toast.success(`${(result as any).success} sitios importados correctamente`);
      }
      if ((result as any).failed && (result as any).failed > 0) {
        toast.error(`${(result as any).failed} filas no se pudieron importar.`);
      }

      onSuccess();
      onOpenChange(false);
      setFile(null);
    } catch (error: any) {
      toast.dismiss(toastId);
      toast.error(error?.message || 'Error al importar');
    } finally {
      setLoading(false);
    }
  }

  // Simple CSV parser (basic, does not handle quoted commas)
  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map(h => h.trim());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",").map(v => v.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] ?? '';
      });
      return obj;
    });
    return { headers, rows };
  }

  function buildCSVWithClientId(parsed: { headers: string[]; rows: Record<string, string>[] }) {
    const normalizeOutHeader = (h: string) => {
      if (!h) return h;
      const lk = String(h).toLowerCase();
      if (lk === 'sitename' || h === 'siteName') return 'companyName';
      return h;
    };
    // Remove any existing client id/account headers to avoid duplicates; always emit `clientAccount` first
    const filtered = parsed.headers.filter(h => !/^(clientid|client_account|clientaccount|client_id)$/i.test(String(h)));
    const headers = ['clientAccount', ...filtered.map(normalizeOutHeader)];
    const lines = [headers.join(',')];
    for (const row of parsed.rows) {
      const values = headers.map(h => {
        if (h === 'clientAccount') return String(row['clientId'] ?? row['clientAccount'] ?? '').replace(/,/g, '');
        const sourceKey = (h === 'companyName') ? (row['companyName'] != null ? 'companyName' : 'siteName') : h;
        return String(row[sourceKey] ?? '').replace(/,/g, '');
      });
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Sitios desde Excel/CSV</DialogTitle>
          <DialogDescription>Sube un archivo .xlsx/.xls/.csv para importar Puestos de Vigilancia.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-dashed">
            <div className="space-y-1">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                {t('ui.PostSiteImportDialog.estructuraDeColumnasRequerida', 'Estructura de columnas requerida')}
              </h4>
              <p className="text-xs text-muted-foreground">
                Todos los campos marcados con (*) son obligatorios para la carga masiva. Para asociar cliente, proporciona `clientId` o los campos `clientName` / `clientLastName` / `clientEmail` / `clientPhone`.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                "clientName", "clientLastName", "clientEmail", "clientPhone", "siteName", "address", "postalCode", "city",
                "country", "contactPhone", "contactEmail", "description"
              ].map((col) => (
                <span key={col} className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-background border text-foreground">
                  {col} <span className="text-primary ml-1">*</span>
                </span>
              ))}
            </div>

            <Button
              variant="link"
              className="h-auto p-0 text-primary text-xs hover:no-underline"
              onClick={downloadTemplate}
            >
              ¿No tienes el archivo? Descarga la plantilla aquí
            </Button>

            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  setMissingHeaders([]);
                  if (f) {
                    const isCSV = f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv';
                    if (isCSV) {
                      try {
                        const text = await f.text();
                        const parsed = parseCSV(text);
                        // normalize headers (map Spanish site headers to English equivalents, but keep client-* headers)
                        const { mapped: normalizedHeaders } = normalizeHeaders(parsed.headers);
                        const missing = requiredHeaders.filter(h => !normalizedHeaders.map(x => String(x).toLowerCase()).includes(h.toLowerCase()));
                        if (missing.length > 0) {
                          setMissingHeaders(missing);
                          toast.error(`Faltan columnas requeridas: ${missing.join(', ')}`);
                        } else {
                          setMissingHeaders([]);
                        }
                      } catch (err) {
                        console.warn('Error validando CSV', err);
                      }
                    } else {
                      // For non-CSV we cannot validate without xlsx parser
                      setMissingHeaders([]);
                    }
                  }
                }}
                className="hidden"
                id="postsite-file-upload"
              />
              <label htmlFor="postsite-file-upload" className="cursor-pointer block">
                <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-1" />
                <p className="text-sm text-muted-foreground font-medium">{file ? file.name : "Explorar tu archivo Excel aquí...."}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('guards.list.importDialog.clickToSelect', 'Click para seleccionar')}</p>
              </label>
            </div>

            <div>
              {missingHeaders.length > 0 && (
                <div className="text-sm text-red-600 mb-2">Faltan columnas requeridas: {missingHeaders.join(', ')}</div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={handleImport} disabled={!file || loading || missingHeaders.length > 0}>{loading ? 'Importando...' : 'Importar'}</Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
