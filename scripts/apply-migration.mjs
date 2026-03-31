import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Try adding the column by doing an update with the new field
// If column doesn't exist, we'll need to use the SQL editor
const { data, error } = await supabase
    .from("products")
    .select("id")
    .limit(1);

if (error) {
    console.error("Cannot connect:", error.message);
    process.exit(1);
}

// Test if column exists by trying to read it
const { error: colErr } = await supabase
    .from("products")
    .select("id, available_sizes")
    .limit(1);

if (colErr?.message?.includes("available_sizes")) {
    console.log("Column 'available_sizes' does not exist yet.");
    console.log("Please run this SQL in your Supabase dashboard (SQL Editor):");
    console.log("");
    console.log("  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS available_sizes JSONB DEFAULT '[]'::jsonb;");
    console.log("");
    console.log("Then re-run this script.");
    process.exit(1);
} else {
    console.log("Column 'available_sizes' exists!");
}
