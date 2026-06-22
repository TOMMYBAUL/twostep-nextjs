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
    const siret = body.siret;

    if (!siret || typeof siret !== "string") {
        return NextResponse.json({ error: "SIRET requis" }, { status: 400 });
    }

    if (!/^\d{14}$/.test(siret)) {
        return NextResponse.json({ error: "SIRET invalide (14 chiffres requis)" }, { status: 400 });
    }

    const result = await verifySIRET(siret);

    if (!result.valid) {
        return NextResponse.json({ valid: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
        valid: true,
        // pending = SIRET non confirmé par l'INSEE → le marchand passe mais son compte
        // sera marqué en attente (vérification manuelle). On ne prétend pas « vérifié ».
        pending: result.pending,
        // `company` n'est renseigné que si l'INSEE a vraiment retourné une identité.
        // Les forms d'onboarding lisent `data.company` pour pré-remplir le profil ;
        // null (non diffusible / non vérifié) = saisie manuelle, pas d'écrasement.
        company: result.name
            ? {
                  name: result.name,
                  address: result.address,
                  city: result.city,
                  postalCode: result.postalCode,
                  nafCode: result.nafCode,
              }
            : null,
    });
}
