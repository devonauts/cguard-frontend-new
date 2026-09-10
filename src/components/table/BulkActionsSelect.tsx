import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export type BulkAction = {
  value: string;
  label: string;
};

type BulkActionsSelectProps = {
  actions: BulkAction[];
  onChange: (value: string) => void;
};

export function BulkActionsSelect({
  actions,
  onChange,
}: BulkActionsSelectProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string | undefined>(undefined);

  const handleChange = (v: string) => {
    setValue(v);
    onChange(v);
    // Reset visual selection shortly after change so placeholder reappears
    setTimeout(() => setValue(undefined), 0);
  };

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="cg-input h-9 w-full md:w-44">
        <SelectValue
          placeholder={t("actions.action") || t("postSites.action") || "Action"}
        />
      </SelectTrigger>
      <SelectContent>
        {actions.map((a) => (
          <SelectItem key={a.value} value={a.value}>
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
