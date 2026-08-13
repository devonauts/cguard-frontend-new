import { Puzzle, Info } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { PageContainer, PageHeader, Section, Stagger, StatusBadge } from "@/components/kit";
import IntegrationCard from "./IntegrationCard";

const INTEGRATIONS = [
    { image: "https://app.guardspro.com/assets/icons/custom/logo-qb.png", title: "QuickBooks", subtitle: "QuickBooks Online", slug: "quickbooks-online", active: true },
    { image: "https://app.guardspro.com/assets/icons/custom/adpworkforcenow.png", title: "ADP Workforce Now", subtitle: "ADP Workforce Now CSV", slug: "adp-workforce-now", active: false },
    { image: "https://app.guardspro.com/assets/icons/custom/paychex_logo.png", title: "Paychex", subtitle: "Paychex CSV", slug: "paychex-csv", active: false },
    { image: "https://app.guardspro.com/assets/icons/custom/gusto_logo.png", title: "Gusto", subtitle: "Gusto CSV", slug: "gusto-csv", active: false },
    { image: "https://app.guardspro.com/assets/icons/custom/xero_logo.png", title: "Xero", subtitle: "Xero (Reino Unido)", slug: "xero-uk", active: false },
    { image: "https://app.guardspro.com/assets/icons/custom/xero_logo.png", title: "Xero", subtitle: "Xero (AU)", slug: "xero-au", active: false },
    { image: "https://app.guardspro.com/assets/icons/custom/adp.svg", title: "ADP Run", subtitle: "ADP Run CSV", slug: "adp-run-csv", active: false },
    { image: "https://app.guardspro.com/assets/icons/custom/square_payroll_logo_light.png", title: "Square", subtitle: "Square", slug: "square-payroll", active: false },
];

export default function IntegrationsList() {
    const conectadas = INTEGRATIONS.filter((it) => it.active).length;

    return (
        <AppLayout>
            <SettingsLayout navKey="configuracion" title="Integraciones">
                <PageContainer width="wide">
                    <PageHeader
                        icon={<Puzzle />}
                        title="Integraciones"
                        subtitle="Conecta C-Guard Pro con tus herramientas de nómina y contabilidad."
                        badges={
                            <>
                                <StatusBadge tone={conectadas ? "ok" : "neutral"}>
                                    {conectadas} conectada{conectadas === 1 ? "" : "s"}
                                </StatusBadge>
                                <StatusBadge tone="neutral" dot={false}>
                                    {INTEGRATIONS.length} disponibles
                                </StatusBadge>
                            </>
                        }
                    />

                    <Section title="Cómo funcionan" icon={<Info />}>
                        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                            Al conectar una herramienta de nómina o contabilidad, las horas trabajadas y los datos del
                            personal viajan solos y dejas de exportarlos a mano. Elige la que usa tu empresa para ver
                            sus requisitos y activarla.
                        </p>
                    </Section>

                    <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {INTEGRATIONS.map((it) => (
                            <IntegrationCard
                                key={`${it.title}-${it.subtitle}`}
                                image={it.image}
                                title={it.title}
                                subtitle={it.subtitle}
                                active={it.active}
                                href={`/setting/integracion/${it.slug}`}
                            />
                        ))}
                    </Stagger>
                </PageContainer>
            </SettingsLayout>
        </AppLayout>
    );
}
