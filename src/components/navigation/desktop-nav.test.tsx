import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { useSession: useSessionMock } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/enveloppes" }));
vi.mock("@/components/envelopes/quick-spend-context", () => ({ useQuickSpend: () => ({ open: vi.fn() }) }));

const { DemoDesktopNav, DesktopNav } = await import("./desktop-nav");

beforeEach(() => {
  useSessionMock.mockReset();
});

describe("DesktopNav", () => {
  it("shows the Neon Auth session's user, fetched on the client", () => {
    useSessionMock.mockReturnValue({ data: { user: { name: "Alice", email: "alice@example.com" } } });

    const html = renderToStaticMarkup(<DesktopNav />);

    expect(useSessionMock).toHaveBeenCalledTimes(1);
    expect(html).toContain("alice@example.com");
  });

  it("shows no user block while the session is unknown", () => {
    useSessionMock.mockReturnValue({ data: null });

    expect(renderToStaticMarkup(<DesktopNav />)).not.toContain("@");
  });
});

describe("DemoDesktopNav", () => {
  // Regression: in DEMO_MODE the client still asked Neon Auth for a session, and the
  // stubbed /api/auth/get-session answered 404 in every visitor's console.
  it("shows the server's demo user without asking for a session", () => {
    const html = renderToStaticMarkup(<DemoDesktopNav user={{ name: "Camille (démo)", email: "demo@bas-de-laine.invalid" }} />);

    expect(useSessionMock).not.toHaveBeenCalled();
    expect(html).toContain("demo@bas-de-laine.invalid");
  });
});
