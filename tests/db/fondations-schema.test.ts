// Sanity check du schéma après migrations 062-068.
// Requiert NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans l'env.
// Charge .env.local automatiquement (Vitest ne le fait pas par défaut).

import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasCreds = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
const describeIf = hasCreds ? describe : describe.skip;

const supabase = hasCreds
    ? createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
      })
    : (null as unknown as ReturnType<typeof createClient>);

describeIf("Fondations DB — migrations 062-068", () => {
    it("062: suppliers table exists", async () => {
        const { error } = await supabase.from("suppliers").select("*").limit(0);
        expect(error).toBeNull();
    });

    it("063: invoices.supplier_id column exists (uuid)", async () => {
        const { error } = await supabase.from("invoices").select("supplier_id").limit(1);
        expect(error).toBeNull();
    });

    it("064: invoice_items validation fields exist", async () => {
        const { error } = await supabase
            .from("invoice_items")
            .select("facture_qty, received_qty, is_flagged, flag_reason")
            .limit(1);
        expect(error).toBeNull();
    });

    it("065: products.archived_at exists", async () => {
        const { error } = await supabase.from("products").select("archived_at").limit(1);
        expect(error).toBeNull();
    });

    it("066: stock.status + last_toggled_at exist", async () => {
        const { error } = await supabase.from("stock").select("status, last_toggled_at").limit(1);
        expect(error).toBeNull();
    });

    it("067: products.attributes exists as jsonb", async () => {
        const { error } = await supabase.from("products").select("attributes").limit(1);
        expect(error).toBeNull();
    });

    it("068: invoices.ux_status returns valid UX values", async () => {
        const { data, error } = await supabase.from("invoices").select("ux_status").limit(100);
        expect(error).toBeNull();
        if (data) {
            data.forEach((row: { ux_status: string | null }) => {
                if (row.ux_status !== null) {
                    expect(["pending", "validated", "refused"]).toContain(row.ux_status);
                }
            });
        }
    });
});
