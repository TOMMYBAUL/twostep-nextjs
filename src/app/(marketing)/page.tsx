import HomeScreen from "./home-screen";

const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Two-Step",
    url: "https://www.twostep.fr",
    logo: "https://www.twostep.fr/logo-icon.webp",
    description:
        "Plateforme de mise en relation entre commerces locaux et consommateurs pour la consultation de stocks en temps réel",
    address: {
        "@type": "PostalAddress",
        streetAddress: "30 route de Blagnac",
        addressLocality: "Toulouse",
        postalCode: "31200",
        addressCountry: "FR",
    },
    taxID: "102 932 290 R.C.S. Toulouse",
};

export default function Page() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
            />
            <HomeScreen />
        </>
    );
}
