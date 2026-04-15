import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Two-Step — Le stock local, visible en temps réel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "80px",
                    background: "linear-gradient(135deg, #0F1218 0%, #1A1F36 50%, #0F1218 100%)",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                {/* Accent glow */}
                <div
                    style={{
                        position: "absolute",
                        top: "-100px",
                        right: "-100px",
                        width: "500px",
                        height: "500px",
                        borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(66,104,255,0.25) 0%, transparent 70%)",
                        display: "flex",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        bottom: "-150px",
                        left: "-50px",
                        width: "400px",
                        height: "400px",
                        borderRadius: "50%",
                        background: "radial-gradient(circle, rgba(66,104,255,0.15) 0%, transparent 70%)",
                        display: "flex",
                    }}
                />

                {/* Badge */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "24px",
                    }}
                >
                    <div
                        style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: "#4268FF",
                            display: "flex",
                        }}
                    />
                    <span
                        style={{
                            color: "rgba(255,255,255,0.5)",
                            fontSize: "18px",
                            fontWeight: 600,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase" as const,
                        }}
                    >
                        Disponible a Toulouse
                    </span>
                </div>

                {/* Title */}
                <div
                    style={{
                        fontSize: "64px",
                        fontWeight: 900,
                        color: "#FFFFFF",
                        lineHeight: 1.1,
                        letterSpacing: "-0.03em",
                        maxWidth: "800px",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <span>Le stock de ton</span>
                    <span>
                        quartier, <span style={{ color: "#4268FF" }}>visible</span>
                    </span>
                </div>

                {/* Subtitle */}
                <div
                    style={{
                        fontSize: "22px",
                        color: "rgba(255,255,255,0.55)",
                        marginTop: "24px",
                        maxWidth: "600px",
                        lineHeight: 1.5,
                        display: "flex",
                    }}
                >
                    Produits reels, boutiques reelles, a cote de chez toi.
                </div>

                {/* Bottom bar */}
                <div
                    style={{
                        position: "absolute",
                        bottom: "50px",
                        left: "80px",
                        right: "80px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                        }}
                    >
                        <div
                            style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "8px",
                                background: "#4268FF",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "18px",
                                fontWeight: 900,
                                color: "#FFFFFF",
                            }}
                        >
                            2S
                        </div>
                        <span
                            style={{
                                fontSize: "22px",
                                fontWeight: 800,
                                color: "#FFFFFF",
                            }}
                        >
                            Two-Step
                        </span>
                    </div>
                    <span
                        style={{
                            fontSize: "18px",
                            color: "rgba(255,255,255,0.35)",
                        }}
                    >
                        twostep.fr
                    </span>
                </div>
            </div>
        ),
        { ...size },
    );
}
