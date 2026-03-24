import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: 1200,
                    height: 630,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #2C2018 0%, #3D2E1F 100%)",
                    fontFamily: "sans-serif",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 20,
                        marginBottom: 40,
                    }}
                >
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: 16,
                            background: "#C8813A",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 32,
                            fontWeight: 900,
                            color: "white",
                        }}
                    >
                        2S
                    </div>
                    <div style={{ fontSize: 48, fontWeight: 800, color: "#F5EDD6", letterSpacing: "-0.03em" }}>
                        Two-Step
                    </div>
                </div>
                <div
                    style={{
                        fontSize: 36,
                        fontWeight: 700,
                        color: "#F5EDD6",
                        textAlign: "center",
                        lineHeight: 1.3,
                        maxWidth: 800,
                    }}
                >
                    Le stock local, visible
                    <span style={{ color: "#C8813A" }}> en temps réel</span>
                </div>
                <div
                    style={{
                        fontSize: 20,
                        color: "rgba(245,237,214,0.6)",
                        marginTop: 20,
                        textAlign: "center",
                    }}
                >
                    Le produit exact que tu cherches, à deux pas de chez toi.
                </div>
            </div>
        ),
        { width: 1200, height: 630 },
    );
}
