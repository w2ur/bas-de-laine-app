"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { dragOutcome } from "@/lib/bottom-sheet-logic";

const MOBILE_QUERY = "(max-width: 767px)";

/** Window over which the release speed is measured; older samples are ignored. */
const VELOCITY_WINDOW_MS = 100;

/** The quick sheet's throwaway keyboard field (quick-spend-context) is never an opener. */
const KEYBOARD_PROXY_ID = "quick-spend-keyboard-proxy";

/**
 * Height the on-screen keyboard takes from the bottom of the layout viewport,
 * and the height left visible above it. A fixed bottom sheet sits behind the
 * keyboard on iOS without the inset, and `dvh` does not shrink for the
 * keyboard, so the visible height caps the sheet. Phone layout only: the
 * centred dialog must not get a bottom offset that fights its top: 50%.
 */
function useKeyboardInset(active: boolean): { inset: number; visibleHeight: number } {
  const [state, setState] = React.useState({ inset: 0, visibleHeight: 0 });
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv || !window.matchMedia(MOBILE_QUERY).matches) return;
    const update = () =>
      setState({ inset: Math.max(0, window.innerHeight - vv.height - vv.offsetTop), visibleHeight: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setState({ inset: 0, visibleHeight: 0 });
    };
  }, [active]);
  return state;
}

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Unsaved input: a backdrop tap is ignored and the first drag-dismiss snaps back. */
  dirty?: boolean;
  /** Where focus goes on open; by default the sheet itself, not its close button. */
  onOpenAutoFocus?: (event: Event) => void;
  titleClassName?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * The quick-task surface (DESIGN.md, "Bottom sheets"): anchored to the bottom
 * on a phone with a grabber, a centred dialog from 768 px. Only the grabber
 * strip and the header drag, so scrolling the content never closes it.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  dirty = false,
  onOpenAutoFocus,
  titleClassName,
  className,
  children,
}: BottomSheetProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ startY: number; samples: { y: number; t: number }[] } | null>(null);
  const warned = React.useRef(false);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  // Reset the drag offset when the sheet opens, during render rather than in
  // an effect, so the first open frame never paints a stale offset.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOffset(0);
  }
  const keyboard = useKeyboardInset(open);

  // A layout effect: it runs before Radix's focus scope (a passive effect
  // in a child) moves focus into the sheet, so the opener is still focused.
  React.useLayoutEffect(() => {
    if (!open) return;
    warned.current = false;
    // No Radix Trigger renders this sheet, so Radix has nothing to return
    // focus to on close: remember the opener here.
    const el = document.activeElement;
    returnFocus.current =
      el instanceof HTMLElement && el !== document.body && el.id !== KEYBOARD_PROXY_ID ? el : null;
  }, [open]);

  function onPointerDown(e: React.PointerEvent) {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, samples: [{ y: e.clientY, t: e.timeStamp }] };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    d.samples = d.samples.filter((s) => e.timeStamp - s.t <= VELOCITY_WINDOW_MS);
    setOffset(Math.max(0, e.clientY - d.startY));
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    // Speed over the last VELOCITY_WINDOW_MS only: a drag that paused before
    // release has no recent sample and reads as 0, not as its earlier flick;
    // a window under 16 ms is too short to measure and also reads as 0.
    const first = d.samples.find((s) => e.timeStamp - s.t <= VELOCITY_WINDOW_MS);
    const elapsed = first ? e.timeStamp - first.t : 0;
    const velocity = first && elapsed >= 16 ? (e.clientY - first.y) / elapsed : 0;
    const outcome = dragOutcome({
      dy: e.clientY - d.startY,
      height: contentRef.current?.offsetHeight ?? 0,
      velocity,
      dirty,
      alreadyWarned: warned.current,
    });
    if (outcome === "dismiss") {
      // Keep the dragged offset: the exit animation starts from it.
      onOpenChange(false);
      return;
    }
    setOffset(0);
    if (outcome === "warn") warned.current = true;
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={contentRef}
          onOpenAutoFocus={(e) => {
            if (onOpenAutoFocus) return onOpenAutoFocus(e);
            // Radix would focus the first focusable element: the close button.
            e.preventDefault();
            contentRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus.current?.focus();
          }}
          {...(description ? {} : { "aria-describedby": undefined })}
          onInteractOutside={(e) => {
            if (dirty) e.preventDefault();
          }}
          style={{
            transform: offset ? `translateY(${offset}px)` : undefined,
            bottom: keyboard.inset ? `${keyboard.inset}px` : undefined,
            maxHeight: keyboard.inset
              ? `${Math.min(keyboard.visibleHeight - 16, window.innerHeight * 0.85)}px`
              : undefined,
          }}
          className={cn(
            "fixed z-50 flex flex-col bg-card text-card-foreground shadow-lg outline-none",
            // Phone: a sheet from the bottom edge.
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            "data-[state=open]:duration-[240ms] data-[state=closed]:duration-[180ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
            // Tablet and desktop: a centred dialog.
            "md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:pb-0",
            "md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=closed]:slide-out-to-bottom-0 md:data-[state=open]:fade-in-0 md:data-[state=closed]:fade-out-0 md:data-[state=open]:zoom-in-95 md:data-[state=closed]:zoom-out-95",
            // The snap-back uses the same curve; an ease-* class here would
            // make twMerge drop the cubic-bezier above.
            !dragging && "transition-transform duration-200",
            className,
          )}
        >
          <div
            className="shrink-0 cursor-grab touch-none select-none px-5 pt-2 pb-3 md:cursor-auto md:pt-5"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30 md:hidden" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className={cn("font-display text-xl leading-tight", titleClassName)}>
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close
                className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <XIcon className="size-5" aria-hidden="true" />
                <span className="sr-only">Fermer</span>
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
