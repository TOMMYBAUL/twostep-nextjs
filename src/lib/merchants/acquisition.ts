export interface MerchantAcquisition {
  cost_estimate_eur: number;
  signed_at: Date | null;
}

/**
 * Calcule le CAC (Customer Acquisition Cost) d'un marchand.
 * Retourne 0 si pas encore signé (pas de CAC tant que pas converti).
 */
export function computeCAC(m: MerchantAcquisition): number {
  return m.signed_at ? m.cost_estimate_eur : 0;
}
