import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin/guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login");
    if (!isAdmin(user.email)) redirect("/dashboard");
    return <div className="container mx-auto p-6">{children}</div>;
}
