"use client";
import { useState } from "react";

type Step = "csv" | "queue" | "review" | "publish";

const STEPS: { id: Step; label: string }[] = [
    { id: "csv", label: "1. Import CSV" },
    { id: "queue", label: "2. Queue review" },
    { id: "review", label: "3. Enrichissement manuel" },
    { id: "publish", label: "4. Publier feed" },
];

export default function OnboardingWizardPage() {
    const [step, setStep] = useState<Step>("csv");

    return (
        <div className="max-w-4xl">
            <h1 className="text-2xl font-bold text-primary">Onboarding Wizard (admin)</h1>
            <p className="text-tertiary mb-6 mt-2">
                Squelette navigable. Implémentation des étapes en Phase 1 (Tasks 1.2-1.5).
            </p>
            <nav className="flex gap-3 mb-8 border-b border-secondary pb-3">
                {STEPS.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => setStep(s.id)}
                        className={
                            step === s.id
                                ? "font-bold text-brand-primary"
                                : "text-secondary hover:text-secondary_hover"
                        }
                    >
                        {s.label}
                    </button>
                ))}
            </nav>
            <section>
                {step === "csv" && (
                    <p className="text-tertiary">CSV upload — à implémenter en Task 1.2</p>
                )}
                {step === "queue" && (
                    <p className="text-tertiary">Queue review — à implémenter en Task 1.3</p>
                )}
                {step === "review" && (
                    <p className="text-tertiary">
                        Enrichissement manuel — à implémenter en Task 1.4
                    </p>
                )}
                {step === "publish" && (
                    <p className="text-tertiary">Publier feed — à implémenter en Task 1.5</p>
                )}
            </section>
        </div>
    );
}
