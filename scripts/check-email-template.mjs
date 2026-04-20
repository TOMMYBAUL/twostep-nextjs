// One-shot probe: generateLink returns the action_link formatted by the active
// email template. If it points to /auth/confirm?token_hash=..., the template
// is correctly configured. If it points to the Site URL with #access_token,
// the default template is still active and the signup flow is broken.
//
// Run: node scripts/check-email-template.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
            const idx = l.indexOf("=");
            return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const probeEmail = `probe+template-check-${Date.now()}@twostep.fr`;

const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email: probeEmail,
    password: "ProbeCheck2026!",
    options: {
        data: { role: "consumer" },
        redirectTo: `${env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/dashboard`,
    },
});

if (error) {
    console.error("generateLink error:", error.message);
    process.exit(1);
}

const link = data.properties?.action_link;
console.log("\naction_link:", link);

if (!link) {
    console.error("No action_link returned");
    process.exit(1);
}

const url = new URL(link);
const hasTokenHash = url.searchParams.has("token_hash");
const hasTypeParam = url.searchParams.get("type") === "signup";
const pointsToConfirm = url.pathname === "/auth/confirm";

console.log("\nAnalyse:");
console.log("  pathname       :", url.pathname);
console.log("  token_hash?    :", hasTokenHash);
console.log("  type=signup?   :", hasTypeParam);
console.log("  /auth/confirm? :", pointsToConfirm);

if (pointsToConfirm && hasTokenHash && hasTypeParam) {
    console.log("\n✅ Template OK — signup will reach /auth/confirm with token_hash");
} else {
    console.log("\n❌ Template NOT patched — lands on", url.pathname || "root");
    console.log("   Expected: /auth/confirm?token_hash=...&type=signup&next=/dashboard");
    console.log("   Fix in Supabase dashboard → Authentication → Email Templates → Confirm signup");
}

// Cleanup the probe user so we don't pollute auth.users
if (data.user?.id) {
    await admin.auth.admin.deleteUser(data.user.id);
    console.log("\nProbe user deleted:", data.user.id);
}
