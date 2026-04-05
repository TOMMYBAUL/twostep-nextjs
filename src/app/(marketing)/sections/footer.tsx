"use client";

import Link from "next/link";

export function Footer() {
    return (
        <footer style={{ background: "#0F1218" }}>
            <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-12">
                {/* Logo + name */}
                <div className="flex items-center gap-2">
                    <img
                        src="/logo-icon.webp?v=2"
                        alt=""
                        width={24}
                        height={24}
                        className="rounded-md"
                    />
                    <span className="text-[15px] font-extrabold text-white">
                        Two-Step
                    </span>
                </div>

                {/* Links */}
                <div className="flex items-center gap-5 flex-wrap justify-center">
                    <Link
                        href="/produit"
                        className="text-[12px] text-white/40 no-underline hover:text-white/60 transition-colors"
                    >
                        Produit
                    </Link>
                    <Link
                        href="/a-propos"
                        className="text-[12px] text-white/40 no-underline hover:text-white/60 transition-colors"
                    >
                        À propos
                    </Link>
                    <Link
                        href="/mentions-legales"
                        className="text-[12px] text-white/40 no-underline hover:text-white/60 transition-colors"
                    >
                        Mentions légales
                    </Link>
                    <a
                        href="mailto:contact@twostep.fr"
                        className="text-[12px] text-white/40 no-underline hover:text-white/60 transition-colors"
                    >
                        Contact
                    </a>
                    <Link
                        href="/onboarding"
                        className="text-[12px] text-white/40 no-underline hover:text-white/60 transition-colors"
                    >
                        Marchands
                    </Link>
                </div>

                {/* Copyright */}
                <span className="text-[10px] text-white/20">
                    © 2026 Two-Step
                </span>
            </div>
        </footer>
    );
}
