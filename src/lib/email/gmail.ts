import { google } from "googleapis";
import type { EmailMessage, IEmailProvider } from "./types";

const ACCEPTED_MIME_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "text/csv",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".xlsx", ".xls", ".csv"];

function hasAcceptedExtension(filename: string): boolean {
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
}

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

export const gmailProvider: IEmailProvider = {
    name: "gmail",

    getAuthUrl(merchantId: string): string {
        return oauth2Client.generateAuthUrl({
            access_type: "offline",
            scope: SCOPES,
            state: merchantId,
            prompt: "consent",
        });
    },

    async exchangeCode(code: string) {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        const profile = await gmail.users.getProfile({ userId: "me" });

        return {
            access_token: tokens.access_token!,
            refresh_token: tokens.refresh_token ?? null,
            email_address: profile.data.emailAddress!,
        };
    },

    async fetchInvoiceEmails(accessToken: string, since: Date | null) {
        oauth2Client.setCredentials({ access_token: accessToken });
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        let query = "has:attachment {filename:pdf filename:xlsx filename:xls filename:csv}";
        if (since) {
            const afterDate = since.toISOString().split("T")[0].replace(/-/g, "/");
            query += ` after:${afterDate}`;
        }

        const res = await gmail.users.messages.list({
            userId: "me",
            q: query,
            maxResults: 50,
        });

        if (!res.data.messages?.length) return [];

        const emails: EmailMessage[] = [];

        for (const msg of res.data.messages) {
            const detail = await gmail.users.messages.get({
                userId: "me",
                id: msg.id!,
                format: "full",
            });

            const headers = detail.data.payload?.headers ?? [];
            const from = headers.find((h) => h.name === "From")?.value ?? "";
            const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
            const date = new Date(
                headers.find((h) => h.name === "Date")?.value ?? ""
            );

            const attachments: { filename: string; mimeType: string; content: Buffer }[] = [];
            const parts = detail.data.payload?.parts ?? [];

            for (const part of parts) {
                if (
                    part.filename &&
                    part.body?.attachmentId &&
                    (ACCEPTED_MIME_TYPES.includes(part.mimeType ?? "") || hasAcceptedExtension(part.filename))
                ) {
                    const attachment = await gmail.users.messages.attachments.get({
                        userId: "me",
                        messageId: msg.id!,
                        id: part.body.attachmentId,
                    });

                    attachments.push({
                        filename: part.filename,
                        mimeType: part.mimeType ?? "application/octet-stream",
                        content: Buffer.from(attachment.data.data!, "base64"),
                    });
                }
            }

            if (attachments.length > 0) {
                emails.push({
                    messageId: msg.id!,
                    from,
                    subject,
                    date,
                    attachments,
                });
            }
        }

        return emails;
    },

    async refreshToken(refreshToken: string) {
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();
        return {
            access_token: credentials.access_token!,
            expires_at: new Date(credentials.expiry_date!).toISOString(),
        };
    },
};
