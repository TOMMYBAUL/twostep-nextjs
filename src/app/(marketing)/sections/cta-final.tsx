"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import Link from "next/link";

export function CTAFinal() {
    const ref = useRef<HTMLElement>(null);
    const inView = useInView(ref, { once: true, margin: "-15%" });

    return (
        <motion.section
            ref={ref}
            className="bg-[#4268FF] px-6 py-16 text-center md:px-12 md:py-20"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ type: "spring", stiffness: 150, damping: 30 }}
        >
            <h2 className="mx-auto max-w-md text-[22px] font-[900] leading-tight tracking-tight text-white md:text-[28px]">
                Prêt à découvrir{" "}
                <br />
                ton quartier ?
            </h2>
            <p className="mt-3 text-[13px] text-white/65">
                Gratuit, sans compte, en 2 secondes.
            </p>
            <motion.div
                className="mt-6"
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
            >
                <Link
                    href="/discover"
                    className="inline-block rounded-xl bg-white px-7 py-3 text-[14px] font-[800] text-[#4268FF] transition-opacity hover:opacity-90"
                >
                    Découvrir →
                </Link>
            </motion.div>
        </motion.section>
    );
}
