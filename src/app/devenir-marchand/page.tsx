import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { BecomeMerchantForm } from "./form";

export default async function BecomeMerchantPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/auth/login?next=/devenir-marchand");
    }

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (merchant) {
        redirect("/dashboard");
    }

    return <BecomeMerchantForm userEmail={user.email ?? ""} />;
}
