import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ClotureSession } from "@/components/stock/cloture-session";

export default async function ClotureDuSoirPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/auth/login?next=/dashboard/stock/cloture");

    const { data: merchant } = await supabase
        .from("merchants")
        .select("id, pos_type")
        .eq("user_id", user.id)
        .maybeSingle();
    if (!merchant) redirect("/devenir-marchand");

    // POS-connected merchants: their till already syncs stock — no need for
    // a manual closing review.
    if (merchant.pos_type) {
        redirect("/dashboard/stock/mon-stock?no_cloture=1");
    }

    return <ClotureSession />;
}
