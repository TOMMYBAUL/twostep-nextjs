"use client";

type ScoreProps = { score: number };

function getScoreColor(score: number) {
    if (score >= 80) return "#5a9474";
    if (score >= 50) return "#4268FF";
    return "#c4553a";
}

function getScoreLabel(score: number) {
    if (score >= 80) return "Excellent";
    if (score >= 50) return "En progrès";
    return "À configurer";
}

export function TwoStepScore({ score }: ScoreProps) {
    const color = getScoreColor(score);
    const label = getScoreLabel(score);

    return (
        <div className="rounded-xl bg-white px-5 py-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">Score Two-Step</h3>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
                        <span className="text-sm text-secondary">/100</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color, background: `${color}15` }}>{label}</span>
                    </div>
                </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${score}%`, background: color }} />
            </div>
            {score < 80 && (
                <p className="mt-2 text-xs text-tertiary">
                    {score < 50
                        ? "Complétez votre profil et ajoutez des produits pour être visible."
                        : "Ajoutez des photos à vos produits et créez une promo pour atteindre 80+."}
                </p>
            )}
        </div>
    );
}
