"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Landmark, Settings, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth/client";
import { useQuickSpend } from "@/components/envelopes/quick-spend-context";

const NAV_ITEMS = [
  { href: "/enveloppes", label: "Enveloppes", icon: Wallet },
  { href: "/tresorerie", label: "Trésorerie", icon: Landmark },
  { href: "/configuration", label: "Configuration", icon: Settings },
] as const;

export function DesktopNav() {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const quickSpend = useQuickSpend();

  return (
    <aside className="hidden md:flex w-64 flex-col border-r bg-card">
      <div className="px-6 py-5 border-b">
        <Link href="/enveloppes" className="font-display text-2xl text-foreground">
          Bas de Laine
        </Link>
      </div>

      <div className="px-4 pt-4">
        {/* Outlined, not filled: a page may already have its own filled action (DESIGN.md). */}
        <button
          type="button"
          onClick={() => quickSpend.open(null, "SPEND")}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-spend/50 text-sm font-medium text-foreground transition-colors hover:bg-spend/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Plus className="size-4" aria-hidden="true" />
          Dépenser
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {session?.user && (
        <div className="border-t p-4">
          <p className="text-sm font-medium truncate">{session.user.name}</p>
          <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
        </div>
      )}
    </aside>
  );
}
