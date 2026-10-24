"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import { useSwUpdate } from "@/hooks/use-sw-update";

// BeforeInstallPromptEvent is not in the standard TypeScript DOM lib yet.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Detects iOS Safari (which never fires beforeinstallprompt) so we can show
 * custom "Add to Home Screen" instructions instead.
 *
 * Detection runs lazily on first render (client-only) and is stable: user
 * agent and standalone status do not change within a session.
 */
function detectIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIosDevice = /iphone|ipad|ipod/i.test(ua);
  // Chrome on iOS reports "CriOS", Firefox reports "FxiOS" — they do not
  // support PWA install. We only show the banner for Mobile Safari.
  const isSafari = /^((?!chrome|crios|fxios|android).)*safari/i.test(ua);
  const isStandalone =
    "standalone" in navigator &&
    (navigator as Navigator & { standalone: boolean }).standalone;
  return isIosDevice && isSafari && !isStandalone;
}

/**
 * PwaManager mounts in the root layout to handle:
 * 1. SW update toast (controllerchange → toast with reload action)
 * 2. beforeinstallprompt capture → "Install" toast with deferred prompt
 * 3. iOS Add-to-Home-Screen instructions banner (Safari share-sheet)
 */
export function PwaManager() {
  // SW update toast
  useSwUpdate();

  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);
  // Stable detection: user agent does not change within a session.
  const isIos = useMemo(() => detectIosSafari(), []);

  // Capture beforeinstallprompt for Android / Chrome desktop
  useEffect(() => {
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;

      toast("Installer l'application", {
        description: "Accédez rapidement à votre budget depuis l'écran d'accueil.",
        duration: 12000,
        action: {
          label: "Installer",
          onClick: async () => {
            const prompt = deferredPrompt.current;
            if (!prompt) return;
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === "accepted") {
              deferredPrompt.current = null;
            }
          },
        },
      });
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  // Show iOS banner after a short delay so it does not appear on every visit
  useEffect(() => {
    if (!isIos) return;

    const DISMISSED_KEY = "pwa-ios-banner-dismissed";
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    const timer = setTimeout(() => setShowIosBanner(true), 3000);
    return () => clearTimeout(timer);
  }, [isIos]);

  if (!showIosBanner) return null;

  return (
    <IosBanner
      onDismiss={() => {
        setShowIosBanner(false);
        sessionStorage.setItem("pwa-ios-banner-dismissed", "1");
      }}
    />
  );
}

interface IosBannerProps {
  onDismiss: () => void;
}

function IosBanner({ onDismiss }: IosBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] inset-x-3 z-50 rounded-2xl border bg-card shadow-lg p-4 md:hidden"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-primary/10 p-2">
          {/* Share / upload icon */}
          <svg
            className="size-5 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug">
            Installer Bas de Laine
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Appuyez sur{" "}
            <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
              Partager
              {/* iOS share icon inline */}
              <svg
                className="size-3 inline"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="icône Partager"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </span>{" "}
            puis{" "}
            <span className="font-medium text-foreground">
              « Sur l&apos;écran d&apos;accueil »
            </span>{" "}
            pour installer l&apos;application.
          </p>
        </div>

        <button
          onClick={onDismiss}
          className="shrink-0 rounded-full p-1 hover:bg-muted transition-colors"
          aria-label="Fermer"
        >
          <svg
            className="size-4 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
