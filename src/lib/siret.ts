type SIRETResult = {
    valid: boolean;
    name: string | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    nafCode: string | null;
    active: boolean;
    error?: string;
};

export async function verifySIRET(siret: string): Promise<SIRETResult> {
    if (!/^\d{14}$/.test(siret)) {
        return { valid: false, name: null, address: null, city: null, postalCode: null, nafCode: null, active: false, error: "Le SIRET doit contenir 14 chiffres" };
    }

    const token = process.env.INSEE_API_TOKEN;
    if (!token) {
        return { valid: true, name: null, address: null, city: null, postalCode: null, nafCode: null, active: true };
    }

    try {
        const res = await fetch(`https://api.insee.fr/entreprises/sirene/V3.11/siret/${siret}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });

        if (res.status === 404) {
            return { valid: false, name: null, address: null, city: null, postalCode: null, nafCode: null, active: false, error: "SIRET introuvable" };
        }

        if (!res.ok) {
            return { valid: true, name: null, address: null, city: null, postalCode: null, nafCode: null, active: true };
        }

        const data = await res.json();
        const etab = data.etablissement;
        const unite = etab.uniteLegale;
        const adresse = etab.adresseEtablissement;

        const active = etab.periodesEtablissement?.[0]?.etatAdministratifEtablissement === "A";
        if (!active) {
            return { valid: false, name: null, address: null, city: null, postalCode: null, nafCode: null, active: false, error: "Cet établissement est fermé" };
        }

        return {
            valid: true,
            active: true,
            name: unite.denominationUniteLegale || `${unite.prenomUsuelUniteLegale ?? ""} ${unite.nomUniteLegale ?? ""}`.trim() || null,
            address: `${adresse.numeroVoieEtablissement ?? ""} ${adresse.typeVoieEtablissement ?? ""} ${adresse.libelleVoieEtablissement ?? ""}`.trim() || null,
            city: adresse.libelleCommuneEtablissement ?? null,
            postalCode: adresse.codePostalEtablissement ?? null,
            nafCode: unite.activitePrincipaleUniteLegale ?? null,
        };
    } catch {
        return { valid: true, name: null, address: null, city: null, postalCode: null, nafCode: null, active: true };
    }
}
