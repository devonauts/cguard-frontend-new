import { Cog, Power, ArrowLeft, Puzzle, Plug, ListChecks, ClipboardCheck, Info } from "lucide-react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { INTEGRATIONS } from "./integrations.data";
import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "../../../../layouts/SettingsLayout";
import { PageContainer, PageHeader, Section, StatusBadge } from "@/components/kit";

function DetailSection({ title, icon, items }: { title: string; icon: React.ReactNode; items?: string[] }) {
    if (!items?.length) return null;
    return (
        <Section title={title} icon={icon}>
            <ul className="space-y-2">
                {items.map((t, i) => (
                    <li key={i} className="flex gap-2.5 text-sm" style={{ color: "var(--ink-soft)" }}>
                        <span
                            aria-hidden
                            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: "var(--brand)" }}
                        />
                        <span className="min-w-0">{t}</span>
                    </li>
                ))}
            </ul>
        </Section>
    );
}

export default function IntegrationDetail() {
    const { slug } = useParams<{ slug: string }>();

    const data = slug ? INTEGRATIONS[slug] : undefined;

    if (!data) {
        return <Navigate to="/setting/integraciones" replace />;
    }

    return (
        <AppLayout>
            <SettingsLayout navKey="configuracion" title="Integraciones">
                <PageContainer width="wide">
                    <PageHeader
                        icon={<Puzzle />}
                        title={data.name}
                        subtitle={data.headline ?? `Conexión con ${data.name}`}
                        badges={
                            <StatusBadge tone={data.enabled ? "ok" : "neutral"}>
                                {data.enabled ? "Conectada" : "Sin conectar"}
                            </StatusBadge>
                        }
                        actions={
                            <>
                                <Button variant="ghost" size="sm" asChild>
                                    <Link to="/setting/integraciones" aria-label="Volver a integraciones">
                                        <ArrowLeft className="h-4 w-4" />
                                        Volver
                                    </Link>
                                </Button>
                                {data.enabled ? (
                                    <>
                                        <Button variant="outline" className="gap-2">
                                            <Cog className="h-4 w-4" />
                                            Ajustes
                                        </Button>
                                        <Button variant="destructive" className="gap-2">
                                            <Power className="h-4 w-4" />
                                            Desconectar
                                        </Button>
                                    </>
                                ) : (
                                    <Button variant="brand" className="gap-2">
                                        <Power className="h-4 w-4" />
                                        Conectar
                                    </Button>
                                )}
                            </>
                        }
                    />

                    <Section title="Proveedor" icon={<Plug />}>
                        <div className="flex flex-wrap items-center gap-4">
                            <div
                                className={`glass-flat flex h-16 w-40 shrink-0 items-center justify-center p-3 ${data.enabled ? "glass-brand" : ""}`}
                            >
                                <img
                                    src={data.logo}
                                    alt={data.name}
                                    className="max-h-full max-w-full object-contain"
                                />
                            </div>
                            <p className="min-w-0 flex-1 text-sm" style={{ color: "var(--ink-soft)" }}>
                                {data.enabled
                                    ? "Esta conexión está activa. Puedes ajustarla o desconectarla cuando quieras."
                                    : "Revisa los requisitos antes de conectar. Nada se envía hasta que la actives."}
                            </p>
                        </div>
                    </Section>

                    <DetailSection title="Qué hace" icon={<ListChecks />} items={data.features} />
                    <DetailSection title="Qué necesitas" icon={<ClipboardCheck />} items={data.requirements} />
                    <DetailSection title="Antes de empezar" icon={<Info />} items={data.notes} />
                </PageContainer>
            </SettingsLayout>
        </AppLayout>
    );
}
