"use client";

import { Nav } from "./sections/nav";
import { Hero } from "./sections/hero";
import { Marquee } from "./sections/marquee";
import { Statement } from "./sections/statement";
import { How } from "./sections/how";
import { About } from "./sections/about";
import { Pioneers } from "./sections/pioneers";
import { Contact } from "./sections/contact";
import { Footer } from "./sections/footer";

export default function HomeScreen() {
    return (
        <>
            <Nav />
            <main>
                <Hero />
                <Marquee />
                <Statement />
                <Marquee />
                <How />
                <About />
                <Pioneers />
                <Contact />
            </main>
            <Footer />
        </>
    );
}
