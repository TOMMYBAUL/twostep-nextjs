"use client";

import { User01 } from "@untitledui/icons";
import { useFavorites } from "../hooks/use-favorites";
import { useFollows } from "../hooks/use-follows";

export default function ProfilePage() {
    const { data: favorites } = useFavorites();
    const { data: follows } = useFollows();

    return (
        <div className="p-4">
            <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex size-20 items-center justify-center rounded-full bg-secondary">
                    <User01 className="size-8 text-quaternary" />
                </div>
                <p className="text-lg font-semibold text-primary">Mon profil</p>
                <p className="text-xs text-tertiary">
                    {favorites?.length ?? 0} produit{(favorites?.length ?? 0) > 1 ? "s" : ""} favoris · {follows?.length ?? 0} boutique{(follows?.length ?? 0) > 1 ? "s" : ""} suivie{(follows?.length ?? 0) > 1 ? "s" : ""}
                </p>
            </div>

            <div className="space-y-4">
                <div className="rounded-xl border border-secondary p-4">
                    <h2 className="text-sm font-semibold text-primary">Préférences de notification</h2>
                    <p className="mt-1 text-xs text-tertiary">Bientôt disponible — Phase 2</p>
                </div>

                <div className="rounded-xl border border-secondary p-4">
                    <h2 className="text-sm font-semibold text-primary">Rayon de recherche</h2>
                    <p className="mt-1 text-xs text-tertiary">Par défaut : 5 km</p>
                </div>

                <div className="rounded-xl border border-secondary p-4">
                    <h2 className="text-sm font-semibold text-primary">Compte</h2>
                    <p className="mt-1 text-xs text-tertiary">Connexion · Déconnexion · Supprimer mon compte</p>
                </div>
            </div>
        </div>
    );
}
