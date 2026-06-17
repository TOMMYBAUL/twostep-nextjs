import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { configDefaults, defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    test: {
        environment: "jsdom",
        setupFiles: ["./tests/setup.ts"],
        globals: true,
        // tests/db/** = tests d'intégration qui frappent la vraie base Supabase
        // (réseau live). On les EXCLUT du run par défaut + du gate pre-push pour
        // qu'il reste déterministe (sinon une coupure réseau / une inspection TLS
        // type NetLimiter casse le push sans qu'aucun code ne soit en cause).
        // Ils tournent via `npm run test:db` (et en CI, hors machine locale).
        exclude: [...configDefaults.exclude, "tests/db/**"],
    },
    resolve: {
        alias: {
            "@": resolve(__dirname, "./src"),
        },
    },
});
