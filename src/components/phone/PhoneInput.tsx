import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getTenantCountry } from "@/utils/tenantLocation";
import { paisConocido, paisDelVisitante } from "@/lib/paisDelVisitante";
import { cn } from "@/lib/utils";
import "./PhoneInput.css";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * THE PHONE FIELD — one for the whole CRM
 *
 * One box: the country (flag + dialling code) and the number, together.
 * Nobody has to pick a country: it starts where the person is — the number
 * already typed, the company's country inside the app, else the IP country,
 * the browser's region and the device's time zone. Picking one by hand is
 * still possible, and pasting "+593 99 123 4567" switches to it by itself.
 * The value is always E.164 ("+593991234567"), or "" when empty.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type Country = { code: string; name: string; dialCode: string; flag: string };

const TODOS = getCountries();

function bandera(code: string): string {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function esPais(c: unknown): c is CountryCode {
  return typeof c === "string" && (TODOS as string[]).includes(c.toUpperCase());
}

function paisDelValor(value: string): CountryCode | null {
  if (!value || !value.startsWith("+")) return null;
  try {
    return (parsePhoneNumberFromString(value)?.country as CountryCode) ?? null;
  } catch {
    return null;
  }
}

function paisInicial(value: string, preferido?: string): CountryCode {
  const candidatos = [paisDelValor(value), preferido, getTenantCountry(), paisConocido()];
  for (const c of candidatos) {
    const code = String(c || "").toUpperCase();
    if (esPais(code)) return code as CountryCode;
  }
  return "US";
}

function digitos(s: string): string {
  return s.replace(/\D/g, "");
}

type PhoneInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onCountryChange?: (country: Country) => void;
  /** Optional cap on the national digits. */
  maxLocalDigits?: number;
  /** Kept for compatibility; the list is searchable, so it is not needed. */
  maxCountries?: number;
  /** ISO-2 to start with (e.g. "ES"); wins over detection. */
  defaultCountry?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function PhoneInput({
  value,
  onChange,
  placeholder,
  onCountryChange,
  maxLocalDigits,
  defaultCountry,
  disabled,
  id,
  className,
}: PhoneInputProps) {
  const { t, i18n } = useTranslation();
  const [pais, setPais] = useState<CountryCode>(() => paisInicial(value ?? "", defaultCountry));
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const elegidoAMano = useRef(false);
  const entrada = useRef<HTMLInputElement>(null);

  const nombres = useMemo(() => {
    try {
      return new Intl.DisplayNames([i18n.language || "es"], { type: "region" });
    } catch {
      return null;
    }
  }, [i18n.language]);
  const nombre = (c: string) => nombres?.of(c) ?? c;
  const aPais = (c: CountryCode): Country => ({
    code: c, name: nombre(c), dialCode: getCountryCallingCode(c), flag: bandera(c),
  });

  // Tell the parent the starting country once.
  useEffect(() => { onCountryChange?.(aPais(pais)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Nothing typed and nobody chose: move to the IP country when it arrives. */
  useEffect(() => {
    if (value || defaultCountry || getTenantCountry()) return;
    let vivo = true;
    void paisDelVisitante().then((c) => {
      if (!vivo || !c || elegidoAMano.current || !esPais(c)) return;
      setPais(c as CountryCode);
      onCountryChange?.(aPais(c as CountryCode));
    });
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* A full number coming from outside (loaded record, paste) sets the flag. */
  useEffect(() => {
    const c = paisDelValor(value ?? "");
    if (c && c !== pais) {
      setPais(c);
      onCountryChange?.(aPais(c));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const codigo = getCountryCallingCode(pais);

  /* What the box shows: the national number, formatted as people write it. */
  const nacional = useMemo(() => {
    const v = value ?? "";
    if (!v) return "";
    const d = digitos(v);
    const resto = v.startsWith("+") && d.startsWith(codigo) ? d.slice(codigo.length) : d;
    // A complete number reads the way it is written in its country (099 123 4567);
    // while typing, as-you-type formatting.
    try {
      const p = parsePhoneNumberFromString(v);
      if (p && p.isValid()) return p.formatNational();
    } catch { /* incomplete: fall through */ }
    return new AsYouType(pais).input(resto);
  }, [value, pais, codigo]);

  const ejemplo = useMemo(() => {
    try {
      return getExampleNumber(pais, examples as any)?.formatNational() ?? "";
    } catch {
      return "";
    }
  }, [pais]);

  const emitir = (c: CountryCode, nacionalCrudo: string) => {
    const d = digitos(nacionalCrudo).replace(/^0+/, "");
    onChange(d ? `+${getCountryCallingCode(c)}${d}` : "");
  };

  const alEscribir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const crudo = e.target.value;
    // Typed or pasted with its own "+code": that decides the country.
    if (crudo.trim().startsWith("+")) {
      const p = (() => { try { return parsePhoneNumberFromString(crudo); } catch { return undefined; } })();
      if (p?.country) {
        elegidoAMano.current = true;
        setPais(p.country);
        onCountryChange?.(aPais(p.country));
        onChange(p.number);
        return;
      }
    }
    const tope = maxLocalDigits ?? 15;
    if (digitos(crudo).length > tope) return;
    emitir(pais, crudo);
  };

  const elegir = (c: CountryCode) => {
    elegidoAMano.current = true;
    setPais(c);
    onCountryChange?.(aPais(c));
    emitir(c, nacional);
    setAbierto(false);
    setBusqueda("");
    window.setTimeout(() => entrada.current?.focus(), 0);
  };

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase().replace(/^\+/, "");
    const todos = TODOS.map((c) => ({ c, n: nombre(c), d: getCountryCallingCode(c) }))
      .sort((a, b) => a.n.localeCompare(b.n, i18n.language || "es"));
    if (!q) return todos;
    return todos.filter((x) => x.n.toLowerCase().includes(q) || x.c.toLowerCase() === q || x.d.startsWith(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, nombres]);

  return (
    <div className={cn("cg-phone", disabled && "cg-phone--off", className)}>
      <Popover open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) setBusqueda(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="cg-phone__pais"
            disabled={disabled}
            aria-label={t("ui.PhoneInput.cambiarPais", { defaultValue: "Cambiar país ({{pais}})", pais: nombre(pais) })}
          >
            <span className="cg-phone__bandera" aria-hidden>{bandera(pais)}</span>
            <span className="cg-phone__codigo">+{codigo}</span>
            <ChevronDown className="cg-phone__flecha" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="cg-phone__menu p-0">
          <div className="cg-phone__buscar">
            <Search className="h-4 w-4 opacity-60" aria-hidden />
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t("ui.PhoneInput.buscarPais", { defaultValue: "Buscar país o código" })}
            />
          </div>
          <ul className="cg-phone__lista" role="listbox">
            {lista.length === 0 && (
              <li className="cg-phone__vacio">{t("ui.PhoneInput.noSeEncontraronPaises", { defaultValue: "No se encontraron países." })}</li>
            )}
            {lista.map(({ c, n, d }) => (
              <li key={c}>
                <button type="button" role="option" aria-selected={c === pais} className="cg-phone__opcion" onClick={() => elegir(c)}>
                  <span className="cg-phone__bandera" aria-hidden>{bandera(c)}</span>
                  <span className="cg-phone__nombre">{n}</span>
                  <span className="cg-phone__marcado">+{d}</span>
                  <Check className={cn("h-3.5 w-3.5", c === pais ? "opacity-100" : "opacity-0")} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <input
        ref={entrada}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className="cg-phone__numero"
        disabled={disabled}
        placeholder={placeholder ?? ejemplo}
        value={nacional}
        onChange={alEscribir}
      />
    </div>
  );
}

export default PhoneInput;
