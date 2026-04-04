import { NextRequest, NextResponse } from "next/server";
import { verifySIRET } from "@/lib/siret";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
    const limited = await rateLimit(
        request.headers.get("x-forwarded-for") ?? null,
        "verify-siret",
        10,
    );
    if (limited) return limited;

    const body = await request.json();
    const siret = body.siret as string;

    if (!siret) {
        return NextResponse.json({ error: "SIRET requis" }, { status: 400 });
    }

    const result = await verifySIRET(siret);

    if (!result.valid) {
        return NextResponse.json({ valid: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
        valid: true,
        name: result.name,
        address: result.address,
        city: result.city,
        postalCode: result.postalCode,
        nafCode: result.nafCode,
    });
}
