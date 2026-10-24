"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Landmark, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuickSpend } from "@/components/envelopes/quick-spend-context";

const TABS = [
  { href: "/enveloppes", label: "Enveloppes", icon: Wallet },
  { href: "/tresorerie", label: "Trésorerie", icon: Landmark },
  { href: "/configuration", label: "Config", icon: Settings },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();
  const quickSpend = useQuickSpend();

  function handleFab() {
    quickSpend.open(null, "SPEND");
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t bg-card md:hidden">
      <div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map((tab, i) => {
          const Icon = tab.icon;
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          const tabClassName = cn(
            "relative flex flex-1 flex-col items-center justify-center gap-0.5 min-h-14 py-2 text-xs font-medium",
            isActive
              ? "text-primary before:absolute before:top-0 before:left-1/2 before:h-0.5 before:w-8 before:-translate-x-1/2 before:rounded-full before:bg-primary"
              : "text-muted-foreground"
          );

          // Insert FAB between tab 0 (Enveloppes) and tab 1 (Trésorerie)
          if (i === 1) {
            return (
              <div key="fab-group" className="contents">
                <button
                  onClick={handleFab}
                  className="relative -mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring motion-safe:active:scale-95 motion-safe:transition-transform"
                  aria-label="Dépenser ou remplir"
                >
                  <Plus className="size-6" aria-hidden="true" />
                </button>
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={tabClassName}
                >
                  <Icon className="size-5" />
                  <span>{tab.label}</span>
                </Link>
              </div>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={tabClassName}
            >
              <Icon className="size-5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
