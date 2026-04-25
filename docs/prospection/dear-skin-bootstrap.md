# Dear Skin Shop — bootstrap pilote (Phase 0 Task 0.6)

> Pilote Two-Step #1. Signature sem 3 (mai 2026), trial 2 mois, 1ère facture sem 11.
> Action Thomas : envoyer le template WhatsApp ci-dessous, recevoir CSV + factures, MAJ tracker.

## 1. Template WhatsApp (à copier-coller)

---

Salut ! Je relance Two-Step — on démarre les premiers pilotes dans 2 semaines.

Pour toi concrètement : j'enrichis ton catalogue à la main les premières semaines, donc tu n'as rien à paramétrer. J'ai juste besoin de 2 choses de ta part : l'export CSV de ton catalogue Zettle (bouton "Exporter" dans ton dashboard) + 5 à 10 factures fournisseur PDF récentes.

Côté prix : 2 mois offerts, ensuite 25 €/mois verrouillé à vie pour les pionniers. Idéalement si tu peux m'envoyer ça avant fin de semaine prochaine, on est dans les temps.

Thomas 🙏

---

## 2. Checklist : ce qu'on récupère de Dear Skin

- [ ] Export CSV catalogue Zettle (bouton "Exporter" dans le dashboard Zettle Pro → format `.csv`)
- [ ] 5 à 10 factures fournisseur PDF récentes (3-6 derniers mois)
- [ ] Confirmation verbale du pilote payant 25 €/mois après trial
- [ ] Email de contact pour Stripe + signature Stripe Checkout
- [ ] Adresse boutique principale (pour Google LFP `store_code`)

## 3. Plan de relance (si pas de réponse)

- **J+5** : relance courte ("J'ai bien reçu le brief la semaine dernière ? On démarre vendredi.")
- **J+8** : appel direct (et pas WhatsApp) — la friction téléphone force la décision
- **J+10** : décision pivot (cf. section 4)

## 4. Plan B (si Dear Skin refuse ou ne répond pas)

3 options, par ordre de préférence :

### Option A — Bascule sur Kap (Pré-Go)
- Avantage : ami proche, friction relationnelle nulle, peut servir de bêta-testeur sans pression contractuelle
- Inconvénient : POS Pré-Go inconnu (à vérifier — si Square/Shopify/Lightspeed/Zettle/Hiboutik OK, sinon différer Phase 5)
- Action préalable : message Kap "Salut, je relance Two-Step en pilote, tu utilises quel POS chez toi ?"

### Option B — Démarchage froid Saint-Étienne (cible Tier 1)
- Cibles pré-qualifiées : pharmacies/parapharmacies (CIP 100% identifiable) ou librairies (ISBN 100%)
- Risque : démarche purement commerciale, pas de relation préexistante = taux conversion ~5-10%
- Délai : 1-2 semaines de terrain pour 1 signature

### Option C — Pivot sans 1er pilote payant
- Si Dear Skin refuse ET Kap pas dispo ET démarchage froid échoue : reconsidérer le path γ
- Risque : signal-perdu, retour vers α (16 sem strict) ou β (MVP sale)
- Trigger : 4 semaines sans aucun pilote signé

## 5. MAJ tracker leads

Après envoi :
1. Renseigner date envoi dans `docs/prospection/leads-tracker.md` section pilotes
2. Si pas réponse J+5, marquer "Relance #1 envoyée"
3. Si signature : marquer "Pilote signé YYYY-MM-DD" + créer le record `merchants` Supabase (cf. Task 1.9)
