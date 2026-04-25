import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin/guard";

// Defense-in-depth : ce layout (Server Component) gate AVANT envoi HTML.
// Le parent src/app/admin/layout.tsx (Client Component) check après hydratation
// JS — fenêtre TOCTOU pendant laquelle la page est temporairement visible.
// Les 2 mécanismes protègent des vecteurs différents — ne pas supprimer "le doublon".

export default async function Layout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");
    if (!isAdmin(user.email)) redirect("/dashboard");
    return <div className="container mx-auto p-6">{children}</div>;
}
