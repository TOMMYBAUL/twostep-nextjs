import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedInvoiceItem } from "@/lib/parser/types";
import { extractSize, stripSize } from "@/lib/pos/extract-size";
import { groupVariantsByEAN } from "@/lib/pos/sync-engine";
import { selectProductsToZero, chunk, type ReconcileDecision } from "@/lib/ingest/reconcile";
import { triageStockItems, type TriageReport } from "@/lib/ingest/triage";
import type { ColumnCoverage } from "@/lib/ingest/parse-stock";
import { captureError } from "@/lib/error";
import { fetchAllRows } from "@/lib/supabase/paginate";

export type SnapshotResult = {
    products_created: number;
    products_updated: number;
    stock_replaced: number;
    /** Produits passés à 0 par réconciliation (présents avant, absents du push). */
    stock_zeroed: number;
    /** true si la réconciliation a été annulée par le garde-fou (push partiel suspect). */
    reconcile_skipped: boolean;
    total_items: number;
    errors: string[];
    /** Rapport de triage d'identité (règle GTIN/SKU — rejets comptés, jamais silencieux). */
    triage: Omit<TriageReport, "accepted">;
    /**
     * Couverture des colonnes critiques du fichier (si l'appelant l'a fournie).
     * `quantity:false` = la colonne quantité n'a pas été reconnue → toutes les
     * quantités valent 1 (« présence ») → perte SIGNALÉE (errors + Sentry), jamais muette.
     */
    column_coverage?: ColumnCoverage;
    /** true si exécution en simulation (preview wizard) — AUCUNE écriture effectuée. */
    dry_run: boolean;
};

export type SnapshotOptions = {
    /**
     * Réconcilier la décrémentation : mettre à 0 les produits déjà connus mais
     * absents de ce push (article vendu sorti de l'export). Vrai pour un push
     * "snapshot complet" (token NearSt), faux pour un import partiel.
     */
    reconcile?: boolean;
    /**
     * Simulation pour le wizard d'import : calcule tout (matching, triage,
     * décision de réconciliation) mais n'écrit RIEN et ne lance pas
     * l'enrichissement. Le marchand confirme, puis on rappelle sans dryRun.
     */
    dryRun?: boolean;
    /**
     * Couverture des colonnes critiques telle que détectée au parse (`parseStockFile`).
     * Fournie par l'appelant car le triage/ingest ne voit que les items, pas l'en-tête.
     * Sert à SIGNALER une colonne quantité non reconnue (sinon qty=1 muet sur tout le fichier).
     */
    coverage?: ColumnCoverage;
};

/**
 * Ingère un SNAPSHOT de stock (catalogue complet) pour un marchand.
 *
 * Sémantique "REPLACE" (≠ facture qui ADD) : la quantité du fichier devient la
 * quantité courante. C'est le contrat NearSt : `{code-barres, quantité, prix}`
 * poussé périodiquement, chaque push remplace l'état.
 *
 * Cette fonction est le cœur partagé entre :
 *   - l'upload manuel authentifié (`/api/catalog/import`, modes preview/apply)
 *   - le push récurrent sans session, par jeton (`/api/ingest/stock`)
 *
 * Étapes : triage d'identité (GTIN/SKU, nom seul rejeté) → groupage par taille →
 * match (EAN > SKU > nom) → replace stock → réconciliation gardée → création
 * invisible → ENQUEUE enrichment_jobs (l'enrichissement/score/visibilité est
 * asynchrone, drainé par /api/cron/enrich-products). En dryRun : simulation sans
 * écriture. La réponse HTTP reste rapide même pour de gros catalogues.
 *
 * @param admin  Client service_role (bypass RLS — appelé serveur uniquement).
 */
export async function ingestStockSnapshot(
    merchantId: string,
    items: ParsedInvoiceItem[],
    admin: SupabaseClient,
    opts: SnapshotOptions = {},
): Promise<SnapshotResult> {
    const errors: string[] = [];
    const touched = new Set<string>();
    const dryRun = opts.dryRun === true;

    // Règle d'identité : GTIN valide ou SKU exploitable, sinon rejet compté.
    // Le nom seul n'est JAMAIS une identité d'ingestion.
    const { accepted, ...triageSummary } = triageStockItems(items);

    // ── Alerte de COUVERTURE DE COLONNES (invariant north-star « ne rien perdre
    // silencieusement ») ──────────────────────────────────────────────────────
    // Si l'en-tête « quantité » n'a pas été reconnu au parse, CHAQUE ligne est
    // retombée sur qty=1 (« présence ») dans `parseStockFile`. Sans signal, un
    // marchand dont le fichier portait de vraies quantités verrait « 1 de chaque »
    // affiché comme une vérité. On rend ce défaut VISIBLE : un message d'erreur
    // (→ statut honnête « partial » côté route + wizard) et, hors simulation, un
    // signal Sentry. On ne CHANGE pas la sémantique présence (décision produit) —
    // on l'arrête juste d'être muette. (`identifier`/`price` manquants sont déjà
    // non-silencieux en aval : tout-rejeté → `no_exploitable` ; prix optionnel.)
    if (opts.coverage && opts.coverage.quantity === false && accepted.length > 0) {
        errors.push(
            "Colonne quantité non reconnue dans l'en-tête : toutes les quantités sont à 1 " +
                "(mode « présence »). Vérifiez l'intitulé de la colonne quantité du fichier.",
        );
        if (!dryRun) {
            captureError(new Error("Stock ingest: colonne quantité non détectée (qty=1 sur tout le fichier)"), {
                lib: "ingest/snapshot",
                phase: "column-coverage-quantity",
                merchantId,
                accepted: accepted.length,
            });
        }
    }

    // Index des produits existants (match EAN > SKU > nom).
    // LÈVE si la lecture échoue : sans cet index, AUCUN produit ne matcherait →
    // chaque ligne serait créée en doublon de TOUT le catalogue (corruption
    // silencieuse). Mieux vaut échouer fort (les 2 routes catch + captureError)
    // que dupliquer toute la boutique en aveugle. (north-star : « erreurs qui
    // lèvent, jamais [] masqué ».)
    // PAGINÉ (KEYSET) : un SELECT non borné est tronqué à 1000 lignes par PostgREST
    // (sans erreur) → sur un catalogue >1000, les produits au-delà du 1000ᵉ seraient
    // absents de l'index → recréés en DOUBLON. `fetchAllRows` lit tout le catalogue
    // en paginant par KEYSET (`.order("id")` + `.gt("id", curseur)`) → dérive-immune :
    // même sous écriture concurrente (`/api/catalog/import` n'a PAS de `sync_lock`),
    // aucune ligne ne tombe dans le trou entre deux pages (≠ OFFSET `.range()`).
    const { data: existingProducts, error: existingErr } = await fetchAllRows<{
        id: string;
        ean: string | null;
        name: string | null;
        sku: string | null;
    }>(() =>
        admin
            .from("products")
            .select("id, ean, name, sku")
            .eq("merchant_id", merchantId)
            .order("id", { ascending: true }),
    );
    if (existingErr) {
        throw new Error(`Lecture des produits existants échouée (matching impossible): ${existingErr.message}`);
    }

    const byEan = new Map<string, string>();
    const bySku = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const p of existingProducts ?? []) {
        if (p.ean) byEan.set(p.ean, p.id);
        if (p.sku) bySku.set(p.sku.toLowerCase(), p.id);
        if (p.name) byName.set(p.name.toLowerCase().trim(), p.id);
    }

    // Groupage par nom de base (taille retirée) pour fusionner les variantes.
    // Taille : on PRÉFÈRE la colonne dédiée du fichier (fiable) à l'extraction
    // regex du nom (déduction faillible). _sizeSource trace l'origine pour
    // l'afficher honnêtement / la faire valider au besoin.
    type SizeSource = "file_column" | "name_regex" | null;
    type CatalogItem = ParsedInvoiceItem & { _size: string | null; _sizeSource: SizeSource; _cleanName: string };
    const groups = new Map<string, CatalogItem[]>();
    for (const item of accepted) {
        const colSize = item.size?.trim() || null;
        const nameSize = colSize ? null : extractSize(item.name);
        const size = colSize ?? nameSize;
        const sizeSource: SizeSource = colSize ? "file_column" : (nameSize ? "name_regex" : null);
        // On ne retire la taille du nom que si elle a été DÉDUITE du nom ; si elle
        // vient d'une colonne, le nom est déjà le nom de base.
        const cleanName = nameSize ? stripSize(item.name) : item.name;
        const normalized: CatalogItem = { ...item, _size: size, _sizeSource: sizeSource, _cleanName: cleanName };
        const key = cleanName.toLowerCase().trim();
        const group = groups.get(key) ?? [];
        group.push(normalized);
        groups.set(key, group);
    }

    let productsCreated = 0;
    let productsUpdated = 0;
    let stockReplaced = 0;
    const createdProductIds: string[] = [];

    // ── PLAN BATCHÉ (SCALE / VOLUME — pilier 1 north-star « ne rien oublier ») ────
    // Un premier push d'onboarding pilote (boutique multimarque type Deerskin =
    // MILLIERS de SKU NEUFS) faisait, PAR PRODUIT, jusqu'à 4 aller-retours réseau
    // SÉQUENTIELS (products.insert + stock.upsert + available_sizes.update +
    // feed_events.insert). Sur des milliers de produits, ces O(N) appels sériés
    // DÉPASSENT le budget temps Vercel → fonction TUÉE en plein vol → ingestion
    // tronquée SILENCIEUSEMENT (même classe de perte n°1 que le cron google-feed).
    // On ACCUMULE ici (boucle quasi-pure pour les créations) puis on FLUSH par LOTS
    // de 500 (comme la réconciliation `chunk()`), ce qui borne les aller-retours.
    const nowIso = new Date().toISOString();
    // Lignes d'insert des produits NEUFS (id pré-assigné ; available_sizes plié dans
    // l'insert → 1 write de moins que l'ancien insert+update séparé).
    const productInserts: Array<Record<string, unknown>> = [];
    // Index id → ligne d'insert PENDING : un groupe ULTÉRIEUR du MÊME push qui matche
    // un produit créé plus tôt (même EAN, libellé différent = dédoublonnage intra-push)
    // applique son prix/tailles à la ligne pending, PAS un UPDATE sur une ligne pas
    // encore écrite (sinon la mise à jour serait perdue). Cf. tests maillon 3.
    const insertRowById = new Map<string, Record<string, unknown>>();
    // Stock à écrire, DÉDUPLIQUÉ par product_id (dernier gagne = sémantique REPLACE ;
    // évite aussi l'erreur Postgres « ON CONFLICT ne peut affecter 2× la même ligne »
    // quand un même produit apparaît en create PUIS update dans le même push).
    const stockByProduct = new Map<string, Record<string, unknown>>();
    // feed_events new_product des créations, écrits par lots.
    const newProductFeedEvents: Array<Record<string, unknown>> = [];
    // MAJ métadonnée (prix/tailles) des produits PRÉ-EXISTANTS, écrites par lots au
    // flush. Un re-push d'onboarding/quotidien d'un GROS catalogue (Deerskin =
    // milliers de SKU, TOUS pré-existants au 2ᵉ push) ferait sinon O(N) `.update()`
    // SÉQUENTIELS → budget temps Vercel dépassé → fonction tuée → ingestion tronquée
    // SILENCIEUSEMENT (même classe de perte n°1 que les créations, déjà batchées).
    const productUpdates: Array<{ id: string; name: string; updates: Record<string, unknown> }> = [];
    // ids des produits NEUFS (ordre du push) : le comptage + l'enfilage enrichissement
    // se font APRÈS le flush (on ne compte/enfile qu'un produit RÉELLEMENT inséré).
    const plannedNewIds: string[] = [];

    for (const [, groupItems] of groups) {
        const firstItem = groupItems[0];
        const cleanName = firstItem._cleanName;
        if (!cleanName.trim()) continue;

        const validItems = groupItems.filter((g) => g.quantity >= 0);
        if (validItems.length === 0) continue;

        // Match : EAN (sur tout le groupe), puis SKU, puis nom (le nom n'est
        // qu'une aide au dédoublonnage de l'existant — jamais une identité).
        let productId: string | null = null;
        for (const g of validItems) {
            if (g.ean && byEan.has(g.ean)) {
                productId = byEan.get(g.ean)!;
                break;
            }
        }
        if (!productId) {
            for (const g of validItems) {
                if (g.sku && bySku.has(g.sku.toLowerCase())) {
                    productId = bySku.get(g.sku.toLowerCase())!;
                    break;
                }
            }
        }
        if (!productId && byName.has(cleanName.toLowerCase().trim())) {
            productId = byName.get(cleanName.toLowerCase().trim())!;
        }

        const availableSizes = validItems
            .filter((g) => g._size)
            .map((g) => ({ size: g._size!, quantity: g.quantity, source: g._sizeSource ?? "name_regex" }));
        const totalStock = validItems.reduce((sum, g) => sum + g.quantity, 0);
        const price = firstItem.unit_price && firstItem.unit_price > 0 ? firstItem.unit_price : null;

        if (productId) {
            // On ne touche PAS à `visible` : la visibilité est gouvernée par le gate
            // cascade/validation ; un push de stock ne doit jamais ressusciter un
            // produit masqué (soft-delete, score < 0,95, signalements…).
            const pendingRow = insertRowById.get(productId);
            if (pendingRow) {
                // Match sur un produit CRÉÉ plus tôt dans CE push (dédoublonnage
                // intra-push) → fusionne dans la ligne d'insert pending. Un UPDATE
                // DB ici viserait une ligne pas encore écrite (perdu).
                if (price != null) pendingRow.price = price;
                if (availableSizes.length > 0) pendingRow.available_sizes = availableSizes;
            } else if (!dryRun) {
                // Produit PRÉ-EXISTANT : MAJ métadonnée (prix/tailles) DIFFÉRÉE au flush
                // batché (cf. `productUpdates`). On ne planifie QUE les colonnes réellement
                // présentes (jamais `price:null` qui écraserait un prix inchangé). Le STOCK
                // (donnée critique) et `touched` sont posés ci-dessous INDÉPENDAMMENT — un
                // échec de MAJ métadonnée au flush ne peut donc jamais exclure le produit de
                // `touched` (réconciliation → 0 = faux « rupture », perte n°1). (F2, revue SF)
                const updates: Record<string, unknown> = {};
                if (price != null) updates.price = price;
                if (availableSizes.length > 0) updates.available_sizes = availableSizes;
                if (Object.keys(updates).length > 0) {
                    productUpdates.push({ id: productId, name: cleanName, updates });
                }
            }
            // REPLACE le stock (dédup par product_id, dernier gagne).
            stockByProduct.set(productId, { product_id: productId, quantity: totalStock, updated_at: nowIso, source: "file_push", source_ts: nowIso });
            touched.add(productId);
            productsUpdated++;
        } else {
            // CREATE — invisible jusqu'à validation cascade ≥ 0.95. Écriture DIFFÉRÉE
            // au flush batché. On enregistre l'identité dans les index MAINTENANT pour
            // que les groupes suivants du même push la MATCHENT (dédoublonnage intra-push).
            const newId = crypto.randomUUID();
            const insertRow: Record<string, unknown> = {
                id: newId,
                merchant_id: merchantId,
                name: cleanName,
                price,
                ean: firstItem.ean || null,
                sku: firstItem.sku || null,
                visible: false,
                review_status: "pending",
            };
            if (availableSizes.length > 0) insertRow.available_sizes = availableSizes;
            productInserts.push(insertRow);
            insertRowById.set(newId, insertRow);
            stockByProduct.set(newId, { product_id: newId, quantity: totalStock, updated_at: nowIso, source: "file_push", source_ts: nowIso });
            newProductFeedEvents.push({ merchant_id: merchantId, product_id: newId, event_type: "new_product" });
            plannedNewIds.push(newId);

            if (firstItem.ean) byEan.set(firstItem.ean, newId);
            if (firstItem.sku) bySku.set(firstItem.sku.toLowerCase(), newId);
            byName.set(cleanName.toLowerCase().trim(), newId);
            touched.add(newId);
        }
    }

    // ── FLUSH BATCHÉ ─────────────────────────────────────────────────────────────
    // Écritures groupées par lots de 500 (products → stock → feed_events), dans cet
    // ordre (FK product_id → products doit exister avant stock/feed_events).
    if (!dryRun) {
        const plannedNewIdSet = new Set(plannedNewIds);
        const createdOkIds = new Set<string>();

        // 1) Produits NEUFS — lots de 500, avec REPLI ISOLANT par ligne sur échec de
        //    lot : un INSERT PostgREST est transactionnel → une seule ligne fautive
        //    (ex. collision de slug FR « café »/« cafe » → même slug unique généré par
        //    trigger) ferait échouer les 499 saines. On réinsère alors ligne par ligne
        //    pour ne perdre QUE la fautive (SIGNALÉE + Sentry, jamais avalée) —
        //    préserve l'isolation d'échec de l'ancien insert par-produit.
        for (const batch of chunk(productInserts, 500)) {
            const { error: insErr } = await admin.from("products").insert(batch);
            if (!insErr) {
                for (const r of batch) createdOkIds.add(r.id as string);
                continue;
            }
            for (const r of batch) {
                const { error: rowErr } = await admin.from("products").insert(r);
                if (rowErr) {
                    errors.push(`Create ${(r.name as string) || (r.id as string)}: ${rowErr.message}`);
                    captureError(rowErr, { lib: "ingest/snapshot", phase: "create-product-insert", merchantId });
                } else {
                    createdOkIds.add(r.id as string);
                }
            }
        }
        productsCreated = createdOkIds.size;
        for (const id of plannedNewIds) if (createdOkIds.has(id)) createdProductIds.push(id);

        // 2) Produits PRÉ-EXISTANTS — MAJ métadonnée (prix/tailles) par LOTS. PostgREST
        //    n'a pas d'UPDATE multi-valeurs → on GROUPE par FORME de colonnes présentes
        //    (`price` seul / `available_sizes` seul / les deux) et on `upsert` chaque
        //    groupe (onConflict id). Le groupage par forme est CE QUI ÉVITE LE PIÈGE du
        //    batch naïf : dans un upsert PostgREST, une colonne absente d'une ligne est
        //    mise à NULL (union des colonnes du corps) → mélanger `{price}` et
        //    `{available_sizes}` NULLERAIT le prix du 2ᵉ. Un groupe = colonnes uniformes
        //    → jamais de null injecté (un prix inchangé n'est jamais écrasé). L'upsert ne
        //    touche QUE ses colonnes (DO UPDATE SET price/available_sizes) — name/visible/
        //    review_status/ean/sku intacts. SÛRETÉ ligne concurremment supprimée : products
        //    a merchant_id ET name NOT NULL → un INSERT partiel (pas de conflit) violerait
        //    NOT NULL → le lot ÉCHOUE (jamais de résurrection en ligne partielle) → REPLI
        //    mono-ligne `.update().eq(id)` (no-op sûr sur ligne absente), isolant la faute
        //    comme les créations. captureError phase "update-product" (jamais avalé).
        const updateGroups = new Map<string, typeof productUpdates>();
        for (const u of productUpdates) {
            const shape = Object.keys(u.updates).sort().join(",");
            const g = updateGroups.get(shape) ?? [];
            g.push(u);
            updateGroups.set(shape, g);
        }
        for (const group of updateGroups.values()) {
            for (const batch of chunk(group, 500)) {
                const payload = batch.map((u) => ({ id: u.id, ...u.updates }));
                const { error: upErr } = await admin.from("products").upsert(payload, { onConflict: "id" });
                if (!upErr) continue;
                // Lot en échec → repli mono-ligne (isole la faute ; `.update` no-ope sûrement
                // sur une ligne absente, sans risque d'INSERT partiel de l'upsert).
                for (const u of batch) {
                    const { error: rowErr } = await admin.from("products").update(u.updates).eq("id", u.id);
                    if (rowErr) {
                        errors.push(`Update ${u.name}: ${rowErr.message}`);
                        captureError(rowErr, { lib: "ingest/snapshot", phase: "update-product", merchantId });
                    }
                }
            }
        }

        // 3) Stock (REPLACE) — créations OK + updates, par lots (onConflict product_id).
        //    Un produit dont l'insert a ÉCHOUÉ est EXCLU (sa ligne stock violerait la
        //    FK). Un lot en échec est SIGNALÉ + Sentry, non compté (perte VISIBLE, pas
        //    avalée = enjeu n°1) ; le re-push le rejoue (auto-guérison). stock_replaced
        //    compte les lignes réellement écrites (jamais un mensonge).
        const stockRows = [...stockByProduct.values()].filter((r) => {
            const pid = r.product_id as string;
            return plannedNewIdSet.has(pid) ? createdOkIds.has(pid) : true;
        });
        for (const batch of chunk(stockRows, 500)) {
            const { error: stockErr } = await admin.from("stock").upsert(batch, { onConflict: "product_id" });
            if (stockErr) {
                errors.push(`Stock (lot de ${batch.length}): ${stockErr.message}`);
                captureError(stockErr, { lib: "ingest/snapshot", phase: "stock-upsert-batch", merchantId });
                continue;
            }
            stockReplaced += batch.length;
        }

        // 4) feed_events new_product des créations RÉELLEMENT insérées — lots, non
        //    bloquant (canal notification favoris) mais plus jamais avalé.
        const feedRows = newProductFeedEvents.filter((e) => createdOkIds.has(e.product_id as string));
        for (const batch of chunk(feedRows, 500)) {
            const { error: feedErr } = await admin.from("feed_events").insert(batch);
            if (feedErr) {
                errors.push(`feed_events création (lot de ${batch.length}): ${feedErr.message}`);
                captureError(feedErr, { lib: "ingest/snapshot", phase: "create-feed-events", merchantId });
            }
        }
    } else {
        // dryRun (preview wizard) : COMPTE ce qui SE FERAIT, parité avec l'ancien
        // comptage inline, AUCUNE écriture. stock_replaced = produits distincts touchés.
        productsCreated = productInserts.length;
        stockReplaced = stockByProduct.size;
    }

    // ── Réconciliation de décrémentation ──────────────────────────────────────
    // Les produits déjà en stock mais ABSENTS de ce push (article vendu, sorti de
    // l'export) doivent passer à 0. Garde-fou anti-fichier-partiel dans reconcile.ts.
    let stockZeroed = 0;
    let reconcileSkipped = false;
    // Jamais de réconciliation depuis un push sans AUCUNE ligne exploitable :
    // sur un petit catalogue (< minCatalogForGuard), le garde-fou de couverture
    // ne s'applique pas et un fichier illisible viderait toute la boutique.
    if (opts.reconcile && accepted.length === 0) {
        reconcileSkipped = true;
        errors.push("Réconciliation annulée: aucune ligne exploitable dans le push");
    }
    if (opts.reconcile && accepted.length > 0) {
        // PAGINÉ (KEYSET) : même troncature silencieuse `max-rows` que l'index ci-dessus.
        // Un catalogue >1000 produits en stock verrait sa lecture coupée à 1000 →
        // les produits VENDUS au-delà (absents du push) ne seraient jamais candidats
        // au passage à 0 → resteraient « en stock » = faux positif n°1. On lit tout.
        // Curseur = `product_id` (colonne d'ordre de cette lecture, ≠ `id` par défaut) :
        // le helper applique `.gt("product_id", curseur)` → keyset dérive-immune même si
        // le call site (`/api/catalog/import`) n'a pas de `sync_lock`.
        const { data: inStockRows, error: inStockErr } = await fetchAllRows<{
            product_id: string;
            quantity: number;
        }>(
            () =>
                admin
                    .from("stock")
                    .select("product_id, quantity, products!inner(merchant_id)")
                    .eq("products.merchant_id", merchantId)
                    .gt("quantity", 0)
                    .order("product_id", { ascending: true }),
            { column: "product_id" },
        );

        // Si la lecture du stock en cours échoue, on NE PEUT PAS décider quels
        // produits passer à 0. Un `inStockRows ?? []` silencieux ferait croire que
        // rien n'est en stock → réconciliation no-op → les articles VENDUS restent
        // affichés « en stock » (faux positif n°1). On rend l'échec VISIBLE (statut
        // partial/error côté route + Sentry) au lieu de le masquer.
        if (inStockErr) {
            captureError(inStockErr, { lib: "ingest/snapshot", phase: "reconcile-read-instock", merchantId });
        }

        const existingInStock = ((inStockRows ?? []) as unknown as {
            product_id: string;
            quantity: number;
        }[]).map((r) => ({ id: r.product_id, quantity: r.quantity }));

        // Lecture en échec → skip gardé (avec raison) ; sinon décision normale.
        const decision: ReconcileDecision = inStockErr
            ? { toZero: [], skipped: true, reason: `lecture du stock en cours échouée: ${inStockErr.message}` }
            : selectProductsToZero(touched, existingInStock);
        if (decision.skipped) {
            reconcileSkipped = true;
            errors.push(`Réconciliation annulée: ${decision.reason}`);
        } else if (decision.toZero.length > 0) {
            if (dryRun) {
                // Preview : on annonce combien de produits PASSERAIENT à 0.
                stockZeroed = decision.toZero.length;
            } else {
                // Batch : un seul .in() sur des milliers d'UUID dépasse la limite
                // d'URL PostgREST → échec EN BLOC. On découpe (comme le sync POS).
                // source="file_push" : c'est le push fichier qui décide l'épuisement
                // (absence du snapshot) → le writer déclare sa source (migration 104),
                // au lieu de laisser la source précédente mentir.
                for (const batch of chunk(decision.toZero, 500)) {
                    const nowIso = new Date().toISOString();
                    const { error: zeroErr } = await admin
                        .from("stock")
                        .update({ quantity: 0, updated_at: nowIso, source: "file_push", source_ts: nowIso })
                        .in("product_id", batch);
                    if (zeroErr) {
                        // C'est LE write le plus critique de la réconciliation (passage à 0
                        // = « épuisé »). Un échec laisse les produits VENDUS affichés « en
                        // stock » = faux positif n°1. Il était SIGNALÉ (errors → statut
                        // partial) mais PAS envoyé à Sentry, alors que tous les autres writes
                        // de la fonction le sont → seul angle mort Sentry, comblé. (revue SF)
                        errors.push(`Réconciliation stock=0 (lot de ${batch.length}): ${zeroErr.message}`);
                        captureError(zeroErr, { lib: "ingest/snapshot", phase: "reconcile-stock-zero", merchantId });
                        continue;
                    }
                    stockZeroed += batch.length;
                    // Honnêteté d'affichage : un produit DÉCRÉMENTÉ à 0 (sorti de
                    // l'export = épuisé) garde sinon son `available_sizes` JSON avec
                    // des quantités positives périmées → la fiche produit afficherait
                    // encore des pointures « disponibles » et la facette de tailles
                    // globale (`/api/products/available-sizes`, gate visible-only) un
                    // chip fantôme. La liste discover filtre déjà sur stock>0, mais
                    // la fiche/facette lisent `available_sizes.quantity`, pas le total.
                    // On vide donc les tailles des produits passés à 0 (restauré au
                    // prochain push qui les contient). Non bloquant (le stock=0 est
                    // l'essentiel) mais jamais avalé. `[]` = sentinelle vide du schéma.
                    const { error: sizesZeroErr } = await admin
                        .from("products")
                        .update({ available_sizes: [] })
                        .in("id", batch);
                    if (sizesZeroErr) {
                        errors.push(`Réconciliation available_sizes (lot de ${batch.length}): ${sizesZeroErr.message}`);
                        captureError(sizesZeroErr, { lib: "ingest/snapshot", phase: "reconcile-available-sizes", merchantId });
                    }
                    const { error: feedErr } = await admin.from("feed_events").insert(
                        batch.map((pid) => ({
                            merchant_id: merchantId,
                            product_id: pid,
                            event_type: "out_of_stock",
                        })),
                    );
                    if (feedErr) {
                        // Non bloquant (le stock=0 est déjà écrit, c'est l'essentiel)
                        // mais on ne l'avale plus silencieusement.
                        errors.push(`Réconciliation feed_events (lot de ${batch.length}): ${feedErr.message}`);
                        captureError(feedErr, { lib: "ingest/snapshot", phase: "reconcile-feed-events", merchantId });
                    }
                }
            }
        }
    }

    // ── Simulation (preview wizard) : on s'arrête ici, rien n'a été écrit ─────
    if (dryRun) {
        return {
            products_created: productsCreated,
            products_updated: productsUpdated,
            stock_replaced: stockReplaced,
            stock_zeroed: stockZeroed,
            reconcile_skipped: reconcileSkipped,
            total_items: items.length,
            errors,
            triage: triageSummary,
            column_coverage: opts.coverage,
            dry_run: true,
        };
    }

    // Regroupement des variantes par EAN (rapide, synchrone)
    try {
        await groupVariantsByEAN(admin, merchantId);
    } catch (err) {
        captureError(err, { lib: "ingest/snapshot", phase: "group-variants", merchantId });
    }

    // Enrichissement DÉCOUPLÉ : on enfile les nouveaux produits dans la file
    // enrichment_jobs, drainée par /api/cron/enrich-products. L'enrichissement
    // (lookups EAN, cascade, image, catégorisation) coûte 10-30 s/produit en série
    // — le faire ici ferait timeout la requête HTTP dès ~100 produits. Les
    // produits restent invisibles (visible=false/pending) jusqu'au passage du worker.
    if (createdProductIds.length > 0) {
        // Lots de 500 : un enfilage de plusieurs milliers de nouveaux produits en un
        // seul insert construirait un corps de requête énorme (risque de rejet) → on
        // borne comme le reste du flush. Ne bloque pas l'ingestion : le stock est déjà
        // à jour ; un lot en échec est SIGNALÉ + Sentry (le worker enrich ne le verra
        // pas → produit invisible, mais jamais silencieux).
        for (const batch of chunk(createdProductIds, 500)) {
            const { error: enqueueErr } = await admin
                .from("enrichment_jobs")
                .insert(batch.map((pid) => ({ product_id: pid, merchant_id: merchantId })));
            if (enqueueErr) {
                errors.push(`Enqueue enrichment (lot de ${batch.length}): ${enqueueErr.message}`);
                captureError(enqueueErr, { lib: "ingest/snapshot", phase: "enqueue-enrichment", merchantId });
            }
        }
    }

    return {
        products_created: productsCreated,
        products_updated: productsUpdated,
        stock_replaced: stockReplaced,
        stock_zeroed: stockZeroed,
        reconcile_skipped: reconcileSkipped,
        total_items: items.length,
        errors,
        triage: triageSummary,
        column_coverage: opts.coverage,
        dry_run: false,
    };
}
