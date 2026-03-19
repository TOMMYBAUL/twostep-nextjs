import { NextResponse } from "next/server";

export async function POST(request: Request) {
    const body = await request.json();
    const { siret } = body;

    if (!siret || typeof siret !== "string" || siret.length !== 14 || !/^\d{14}$/.test(siret)) {
        return NextResponse.json({ error: "SIRET must be exactly 14 digits" }, { status: 400 });
    }

    try {
        // Call INSEE Sirene API (free, public data)
        const res = await fetch(
            `https://api.insee.fr/entreprises/sirene/V3/siret/${siret}`,
            {
                headers: {
                    Accept: "application/json",
                    // Note: INSEE API requires a bearer token obtained from api.insee.fr
                    // For MVP, we fall through to the fallback below
                },
            },
        );

        if (res.ok) {
            const data = await res.json();
            const etablissement = data?.etablissement;
            const uniteLegale = etablissement?.uniteLegale;
            const adresse = etablissement?.adresseEtablissement;

            return NextResponse.json({
                valid: true,
                company: {
                    name: uniteLegale?.denominationUniteLegale
                        ?? `${uniteLegale?.prenomUsuelUniteLegale ?? ""} ${uniteLegale?.nomUniteLegale ?? ""}`.trim(),
                    address: [
                        adresse?.numeroVoieEtablissement,
                        adresse?.typeVoieEtablissement,
                        adresse?.libelleVoieEtablissement,
                    ].filter(Boolean).join(" "),
                    city: adresse?.libelleCommuneEtablissement ?? "",
                    postalCode: adresse?.codePostalEtablissement ?? "",
                    activity: uniteLegale?.activitePrincipaleUniteLegale ?? "",
                    active: etablissement?.periodesEtablissement?.[0]?.etatAdministratifEtablissement === "A",
                },
            });
        }

        // INSEE API returned error — could be 404 (not found) or 401 (no token)
        if (res.status === 404) {
            return NextResponse.json({ valid: false, error: "SIRET not found" }, { status: 404 });
        }

        // Fallback: accept the SIRET but mark as pending verification
        return NextResponse.json({
            valid: true,
            pending: true,
            company: null,
        });
    } catch {
        // Network error — accept but mark as pending
        return NextResponse.json({
            valid: true,
            pending: true,
            company: null,
        });
    }
}
