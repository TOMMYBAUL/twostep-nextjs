import Link from "next/link";

export default function ClotureDuSoirPage() {
    return (
        <div className="mx-auto max-w-md py-12 text-center">
            <div className="mb-4 text-5xl">🌙</div>
            <h1 className="mb-2 font-display text-xl font-bold uppercase text-primary">Clôture du soir</h1>
            <p className="mb-6 text-sm text-tertiary">
                En 15 secondes : marque d'un pouce levé les ruptures de la journée.
                L'écran est en cours de construction — on te prévient dès qu'il est prêt.
            </p>
            <Link
                href="/dashboard/stock/mon-stock"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-solid px-5 py-3 text-sm font-semibold text-white"
            >
                Retour à mon stock
            </Link>
        </div>
    );
}
