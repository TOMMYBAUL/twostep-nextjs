import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Two-Step arrive à Toulouse — bientôt disponible",
    description:
        "L'application Two-Step ouvre bientôt à Toulouse. On sélectionne en ce moment les premières boutiques pionnières du centre-ville.",
    robots: { index: false, follow: false },
};

export default function BientotPage() {
    return (
        <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-[#12162A] px-6 py-20 text-center">
            {/* Blue radial glow */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(ellipse at 50% 30%, rgba(66,104,255,0.18) 0%, transparent 60%)",
                }}
            />
            {/* Fine grid texture */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.04]"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                    backgroundSize: "48px 48px",
                }}
            />

            <div className="relative z-10 flex w-full max-w-[560px] flex-col items-center">
                {/* Logo */}
                <Link href="/" className="mb-10 flex items-center gap-2.5 no-underline">
                    <img
                        src="/logo-icon.webp?v=2"
                        alt=""
                        width={32}
                        height={32}
                        className="rounded-md"
                    />
                    <span className="text-[17px] font-extrabold tracking-tight text-white">
                        Two-Step
                    </span>
                </Link>

                {/* Badge */}
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold text-white/80 backdrop-blur-sm">
                    <span className="inline-block size-1.5 animate-pulse rounded-full bg-brand-solid" />
                    Lancement en cours à Toulouse
                </span>

                {/* Title */}
                <h1
                    className="mt-6 font-black leading-[1.06] tracking-[-0.03em] text-white"
                    style={{ fontSize: "clamp(30px, 6vw, 50px)" }}
                >
                    On ouvre bientôt{" "}
                    <span className="text-brand-secondary">dans ton quartier</span>
                </h1>

                {/* Explanation */}
                <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-white/65 md:text-[16px]">
                    Two-Step rend visible en temps réel le stock des boutiques
                    indépendantes de Toulouse. On est en train de sélectionner et
                    d'installer les <strong className="text-white/90">premières boutiques
                    pionnières</strong> du centre-ville.
                </p>
                <p className="mt-3 max-w-[460px] text-[15px] leading-relaxed text-white/65 md:text-[16px]">
                    L'application ouvre au public{" "}
                    <strong className="text-white/90">dans les prochaines semaines</strong>.
                    Encore un peu de patience — ça vaudra le coup.
                </p>

                {/* Merchant card — les destinataires de nos emails sont des commerçants */}
                <div className="mt-10 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-left backdrop-blur-sm">
                    <p className="text-[13px] font-bold uppercase tracking-wide text-brand-secondary">
                        Vous tenez une boutique à Toulouse ?
                    </p>
                    <p className="mt-2 text-[14px] leading-relaxed text-white/70">
                        C'est le moment d'en être. On recrute les commerçants pionniers —
                        votre stock devient visible auprès des Toulousains qui cherchent
                        près de chez eux, et on s'occupe de tout.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                            href="/marchands"
                            className="inline-flex items-center rounded-xl bg-brand-solid px-5 py-3 text-[14px] font-bold text-white transition duration-100 ease-linear hover:bg-brand-solid_hover active:scale-[0.97]"
                        >
                            Devenir boutique pionnière →
                        </Link>
                        <Link
                            href="/"
                            className="inline-flex items-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-[14px] font-semibold text-white/90 transition duration-100 ease-linear hover:bg-white/10 active:scale-[0.97]"
                        >
                            Retour à l'accueil
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
