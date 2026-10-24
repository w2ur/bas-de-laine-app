import { redirect } from "next/navigation";
import { auth } from "./instance";
import { prisma } from "@/lib/prisma";
import { evaluateAccess } from "./access";

export { evaluateAccess } from "./access";

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function getHousehold() {
  const { data, error } = await auth.getSession();

  // A 5xx from the Neon Auth server (or a transport failure surfaced as one) means the
  // session could not be *read*, not that there is no session. Treating it as "signed
  // out" would log the family out on every upstream hiccup, so surface it as an error
  // the user can retry instead.
  if (error && error.status >= 500) {
    // The message is for the logs and for `next dev`: Next.js redacts thrown messages
    // in a Server Action, and a throw from the (app) layout skips (app)/error.tsx and
    // lands on global-error.tsx, which shows its own copy. Nobody in production reads this string — keep it anyway so the server
    // log says what happened.
    throw new Error("Service d'authentification indisponible, réessayez dans un instant");
  }

  const neonUser = data?.user;
  // redirect() works in an RSC and in a Server Action alike (it throws NEXT_REDIRECT,
  // which Next.js turns into a navigation), so a genuinely signed-out visitor lands on
  // the sign-in page rather than on an error boundary.
  if (!neonUser) redirect("/auth/sign-in");

  // Refuse an unverified address before the allowlist is even consulted: an allowlisted
  // address only proves "this is the family's e-mail" if someone has shown they control
  // it. Email-OTP sign-in sets emailVerified (better-auth's sign-in/email-otp route),
  // so the family is never caught by this; a password or social sign-up that merely
  // claims an allowlisted address is.
  if (neonUser.emailVerified !== true) {
    throw new Error("Email non vérifié");
  }

  const neonAuthId = neonUser.id;
  const email = neonUser.email?.toLowerCase() ?? "";
  const name = neonUser.name ?? email.split("@")[0];

  // Resolve whether a User row already exists before the access check so that
  // evaluateAccess can apply the fail-closed rule without a second DB round-trip.
  let user = await prisma.user.findUnique({ where: { neonAuthId } });

  if (!evaluateAccess(email, ALLOWED_EMAILS, user !== null)) {
    throw new Error("Email non autorisé");
  }

  // Auto-provision on first sign-in (only reached when access is granted).
  // This is a single-household family app: the first allowed sign-in creates an
  // empty household and every later member joins that same one (findFirst below), so
  // every address in ALLOWED_EMAILS joins the same household. Seeding therefore
  // stays optional (pure demo data) — the household no longer has to pre-exist.
  if (!user) {
    const household =
      (await prisma.household.findFirst()) ??
      (await prisma.household.create({ data: {} }));

    user = await prisma.user.create({
      data: {
        neonAuthId,
        name,
        email,
        householdId: household.id,
      },
    });
  }

  const household = await prisma.household.findUniqueOrThrow({
    where: { id: user.householdId },
  });

  return { user, household, householdId: household.id };
}
