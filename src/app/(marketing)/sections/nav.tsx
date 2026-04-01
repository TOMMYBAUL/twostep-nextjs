"use client";

import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { useState } from "react";

export function Nav() {
    const [scrolled, setScrolled] = useState(false);
    const { scrollY } = useScroll();

    useMotionValueEvent(scrollY, "change", (y) => {
        setScrolled(y > 100);
    });

    return (
        <motion.nav
            className={[
                "fixed top-0 left-0 right-0 z-[100]",
                "flex items-center justify-between",
                "px-12 h-16",
                "transition-[background-color,backdrop-filter,box-shadow] duration-300",
                scrolled
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

            {/* Desktop links + CTA */}
            <div className="flex items-center gap-6">
                {/* Nav links — desktop only */}
                <div className="hidden md:flex items-center gap-6">
                    <a
                        href="#comment"
                        className="text-[13px] font-medium text-white/60 hover:text-white/90 transition-colors duration-150 no-underline"
                    >
                        Comment ça marche
                    </a>
                    <a
                        href="#marchands"
                        className="text-[13px] font-medium text-white/60 hover:text-white/90 transition-colors duration-150 no-underline"
                    >
                        Marchands
                    </a>
                </div>

                {/* CTA */}
                <Link
                    href="/discover"
                    className="px-4 py-2 rounded-lg bg-[#4268FF] text-white text-[13px] font-bold no-underline hover:bg-[#3558e6] transition-colors duration-150"
                >
                    Découvrir
                </Link>
            </div>
        </motion.nav>
    );
}
