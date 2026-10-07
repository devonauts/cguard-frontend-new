"use client";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
  /** Texto de la pestaña de invitar. El del vigilante dice «SMS o correo»; el
   *  supervisor sólo se invita por correo. */
  inviteLabel?: string;
};

export function GuardTabsHeader({
  value,
  onValueChange,
  children,
  inviteLabel,
}: Props) {
  const { t } = useTranslation();

  return (
    <Tabs className="w-full" value={value} onValueChange={onValueChange}>
      <div className="sticky top-0 z-10 backdrop-blur">
        <TabsList className="h-auto w-full justify-start gap-1 mt-5 overflow-x-auto border-b bg-transparent p-0">
          <TabsTrigger
            className=" px-4 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary"
            value="invite"
          >
            {inviteLabel ?? t("guards.tabs.invite")}
          </TabsTrigger>
          {/* <TabsTrigger value="join_code" className=" px-4 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary">
            Unirse por Código
          </TabsTrigger>
          <TabsTrigger value="invite_link" className=" px-4 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary">
            Invitar Usando Enlace
          </TabsTrigger>*/}
          <TabsTrigger
            className=" px-4 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary"
            value="create_profile"
          >
            {t("guards.tabs.create_profile")}
          </TabsTrigger>
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
