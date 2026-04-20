import { redirect } from "next/navigation";

export default function InvoicesRedirect() {
    redirect("/dashboard/stock/factures");
}
