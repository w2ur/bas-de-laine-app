"use client";

import { createContext, useContext, useState, useCallback } from "react";

type Mode = "SPEND" | "FILL";

interface QuickSpendState {
  isOpen: boolean;
  envelopeId: string | null;
  mode: Mode;
}

interface QuickSpendContextValue extends QuickSpendState {
  /** Open the sheet. Call it from the tap handler itself (see primeTouchKeyboard). */
  open: (envelopeId: string | null, mode?: Mode) => void;
  /** Change the envelope (and mode) of the already-open sheet. */
  select: (envelopeId: string, mode: Mode) => void;
  close: () => void;
  setMode: (mode: Mode) => void;
}

/**
 * iOS raises the keyboard only for a focus made inside the tap that asked for
 * it, and the sheet's amount field mounts after that tap has returned. Focusing
 * a throwaway field now keeps the keyboard up; the sheet then moves focus to
 * the amount and removes it (`releaseKeyboardProxy`).
 */
const KEYBOARD_PROXY_ID = "quick-spend-keyboard-proxy";

function primeTouchKeyboard() {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;
  releaseKeyboardProxy();
  const proxy = document.createElement("input");
  proxy.id = KEYBOARD_PROXY_ID;
  proxy.setAttribute("inputmode", "decimal");
  proxy.setAttribute("aria-hidden", "true");
  proxy.tabIndex = -1;
  proxy.style.cssText = "position:fixed;top:0;left:0;opacity:0;height:0;font-size:16px;";
  document.body.appendChild(proxy);
  proxy.focus();
}

export function releaseKeyboardProxy() {
  document.getElementById(KEYBOARD_PROXY_ID)?.remove();
}

const QuickSpendContext = createContext<QuickSpendContextValue | null>(null);

export function QuickSpendProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<QuickSpendState>({
    isOpen: false,
    envelopeId: null,
    mode: "SPEND",
  });

  const open = useCallback((envelopeId: string | null, mode: Mode = "SPEND") => {
    primeTouchKeyboard();
    setState((s) => ({ ...s, isOpen: true, envelopeId, mode }));
  }, []);

  const select = useCallback((envelopeId: string, mode: Mode) => {
    setState((s) => ({ ...s, envelopeId, mode }));
  }, []);

  const close = useCallback(() => {
    releaseKeyboardProxy();
    setState((s) => ({ ...s, isOpen: false }));
  }, []);

  const setMode = useCallback((mode: Mode) => {
    setState((s) => ({ ...s, mode }));
  }, []);

  return (
    <QuickSpendContext.Provider
      value={{ ...state, open, select, close, setMode }}
    >
      {children}
    </QuickSpendContext.Provider>
  );
}

export function useQuickSpend() {
  const ctx = useContext(QuickSpendContext);
  if (!ctx) throw new Error("useQuickSpend must be used within QuickSpendProvider");
  return ctx;
}
