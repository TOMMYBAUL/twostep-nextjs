import { redirect } from "next/navigation";

import { getAdminUser } from "@/lib/auth/require-admin";

import { ClipTestButton } from "./clip-test-button";

const PILOT_PRODUCT_ID = "0ece0404-bb9f-474e-baee-ffe75fe9754c";

export const dynamic = "force-dynamic";

export default async function ClipDebugPage() {
    const user = await getAdminUser();
    if (!user) redirect("/login");

    return (
        <div className="mx-auto max-w-2xl p-8">
            <h1 className="mb-2 text-2xl font-bold">CLIP Embed — E2E test</h1>
            <p className="mb-6 text-sm text-gray-600">
                Admin: <span className="font-mono">{user.email}</span>
            </p>

            <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-4 text-sm">
                <p className="mb-1">
                    <strong>Endpoint:</strong>{" "}
                    <code className="bg-white px-1">/api/admin/clip/embed-product</code>
                </p>
                <p className="mb-1">
                    <strong>productId:</strong>{" "}
                    <code className="bg-white px-1">{PILOT_PRODUCT_ID}</code>
                </p>
                <p className="text-gray-500">
                    Nike Air Force 1 (merchant Two-Step Test). Photo CDN Nike publique.
                </p>
            </div>

            <ClipTestButton productId={PILOT_PRODUCT_ID} />
        </div>
    );
}
