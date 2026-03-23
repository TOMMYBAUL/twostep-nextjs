export type EmailAttachment = {
    filename: string;
    mimeType: string;
    content: Buffer;
};

export type EmailMessage = {
    messageId: string;
    from: string;
    subject: string;
    date: Date;
    attachments: EmailAttachment[];
};

export interface IEmailProvider {
    name: string;

    /** Get OAuth authorization URL (for Gmail/Outlook) */
    getAuthUrl(merchantId: string): string;

    /** Exchange OAuth code for tokens */
    exchangeCode(code: string): Promise<{
        access_token: string;
        refresh_token: string | null;
        email_address: string;
    }>;

    /** Fetch unread emails with invoice attachments (PDF, XLSX, XLS, CSV) since last sync */
    fetchInvoiceEmails(
        accessToken: string,
        since: Date | null
    ): Promise<EmailMessage[]>;

    /** Refresh expired access token */
    refreshToken(refreshToken: string): Promise<{
        access_token: string;
        expires_at: string;
    }>;
}
