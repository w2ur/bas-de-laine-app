"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface TransferContextValue {
  isOpen: boolean;
  sourceId: string | null;
  open: (sourceId: string) => void;
  close: () => void;
}

const TransferContext = createContext<TransferContextValue | null>(null);

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);

  const open = useCallback((id: string) => {
    setSourceId(id);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSourceId(null);
  }, []);

  return (
    <TransferContext.Provider value={{ isOpen, sourceId, open, close }}>
      {children}
    </TransferContext.Provider>
  );
}

export function useTransfer() {
  const ctx = useContext(TransferContext);
  if (!ctx) throw new Error("useTransfer must be used within TransferProvider");
  return ctx;
}
