import { ImapFlow } from "imapflow";
import type { EmailMessage, IEmailProvider } from "./types";

const ACCEPTED_MIME_TYPES = [
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

export const imapProvider: IEmailProvider = {
    name: "imap",

    getAuthUrl(_merchantId: string): string {
        throw new Error("IMAP does not support OAuth. Use direct credentials.");
    },

    async exchangeCode(_code: string) {
        throw new Error("IMAP does not support OAuth code exchange.");
    },

    async fetchInvoiceEmails(accessToken: string, since: Date | null) {
        // accessToken is JSON-encoded IMAP credentials: {host, port, user, pass}
        const creds = JSON.parse(accessToken) as {
            host: string;
            port: number;
            user: string;
            pass: string;
        };

        const client = new ImapFlow({
            host: creds.host,
            port: creds.port,
            secure: true,
            auth: { user: creds.user, pass: creds.pass },
            logger: false,
        });

        await client.connect();

        const lock = await client.getMailboxLock("INBOX");
        const emails: EmailMessage[] = [];

        try {
            const searchCriteria: Record<string, unknown> = {};
            if (since) {
                searchCriteria.since = since;
            }

            const messages = client.fetch(searchCriteria, {
                envelope: true,
                bodyStructure: true,
                source: true,
            });

            for await (const msg of messages) {
                if (!msg.bodyStructure?.childNodes) continue;

                const invoiceParts = msg.bodyStructure.childNodes.filter(
                    (part) => {
                        const filename = part.dispositionParameters?.filename ?? "";
                        return ACCEPTED_MIME_TYPES.includes(part.type ?? "") || hasAcceptedExtension(filename);
                    }
                );

                if (invoiceParts.length === 0) continue;

                const attachments: { filename: string; mimeType: string; content: Buffer }[] = [];
                for (const part of invoiceParts) {
                    const { content } = await client.download(msg.seq.toString(), part.part);
                    const chunks: Buffer[] = [];
                    for await (const chunk of content) {
                        chunks.push(Buffer.from(chunk));
                    }
                    const partFilename = part.dispositionParameters?.filename ?? "invoice";
                    attachments.push({
                        filename: partFilename,
                        mimeType: part.type ?? "application/octet-stream",
                        content: Buffer.concat(chunks),
                    });
                }

                emails.push({
                    messageId: msg.uid.toString(),
                    from: msg.envelope?.from?.[0]?.address ?? "",
                    subject: msg.envelope?.subject ?? "",
                    date: msg.envelope?.date ?? new Date(),
                    attachments,
                });
            }
        } finally {
            lock.release();
            await client.logout();
        }

        return emails;
    },

    async refreshToken(_refreshToken: string) {
        throw new Error("IMAP does not use refresh tokens.");
    },
};
