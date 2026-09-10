import React, { createContext, useContext, useMemo, useState } from "react";

export type SelectedClient = {
  id: string;
  name: string;
  [key: string]: any;
} | null;

interface ClientSelectionContextProps {
  selectedClient: SelectedClient;
  setSelectedClient: (client: SelectedClient) => void;
}

const ClientSelectionContext = createContext<
  ClientSelectionContextProps | undefined
>(undefined);

export const ClientSelectionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [selectedClient, setSelectedClient] = useState<SelectedClient>(null);
  // Memoize so consumers only re-render when the selection actually changes
  // (setSelectedClient is a stable setter). Prevents broad re-renders across
  // client pages on every provider render.
  const value = useMemo(
    () => ({ selectedClient, setSelectedClient }),
    [selectedClient],
  );

  return (
    <ClientSelectionContext.Provider value={value}>
      {children}
    </ClientSelectionContext.Provider>
  );
};

export function useClientSelection() {
  const ctx = useContext(ClientSelectionContext);

  if (!ctx)
    throw new Error(
      "useClientSelection must be used within ClientSelectionProvider",
    );

  return ctx;
}
