import type { Metadata } from "next";
import { BackButton } from "./back-button";

export const metadata: Metadata = {
    title: "Mentions légales — Two-Step",
};

export default function MentionsLegalesPage() {
    return (
        <div className="min-h-screen bg-[#F8F9FC]">
            <div className="mx-auto max-w-2xl px-6 py-16">
                <BackButton />

                <h1 className="text-2xl font-bold text-[#1A1F36] mb-8">Mentions légales</h1>

                <div className="space-y-8 text-sm text-[#1A1F36] leading-relaxed">
                    <section>
                        <h2 className="text-base font-semibold mb-3">1. Éditeur du site</h2>
                        <p>Le site <strong>twostep.fr</strong> est édité par :</p>
                        <ul className="mt-2 space-y-1 list-none pl-0">
                            <li><strong>Nom commercial :</strong> Two-Step (twostep)</li>
                            <li><strong>Entrepreneur individuel :</strong> Thomas Bauland</li>
                            <li><strong>Forme juridique :</strong> Micro-entreprise (Entrepreneur individuel)</li>
                            <li><strong>Siège social :</strong> 30 route de Blagnac, 31200 Toulouse, France</li>
                            <li><strong>Activité :</strong> Édition et exploitation d'une plateforme numérique (SaaS) de mise en relation entre commerces locaux et consommateurs pour la consultation de stocks en temps réel</li>
                            <li><strong>RCS :</strong> 102 932 290 R.C.S. Toulouse</li>
                            <li><strong>N° de gestion :</strong> 2026A01800</li>
                            <li><strong>Date d&apos;immatriculation :</strong> 13 avril 2026</li>
                            <li><strong>Date de commencement d&apos;activité :</strong> 25 mars 2026</li>
                            <li><strong>Directeur de la publication :</strong> Thomas Bauland</li>
                            <li><strong>Email :</strong> contact@twostep.fr</li>
                            <li><strong>Téléphone :</strong> 07 83 48 87 60</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">2. Hébergement</h2>
                        <p>Le site est hébergé par :</p>
                        <ul className="mt-2 space-y-1 list-none pl-0">
                            <li><strong>Vercel Inc.</strong></li>
                            <li>440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</li>
                            <li>Site : vercel.com</li>
                        </ul>
                        <p className="mt-2">Les données sont stockées par <strong>Supabase Inc.</strong> (infrastructure AWS, région eu-west).</p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">3. Propriété intellectuelle</h2>
                        <p>
                            L'ensemble du contenu du site Two-Step (textes, graphismes, images, logos, icônes, logiciels)
                            est la propriété exclusive de l'éditeur ou de ses partenaires, et est protégé par les lois
                            françaises et internationales relatives à la propriété intellectuelle.
                        </p>
                        <p className="mt-2">
                            Toute reproduction, représentation, modification ou adaptation, totale ou partielle, est
                            strictement interdite sans autorisation écrite préalable.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">4. Données personnelles</h2>
                        <p>
                            Two-Step collecte et traite des données personnelles dans le cadre de son service,
                            conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi
                            Informatique et Libertés du 6 janvier 1978 modifiée.
                        </p>
                        <p className="mt-2">
                            Pour le détail complet des traitements, consultez notre{" "}
                            <a href="/confidentialite" className="text-[#4268FF] underline">politique de confidentialité</a>.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">5. Cookies</h2>
                        <p>
                            Two-Step utilise des cookies strictement nécessaires au fonctionnement du service
                            (authentification, préférences). Des cookies d'analyse (Vercel Analytics) sont utilisés
                            pour améliorer le service. Vous pouvez les désactiver dans les paramètres de votre navigateur.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">6. Responsabilité</h2>
                        <p>
                            L'éditeur s'efforce de fournir des informations exactes et à jour. Toutefois, il ne saurait
                            être tenu responsable des erreurs, omissions ou résultats obtenus suite à l'utilisation
                            de ces informations. L'accès au site peut être interrompu pour des raisons de maintenance.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold mb-3">7. Droit applicable</h2>
                        <p>
                            Les présentes mentions légales sont soumises au droit français. En cas de litige, les
                            tribunaux de Toulouse seront seuls compétents.
                        </p>
                    </section>

                    <p className="text-xs text-[#8E96B0] mt-12">Dernière mise à jour : avril 2026</p>
                </div>
            </div>
        </div>
    );
}
