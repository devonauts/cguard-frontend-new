/**
 * The Liquid Glass pieces of the desktop-app pages (styles in `vidrio.css`,
 * scoped to `.lg-scope`). Only these two pages use them.
 */
import type { ReactNode } from "react";

import { BellRing, ShieldCheck } from "lucide-react";

import "./vidrio.css";

import { cn } from "@/lib/utils";

/** The blurred colour field behind the hero (decorative). */
export function FondoDeColor() {
  return (
    <div aria-hidden="true" className="lg-backdrop">
      <span />
      <span />
      <span />
    </div>
  );
}

export function TarjetaDeVidrio({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return <Tag className={cn("lg-card", className)}>{children}</Tag>;
}

export function SeccionDeVidrio({
  icon,
  title,
  action,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("lg-card p-5 sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="lg-h2 flex items-center gap-2.5">
          {icon ? (
            <span
              className="[&_svg]:size-[18px]"
              style={{ color: "var(--brand-text)" }}
            >
              {icon}
            </span>
          ) : null}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A tinted glass banner for states (suspended, coming soon, waiting…). */
export function AvisoDeVidrio({
  tono,
  icon,
  title,
  children,
  className,
}: {
  tono: "ok" | "warn" | "bad" | "info" | "neutral";
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "lg-row flex items-start gap-3 p-4",
        tono !== "neutral" && `lg-tint-${tono}`,
        className,
      )}
      role={tono === "bad" || tono === "warn" ? "status" : undefined}
    >
      {icon ? (
        <span
          className="mt-0.5 shrink-0 [&_svg]:size-5"
          style={{
            color:
              tono === "neutral" ? "var(--ink-soft)" : `var(--${tono}-text)`,
          }}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 text-sm">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? (
          <div
            className={title ? "mt-1" : ""}
            style={{ color: "var(--ink-soft)" }}
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The app window, drawn as glass (decorative product mock). */
export function VentanaDeMuestra({ aviso }: { aviso: string }) {
  return (
    <div aria-hidden="true" className="relative w-full max-w-[440px]">
      <div className="lg-window">
        <div className="lg-window-bar">
          <i />
          <i />
          <i />
        </div>
        <div className="lg-window-body">
          <div className="lg-window-side">
            <div className="lg-bar lg-bar-brand" style={{ width: "70%" }} />
            <div className="lg-bar" style={{ width: "85%" }} />
            <div className="lg-bar" style={{ width: "60%" }} />
            <div className="lg-bar" style={{ width: "75%" }} />
            <div className="lg-bar" style={{ width: "50%" }} />
          </div>
          <div className="lg-window-main">
            <div className="lg-tile lg-tile-wide" />
            <div className="lg-tile" />
            <div className="lg-tile" />
          </div>
        </div>
      </div>
      <div className="lg-toast">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
        >
          <BellRing className="h-4 w-4" />
        </span>
        <span>{aviso}</span>
        <ShieldCheck className="h-4 w-4" style={{ color: "var(--ok-text)" }} />
      </div>
    </div>
  );
}
