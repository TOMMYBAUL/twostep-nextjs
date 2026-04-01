"use client";

import { LenisProvider } from "./components/lenis-provider";
import { Nav } from "./sections/nav";
import { Hero } from "./sections/hero";
import { Marquee } from "./sections/marquee";
import { How } from "./sections/how";
import { Statement } from "./sections/statement";
import { Contact } from "./sections/contact";
import { CTAFinal } from "./sections/cta-final";
import { Footer } from "./sections/footer";

export default function HomeScreen() {
    return (
        <LenisProvider>
            <Nav />
            <main>
                <Hero />
                <Marquee />
                <How />
                <Statement />
                <Contact />
                <CTAFinal />
            </main>
            <Footer />
        </LenisProvider>
    );
}
