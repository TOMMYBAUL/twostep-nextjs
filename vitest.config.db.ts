import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Config dédiée aux tests d'intégration "live" (frappent la vraie base Supabase).
// Lancés explicitement via `npm run test:db` — JAMAIS dans le gate pre-push, car
// ils dépendent du réseau et de l'état prod. À exécuter en CI (machine sans
// inspection TLS locale) avant tout merge sur main.
export default defineConfig({
    test: {
        environment: "jsdom",
        setupFiles: ["./tests/setup.ts"],
        globals: true,
        include: ["tests/db/**/*.test.ts"],
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
});
