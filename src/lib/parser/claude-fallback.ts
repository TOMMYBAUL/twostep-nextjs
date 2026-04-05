import type { IInvoiceParser, ParsedInvoice } from "./types";
import { extractInvoicePrompt, parseJsonResponse } from "./shared";

export const claudeParser: IInvoiceParser = {
    name: "claude",

    async parse(pdfBuffer: Buffer): Promise<ParsedInvoice> {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 2048,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "document",
                                source: {
                                    type: "base64",
                                    media_type: "application/pdf",
                                    data: pdfBuffer.toString("base64"),
                                },
                            },
                            {
                                type: "text",
                                text: extractInvoicePrompt("[Voir le PDF ci-joint]"),
                            },
                        ],
                    },
                ],
            }),
        });

        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.content[0]?.text ?? "";
        return parseJsonResponse(text);
    },
};
