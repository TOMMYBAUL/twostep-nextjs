import type { EmailMessage, IEmailProvider } from "./types";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

const ACCEPTED_CONTENT_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".xlsx", ".xls", ".csv"];

function hasAcceptedExtension(filename: string): boolean {
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
}

export const outlookProvider: IEmailProvider = {
    name: "outlook",

    getAuthUrl(merchantId: string): string {
        const params = new URLSearchParams({
            client_id: process.env.MICROSOFT_CLIENT_ID!,
            response_type: "code",
            redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
            scope: "Mail.Read offline_access",
            state: merchantId,
        });
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
    },

    async exchangeCode(code: string) {
        const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID!,
                client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
                code,
                redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
                grant_type: "authorization_code",
            }),
        });
        const tokens = await res.json();

        // Get email address
        const profileRes = await fetch(`${GRAPH_API}/me`, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profile = await profileRes.json();

        return {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            email_address: profile.mail ?? profile.userPrincipalName,
        };
    },

    async fetchInvoiceEmails(accessToken: string, since: Date | null) {
        let filter = "hasAttachments eq true";
        if (since) {
            filter += ` and receivedDateTime ge ${since.toISOString()}`;
        }

        const res = await fetch(
            `${GRAPH_API}/me/messages?$filter=${encodeURIComponent(filter)}&$top=50&$select=id,from,subject,receivedDateTime`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const data = await res.json();
        const messages = data.value ?? [];
        const emails: EmailMessage[] = [];

        for (const msg of messages) {
            // Get attachments (no server-side filter — we filter client-side for multiple types)
            const attRes = await fetch(
                `${GRAPH_API}/me/messages/${msg.id}/attachments`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const attData = await attRes.json();
            const invoiceAttachments = (attData.value ?? []).filter(
                (a: { contentType: string; name: string }) =>
                    ACCEPTED_CONTENT_TYPES.includes(a.contentType) || hasAcceptedExtension(a.name ?? "")
            );

            if (invoiceAttachments.length > 0) {
                emails.push({
                    messageId: msg.id,
                    from: msg.from?.emailAddress?.address ?? "",
                    subject: msg.subject ?? "",
                    date: new Date(msg.receivedDateTime),
                    attachments: invoiceAttachments.map((a: { name: string; contentType: string; contentBytes: string }) => ({
                        filename: a.name,
                        mimeType: a.contentType,
                        content: Buffer.from(a.contentBytes, "base64"),
                    })),
                });
            }
        }

        return emails;
    },

    async refreshToken(refreshToken: string) {
        const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.MICROSOFT_CLIENT_ID!,
                client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
            }),
        });
        const tokens = await res.json();
        return {
            access_token: tokens.access_token,
            expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        };
    },
};
