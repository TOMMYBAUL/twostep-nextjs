import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Politique de confidentialité — Two-Step",
    description:
        "Comment Two-Step collecte, utilise et protège vos données personnelles.",
};

export default function ConfidentialitePage() {
    return (
        <div className="min-h-screen bg-[#F8F9FC]">
            <div className="mx-auto max-w-2xl px-6 py-16">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-[#8E96B0] hover:text-[#1A1F36] no-underline mb-8"
                >
                    ← Retour
                </Link>

                <h1 className="text-2xl font-bold text-[#1A1F36] mb-8">
                    Politique de confidentialité
                </h1>

                <div className="space-y-8 text-sm text-[#1A1F36] leading-relaxed">
                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            1. Responsable du traitement
                        </h2>
                        <p>
                            Le responsable du traitement des données
                            personnelles est :
                        </p>
                        <ul className="mt-2 space-y-1 list-none pl-0">
                            <li>
                                <strong>Thomas Bauland</strong> —
                                Micro-entreprise
                            </li>
                            <li>
                                RCS : 102 932 290 R.C.S. Toulouse
                            </li>
                            <li>
                                30 route de Blagnac, 31200 Toulouse, France
                            </li>
                            <li>
                                Email :{" "}
                                <a
                                    href="mailto:contact@twostep.fr"
                                    className="text-[#4268FF] underline"
                                >
                                    contact@twostep.fr
                                </a>
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            2. Données collectées
                        </h2>

                        <h3 className="text-sm font-semibold mt-4 mb-2">
                            Consommateurs (utilisateurs de l&apos;application)
                        </h3>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                <strong>Compte :</strong> adresse email, mot de
                                passe (chiffré)
                            </li>
                            <li>
                                <strong>Préférences :</strong> tailles, pointures,
                                catégories favorites
                            </li>
                            <li>
                                <strong>Navigation :</strong> boutiques suivies,
                                produits favoris, recherches
                            </li>
                            <li>
                                <strong>Géolocalisation :</strong> position
                                approximative (ville) pour afficher les boutiques
                                à proximité — uniquement avec votre consentement
                            </li>
                        </ul>

                        <h3 className="text-sm font-semibold mt-4 mb-2">
                            Marchands (commerçants inscrits)
                        </h3>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                <strong>Compte :</strong> nom, email, téléphone,
                                mot de passe (chiffré)
                            </li>
                            <li>
                                <strong>Boutique :</strong> nom commercial,
                                adresse, SIRET, horaires, description, photo
                            </li>
                            <li>
                                <strong>Catalogue :</strong> produits, prix,
                                stocks, photos produits, codes EAN
                            </li>
                            <li>
                                <strong>Factures :</strong> factures fournisseurs
                                transmises volontairement pour l&apos;enrichissement
                                automatique du catalogue
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            3. Finalités du traitement
                        </h2>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                Fournir le service Two-Step : consultation de
                                stocks en boutiques locales
                            </li>
                            <li>
                                Permettre aux marchands de gérer leur catalogue
                                et leur visibilité
                            </li>
                            <li>
                                Personnaliser l&apos;expérience consommateur
                                (recommandations, filtres)
                            </li>
                            <li>
                                Enrichir automatiquement les fiches produits
                                (photos, descriptions) via intelligence
                                artificielle
                            </li>
                            <li>
                                Communiquer avec les utilisateurs (notifications,
                                emails de service)
                            </li>
                            <li>
                                Améliorer le service (analyses d&apos;usage
                                anonymisées)
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            4. Base légale
                        </h2>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                <strong>Exécution du contrat :</strong> données
                                nécessaires à la fourniture du service (compte,
                                catalogue, stocks)
                            </li>
                            <li>
                                <strong>Consentement :</strong> géolocalisation,
                                notifications push, cookies analytiques
                            </li>
                            <li>
                                <strong>Intérêt légitime :</strong> amélioration
                                du service, prévention des abus
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            5. Sous-traitants et destinataires
                        </h2>
                        <p>
                            Vos données peuvent être transmises aux
                            sous-traitants suivants, dans le cadre strict de la
                            fourniture du service :
                        </p>
                        <ul className="mt-2 list-disc pl-5 space-y-1">
                            <li>
                                <strong>Supabase Inc.</strong> (hébergement base
                                de données, région UE)
                            </li>
                            <li>
                                <strong>Vercel Inc.</strong> (hébergement
                                application, CDN)
                            </li>
                            <li>
                                <strong>Cloudflare Inc.</strong> (stockage
                                photos, routage email)
                            </li>
                            <li>
                                <strong>Anthropic / Google</strong>{" "}
                                (enrichissement IA des fiches produits — aucune
                                donnée personnelle transmise, uniquement noms de
                                produits)
                            </li>
                            <li>
                                <strong>Stripe Inc.</strong> (paiement des
                                abonnements marchands)
                            </li>
                            <li>
                                <strong>Resend Inc.</strong> (envoi d&apos;emails
                                transactionnels)
                            </li>
                            <li>
                                <strong>Mapbox Inc.</strong> (affichage de la
                                carte)
                            </li>
                        </ul>
                        <p className="mt-2">
                            Aucune donnée personnelle n&apos;est vendue ou
                            transmise à des fins publicitaires.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            6. Durée de conservation
                        </h2>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>
                                <strong>Données de compte :</strong> conservées
                                pendant la durée de l&apos;inscription, puis 3
                                ans après la dernière connexion
                            </li>
                            <li>
                                <strong>Données de catalogue :</strong>{" "}
                                conservées tant que le compte marchand est actif
                            </li>
                            <li>
                                <strong>Factures fournisseurs :</strong>{" "}
                                conservées 1 an après traitement, puis supprimées
                            </li>
                            <li>
                                <strong>Logs techniques :</strong> 90 jours
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            7. Vos droits
                        </h2>
                        <p>
                            Conformément au RGPD (articles 15 à 22), vous
                            disposez des droits suivants :
                        </p>
                        <ul className="mt-2 list-disc pl-5 space-y-1">
                            <li>
                                <strong>Accès :</strong> obtenir une copie de vos
                                données personnelles
                            </li>
                            <li>
                                <strong>Rectification :</strong> corriger des
                                données inexactes
                            </li>
                            <li>
                                <strong>Suppression :</strong> demander
                                l&apos;effacement de vos données
                            </li>
                            <li>
                                <strong>Portabilité :</strong> recevoir vos
                                données dans un format structuré
                            </li>
                            <li>
                                <strong>Opposition :</strong> vous opposer au
                                traitement de vos données
                            </li>
                            <li>
                                <strong>Limitation :</strong> restreindre le
                                traitement dans certains cas
                            </li>
                            <li>
                                <strong>Retrait du consentement :</strong> à tout
                                moment pour les traitements basés sur le
                                consentement
                            </li>
                        </ul>
                        <p className="mt-3">
                            Pour exercer ces droits, contactez-nous à{" "}
                            <a
                                href="mailto:contact@twostep.fr"
                                className="text-[#4268FF] underline"
                            >
                                contact@twostep.fr
                            </a>
                            . Nous répondons sous 30 jours.
                        </p>
                        <p className="mt-2">
                            En cas de litige, vous pouvez introduire une
                            réclamation auprès de la{" "}
                            <strong>
                                CNIL (Commission Nationale de l&apos;Informatique
                                et des Libertés)
                            </strong>{" "}
                            — cnil.fr.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            8. Cookies
                        </h2>
                        <p>Two-Step utilise les cookies suivants :</p>
                        <ul className="mt-2 list-disc pl-5 space-y-1">
                            <li>
                                <strong>Cookies essentiels :</strong>{" "}
                                authentification, session utilisateur, préférences
                                de consentement — nécessaires au fonctionnement,
                                non désactivables
                            </li>
                            <li>
                                <strong>Cookies analytiques :</strong> Vercel
                                Analytics — mesure d&apos;audience anonymisée,
                                désactivables dans les paramètres du navigateur
                            </li>
                        </ul>
                        <p className="mt-2">
                            Aucun cookie publicitaire ou de traçage tiers
                            n&apos;est utilisé.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            9. Sécurité
                        </h2>
                        <p>
                            Nous mettons en oeuvre des mesures techniques et
                            organisationnelles pour protéger vos données :
                            chiffrement des mots de passe, connexions HTTPS,
                            accès restreint aux données, hébergement sécurisé en
                            Union européenne.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">
                            10. Modifications
                        </h2>
                        <p>
                            Cette politique peut être mise à jour. En cas de
                            modification substantielle, les utilisateurs seront
                            informés par email ou notification dans
                            l&apos;application.
                        </p>
                    </section>

                    <p className="text-xs text-[#8E96B0] mt-12">
                        Dernière mise à jour : avril 2026
                    </p>
                </div>
            </div>
        </div>
    );
}
