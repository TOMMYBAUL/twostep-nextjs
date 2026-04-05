import type { IInvoiceParser, ParsedInvoice } from "./types";
import { extractInvoicePrompt, parseJsonResponse } from "./shared";

export const geminiParser: IInvoiceParser = {
    name: "gemini",

    async parse(pdfBuffer: Buffer): Promise<ParsedInvoice> {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    inline_data: {
                                        mime_type: "application/pdf",
                                        data: pdfBuffer.toString("base64"),
                                    },
                                },
                                {
                                    text: extractInvoicePrompt("[Voir le PDF ci-joint]"),
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048,
                    },
                }),
            },
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return parseJsonResponse(text);
    },
};
