import { Resend } from "resend";

export async function sendIntentEmail(
    merchantEmail: string,
    merchantName: string,
    userName: string,
    productName: string,
    selectedSize: string | null,
): Promise<void> {
    if (!process.env.RESEND_API_KEY) return;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const sizeText = selectedSize ? ` en taille ${selectedSize}` : "";
    await resend.emails.send({
        from: "Two-Step <notifications@twostep.fr>",
        to: merchantEmail,
        subject: `${userName} arrive pour ${productName}${sizeText}`,
        html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #1A1F36; font-size: 18px; margin-bottom: 16px;">Un client arrive !</h2>
                <p style="color: #6B7799; font-size: 14px; line-height: 1.6;">
                    <strong>${userName}</strong> est intéressé(e) par <strong>${productName}</strong>${sizeText}
                    chez <strong>${merchantName}</strong>.
                </p>
                <p style="color: #6B7799; font-size: 14px; line-height: 1.6;">
                    Ce signal est valable 2h — sous réserve de disponibilité.
                </p>
                <hr style="border: none; border-top: 1px solid #E2E5F0; margin: 20px 0;" />
                <p style="color: #8E96B0; font-size: 12px;">
                    Two-Step — Le stock local, visible en temps réel
                </p>
            </div>
        `,
    }).catch(() => {});
}
