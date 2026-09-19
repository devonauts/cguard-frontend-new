import { useTranslation } from "react-i18next";
import { Radio } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { PageContainer, PageHeader } from "@/components/kit";
import RadioChannelsManager from "@/components/radio/RadioChannelsManager";

/**
 * Radio › Canales — quién habla con quién.
 *
 * Tiene página propia, hermana de «Despacho» y «Radios IP», y no una sección
 * escondida dentro del pase de novedades: un canal no es parte del pase. El
 * pase es una rutina que se corre; un canal es cómo está repartida la radio de
 * la empresa, y se toca cuando cambia la operación, no cada turno.
 */
export default function RadioChannels() {
  const { t } = useTranslation();

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<Radio />}
          subtitle={t(
            "radio.channels.subtitle",
            "Define quién entra a cada canal: por estación, por rol o por persona.",
          )}
          title={t("radio.channels.title", "Radio · Canales")}
        />
        <RadioChannelsManager />
      </PageContainer>
    </AppLayout>
  );
}
