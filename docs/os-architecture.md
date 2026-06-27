# Architecture de la boucle autonome — la convention OÙ / COMMENT

> Doc **descriptif et stable** (il change rarement). Il fixe *comment notre système
> autonome est structuré*, pour qu'il reste maintenable dans le temps au lieu de
> pourrir. Extrait et adapté d'une méthode « OS pour IA » (séparation domaine/skill,
> état piloté par statut). On n'utilise PAS Obsidian : on applique le noyau à nos
> fichiers Claude Code existants.

## Le principe qui décide de tout : séparer le OÙ du COMMENT

Le piège qui fait pourrir un système IA, c'est de **mélanger au même endroit** les
descriptions, les actions, les chemins et les règles. Le jour où on change un détail
d'implémentation, on casse le reste sans comprendre pourquoi.

La règle, non négociable :

- **Le OÙ / QUOI (domaine)** décrit *ce qui existe, où ça vit, dans quel état*.
  **Jamais d'actions.** Purement descriptif. C'est le plan d'architecte.
- **Le COMMENT (skill)** exécute *une transformation*. Il **lit** les chemins et les
  états dans le domaine — il ne les **redéfinit jamais** lui-même.

Conséquence concrète : on peut changer un workflow sans toucher à la structure, et
réorganiser la structure sans réécrire les workflows. C'est ça qui rend le système
maintenable.

## Notre mapping (fichiers existants → rôles)

| Rôle | Fichier | Contient | Ne contient JAMAIS |
|---|---|---|---|
| **Domaine** (OÙ/QUOI) | `docs/autonomy-priorities.md` | North-star, backlog priorisé, où s'arrêter | les étapes d'exécution d'un run |
| **Garde-fous** (domaine) | `docs/AUTONOMY.md` | contrat, réversible vs irréversible, protocoles | un plan de tâche précis |
| **Skill** (COMMENT) | `docs/routine-prompt.md` | la procédure d'un run, étape par étape | la redéfinition des chemins/états (il les lit) |
| **État / fil conducteur** (STATUT) | `docs/pipeline-state.md` | où on en est, **machine-lisible** | de la prose narrative (→ worklog) |
| **Journal** | `docs/worklog-autonomie.md` | récit détaillé de chaque run | l'état courant canonique (→ pipeline-state) |
| **Mémoire d'erreurs** | `docs/LESSONS.md` | erreurs passées + comment les éviter | — |

## Le fil conducteur : l'état piloté par statut

Sans état machine-lisible, une boucle qui s'arrête en plein milieu (crash, fin de
session, rate-limit) **ne sait pas où elle s'était arrêtée** — elle doit deviner en
relisant de gros docs. La solution : un **statut** porté par `pipeline-state.md`, mis à
jour à chaque run. C'est l'étiquette sur le produit d'une chaîne de montage : elle dit
à quelle étape on en est. Chaque étape reste **atomique** et garde **sa propre
validation** (`test:run` + `tsc`). Si ça casse, on relit le statut et on reprend.

### Schéma de l'état (frontmatter de `pipeline-state.md`)

```yaml
pipeline:     # le workflow métier en cours (ex: "phase-E")
step / step_total / step_name
status:       # enum ci-dessous — le fil conducteur
blocked_on:   # null | "thomas:<quoi>" | "externe:<quoi>"
next_action:  # la PROCHAINE chose à faire, en une phrase
branch / gate / last_run / last_commit
```

### Enum `status` (le seul vocabulaire d'état autorisé)

| statut | sens | qui débloque |
|---|---|---|
| `todo` | maillon sélectionné, pas commencé | la boucle |
| `in_progress` | en cours de construction | la boucle |
| `testing` | construit, en cours de `test:run`/`tsc` | la boucle |
| `pushed` | vert + commit/push sur la branche | la boucle |
| `blocked_human` | besoin d'un GO Thomas (merge/migration/email/dépense) | **Thomas** |
| `blocked_external` | dépend de Google/marchand/tiers | **externe** |
| `done` | maillon terminé, prêt au maillon suivant | — |

## Règle anti-sprawl (la vidéo prévient : un skill = une transformation)

- **Un skill ne fait qu'UNE transformation métier.** S'il en fait trop, on accumule et
  ça devient un bazar. Préférer enchaîner des skills atomiques via le `status`.
- **Pas de nouveau doc** si un fichier du tableau ci-dessus couvre déjà le rôle. Avant
  de créer, vérifier qu'on ne duplique pas un rôle existant.
