import { redirect } from "next/navigation";

export default function ProductsRedirect() {
    redirect("/dashboard/stock/mon-stock");
}
