export interface MerchantAcquisition {
  cost_estimate_eur: number;
  signed_at: Date | null;
}

/** Pas de CAC tant que le marchand n'a pas converti (signed_at). */
export function computeCAC(m: MerchantAcquisition): number {
  return m.signed_at ? m.cost_estimate_eur : 0;
}
