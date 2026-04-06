"use client";

import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { useState } from "react";

const navLinks = [
    { href: "/produit", label: "Produit" },
    { href: "/marchands", label: "Marchands" },
    { href: "/tarifs", label: "Tarifs" },
    { href: "/a-propos", label: "À propos" },
];

export function Nav() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { scrollY } = useScroll();

    useMotionValueEvent(scrollY, "change", (y) => {
        setScrolled(y > 100);
    });

    return (
        <motion.nav
            className={[
                "fixed top-0 left-0 right-0 z-[100]",
                "flex items-center justify-between",
                "px-6 md:px-12 h-16",
                "transition-[background-color,backdrop-filter,box-shadow] duration-300",
                scrolled || mobileOpen
                    ? "bg-[#1A1F36]/85 backdrop-blur-xl shadow-[0_2px_24px_rgba(0,0,0,0.25)]"
                    : "bg-transparent",
            ].join(" ")}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 no-underline">
                <img
                    src="/logo-icon.webp?v=2"
                    alt=""
                    width={28}
                    height={28}
                    className="rounded-md"
                />
                <span className="text-[15px] font-extrabold text-white tracking-tight">
                    Two-Step
                </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
                {navLinks.map((link) =>
                    link.href.startsWith("/") ? (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all duration-150 no-underline"
                        >
                            {link.label}
                        </Link>
                    ) : (
                        <a
                            key={link.href}
                            href={link.href}
                            className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all duration-150 no-underline"
                        >
                            {link.label}
                        </a>
                    ),
                )}
            </div>

            {/* CTA + Hamburger */}
            <div className="flex items-center gap-3">
                <Link
                    href="/auth/login"
                    className="hidden md:inline-block px-4 py-2 text-[13px] font-medium text-white/70 hover:text-white transition-colors duration-150 no-underline"
                >
                    Connexion
                </Link>
                <Link
                    href="/discover"
                    className="hidden md:inline-block px-4 py-2 rounded-lg bg-[#4268FF] text-white text-[13px] font-bold no-underline hover:bg-[#3558e6] transition-colors duration-150"
                >
                    Découvrir
                </Link>
                {/* Mobile hamburger */}
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="flex md:hidden size-10 items-center justify-center rounded-lg text-white hover:bg-white/10 transition"
                    aria-label="Menu"
                >
                    {mobileOpen ? (
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-16 left-0 right-0 bg-[#1A1F36]/95 backdrop-blur-xl border-t border-white/10 px-6 py-4 md:hidden"
                >
                    <div className="flex flex-col gap-1">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMobileOpen(false)}
                                className="rounded-lg px-4 py-3 text-[15px] font-medium text-white/80 hover:text-white hover:bg-white/10 transition no-underline"
                            >
                                {link.label}
                            </Link>
                        ))}
                        <div className="mt-2 h-px bg-white/10" />
                        <Link
                            href="/auth/login"
                            onClick={() => setMobileOpen(false)}
                            className="rounded-lg px-4 py-3 text-[15px] font-medium text-white/60 hover:text-white transition no-underline"
                        >
                            Connexion
                        </Link>
                        <Link
                            href="/discover"
                            onClick={() => setMobileOpen(false)}
                            className="mt-1 rounded-xl bg-[#4268FF] px-4 py-3 text-center text-[15px] font-bold text-white no-underline hover:bg-[#3558e6] transition"
                        >
                            Découvrir les boutiques
                        </Link>
                    </div>
                </motion.div>
            )}
        </motion.nav>
    );
}
