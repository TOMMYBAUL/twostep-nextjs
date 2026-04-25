"use client";
import { useState } from "react";

import { CsvUpload } from "./csv-upload";
import { QueueReview } from "./queue-review";

type Step = "csv" | "queue" | "review" | "publish";

const STEPS: { id: Step; label: string }[] = [
    { id: "csv", label: "1. Import CSV" },
    { id: "queue", label: "2. Queue review" },
    { id: "review", label: "3. Enrichissement manuel" },
    { id: "publish", label: "4. Publier feed" },
];

export default function OnboardingWizardPage() {
    const [step, setStep] = useState<Step>("csv");
    const [merchantId, setMerchantId] = useState<string>("");
    const [importedCount, setImportedCount] = useState<number | null>(null);

    return (
        <div className="max-w-4xl">
            <h1 className="text-2xl font-bold text-primary">Onboarding Wizard (admin)</h1>
            <p className="text-tertiary mb-6 mt-2">
                Pipeline manuel : CSV → staging → enrichissement → feed.
            </p>

            <div className="mb-6 p-3 border border-secondary rounded">
                <label htmlFor="merchant-id" className="block text-sm text-secondary mb-1">
                    Merchant ID (UUID) — obligatoire pour toutes les étapes
                </label>
                <input
                    id="merchant-id"
                    type="text"
                    value={merchantId}
                    onChange={(e) => setMerchantId(e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    className="w-full px-3 py-2 border border-secondary rounded text-sm font-mono"
                />
            </div>

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
                    <CsvUpload
                        merchantId={merchantId}
                        onSuccess={(count) => setImportedCount(count)}
                    />
                )}
                {step === "queue" && <QueueReview merchantId={merchantId} />}
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
