"use client";

import { useState } from "react";

interface GlowInputProps {
    name: string;
    label: string;
    type?: string;
    placeholder: string;
    required?: boolean;
}

export function GlowInput({ name, label, type = "text", placeholder, required }: GlowInputProps) {
    const [focused, setFocused] = useState(false);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#C8813A",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
            }}>
                {label}
            </label>
            <div style={{ position: "relative" }}>
                <input
                    name={name}
                    type={type}
                    placeholder={placeholder}
                    required={required}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    style={{
                        border: "none",
                        borderBottom: `2px solid ${focused ? "#C8813A" : "rgba(44,32,24,0.18)"}`,
                        background: "transparent",
                        padding: "10px 0",
                        fontSize: 16,
                        fontFamily: "inherit",
                        color: "#2C2018",
                        outline: "none",
                        transition: "border-color 200ms ease",
                        width: "100%",
                    }}
                />
                {/* Focus glow */}
                <div style={{
                    position: "absolute",
                    bottom: -2,
                    left: 0,
                    right: 0,
                    height: 8,
                    background: "rgba(200,129,58,0.15)",
                    filter: "blur(6px)",
                    opacity: focused ? 1 : 0,
                    transition: "opacity 200ms ease",
                    pointerEvents: "none",
                }} />
            </div>
        </div>
    );
}
