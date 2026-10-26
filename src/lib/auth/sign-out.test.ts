// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAGE_CACHE_NAMES } from "@/lib/pwa/cache-names";

const fake = vi.hoisted(() => ({ signOut: vi.fn(), order: [] as string[] }));
vi.mock("./client", () => ({ authClient: { signOut: fake.signOut } }));

const { signOutAndPurge } = await import("./sign-out");

const deleted: string[] = [];
const assign = vi.fn();

beforeEach(() => {
  deleted.length = 0;
  fake.order.length = 0;
  assign.mockReset();
  fake.signOut.mockReset().mockImplementation(async () => {
    fake.order.push("signOut");
  });
  vi.stubGlobal("window", { caches: {}, location: { assign } });
  vi.stubGlobal("caches", {
    delete: async (name: string) => {
      deleted.push(name);
      fake.order.push("delete:" + name);
      return true;
    },
  });
});

describe("signOutAndPurge", () => {
  it("deletes every page cache, then signs out, then hard-navigates to sign-in", async () => {
    await signOutAndPurge();
    expect(deleted.sort()).toEqual([...PAGE_CACHE_NAMES].sort());
    expect(fake.order.at(-1)).toBe("signOut");
    expect(assign).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("still signs out when a cache refuses to be deleted", async () => {
    vi.stubGlobal("caches", { delete: async () => { throw new Error("denied"); } });
    await signOutAndPurge();
    expect(fake.signOut).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("signs out without touching CacheStorage when it is unavailable", async () => {
    vi.stubGlobal("window", { location: { assign } });
    await signOutAndPurge();
    expect(deleted).toEqual([]);
    expect(fake.signOut).toHaveBeenCalledTimes(1);
  });

  it("does not navigate if signOut rejects", async () => {
    fake.signOut.mockRejectedValueOnce(new Error("network"));
    await expect(signOutAndPurge()).rejects.toThrow("network");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("page cache list is shared with the service worker", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("sw.ts and sign-out.ts both consume PAGE_CACHE_NAMES, neither hand-lists names", () => {
    const sw = read("src/sw.ts");
    const signOut = read("src/lib/auth/sign-out.ts");
    expect(sw).toMatch(/import \{[^}]*PAGE_CACHE_NAMES[^}]*\} from "@\/lib\/pwa\/cache-names"/);
    expect(signOut).toMatch(/import \{ PAGE_CACHE_NAMES \} from "@\/lib\/pwa\/cache-names"/);
    expect(signOut).toContain("PAGE_CACHE_NAMES.map");
    for (const name of PAGE_CACHE_NAMES) {
      expect(sw).not.toContain(`"${name}"`);
      expect(signOut).not.toContain(`"${name}"`);
    }
  });

  it("covers the Serwist page caches", () => {
    for (const n of ["pages", "pages-rsc", "pages-rsc-prefetch"]) {
      expect(PAGE_CACHE_NAMES).toContain(n);
    }
  });
});
