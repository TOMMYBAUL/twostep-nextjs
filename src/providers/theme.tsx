"use client";

import { ThemeProvider } from "next-themes";

// next-themes renders an inline <script> to prevent theme flicker.
// React 19 warns about script tags inside components — false positive.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const orig = console.error;
    console.error = (...args: unknown[]) => {
        if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) return;
        orig.apply(console, args);
    };
}

export function Theme({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" value={{ light: "light-mode", dark: "dark-mode" }} enableSystem>
            {children}
        </ThemeProvider>
    );
}
