# Fix — Scénarios enregistrés « sans étapes » + perte de la dernière action — Design

> Statut : design validé (débogage systématique, cause racine confirmée par preuves). Date : 2026-06-24.
> Bug rapporté : enregistrement Chromium OK (actions visibles dans l'inspecteur), mais à l'arrêt le scénario est « vide sans étapes » malgré ~10 actions.

## 1. Cause racine (confirmée par expérience)

1. **Cause principale — extraction des étapes.** Le reporter **JSON** de Playwright renvoie `result.steps: []` pour un spec composé d'appels `page.*()` / `expect()` à plat (la sortie exacte du `codegen`, sans `test.step()`). Donc `reportMapper.mapPlaywrightReport` produit **0 étape** → le Hub/Rapport affichent « 0 étape » et `lastRun.stepCount = 0`.
   - **Preuve** : un spec à 4 actions exécuté dans la config runner exacte (`playwright.runner.config.ts`) donne `result.steps.length === 0`, test « passed ».
   - **Preuve du correctif** : un **reporter custom** (`onStepEnd`) voit bien toutes les étapes — catégories `pw:api` (`page.goto`, `page.click`…) et `expect` (`expect.toHaveText`…), en plus de `hook`/`fixture` (infra à filtrer).
   - L'e2e n'a jamais attrapé ça : le faux codegen produit aussi un spec à actions plates → 0 étape (la démo affichait « 0/0 étapes »).

2. **Cause secondaire — perte de la dernière action à l'arrêt.** Le codegen écrit le fichier via un `ThrottledFile` (flush sur `setTimeout` 250 ms) ; le flush garanti final n'a lieu que sur `BeforeClose`/`exit` (gracieux). L'arrêt fait un **`SIGKILL`** immédiat du groupe → le flush en attente (< 250 ms) et le flush final ne se produisent pas, donc les toutes dernières actions peuvent manquer.
   - **Preuve** : reproduction du spawn + `SIGKILL` ; l'action `goto` (flushée pendant l'attente) est bien présente — mais une action survenue juste avant l'arrêt serait perdue faute de flush.

Le **modèle d'étapes** du runner : à la fin (`child.close`), il lit `playwright.json`, mappe le rapport, puis **émet toutes les `report.steps` d'un coup** vers Live Run avant `run-finished`. Donc corriger `report.steps` corrige **en même temps** le Rapport, la liste d'étapes du Live Run, et `lastRun.stepCount`.

## 2. Correctif

### 2.1 Reporter d'étapes custom (cause principale)
- Nouveau reporter Playwright (fichier CommonJS, p.ex. `playwright.step-reporter.cjs` à la racine, à côté de `playwright.runner.config.ts`) qui, sur `onStepEnd(test, result, step)`, collecte les étapes **pertinentes** et écrit un tableau JSON dans `process.env.OTL_STEPS_OUT`.
  - **Filtre** : garder `step.category === "expect"` **ou** (`step.category === "pw:api"` **et** le titre ne commence pas par `browser` — exclut `browserType.launch`, `browser.newContext`, `browserContext.newPage`). Exclure `hook` et `fixture`.
  - Pour chaque étape gardée : `{ title, durationMs: step.duration, status: step.error ? "failed" : "passed", error?: step.error?.message }`. Conserver l'ordre d'`onStepEnd` (ordre d'exécution).
  - Robustesse multi-tests : agréger toutes les étapes de tous les tests dans l'ordre ; écrire le fichier sur `onEnd` (fin du run). Le fichier doit toujours être écrit (même tableau vide) pour que le runner sache distinguer « 0 étape réelle » de « reporter absent ».
- **Wiring** : `playwright.runner.config.ts` ajoute ce reporter au tableau `reporter` (en plus de `list` + `json`), en référence **relative au fichier de config** (pour que l'override `OTL_RUNNER_CONFIG` des tests fonctionne).

### 2.2 Le runner consomme les étapes custom
- `playwrightRunner.run` définit `OTL_STEPS_OUT = join(runDir, "steps.json")` dans `childEnv`.
- Après la fin du run, en plus de lire `playwright.json` (statut/durée/global via `mapPlaywrightReport`), lire `steps.json` s'il existe et **remplacer `report.steps`** par ces étapes (mappées en `ReportStep` avec `index` séquentiel). Si `steps.json` est absent/illisible, garder le comportement actuel (rétro-compat).
- Conséquence : `report.steps` reflète les actions réelles → Rapport, Live Run (émission groupée existante) et `lastRun.stepCount` corrects. Aucune modification de l'UI nécessaire.
- `buildMinimalFailedReport` (échec de process) reste inchangé (1 étape « Playwright process error »).

### 2.3 Arrêt gracieux du codegen (cause secondaire)
- Dans `playwrightRecorder.stopRecording`, après confirmation que le fichier existe : **attendre que le flush du throttle se produise avant de lire**, au lieu de `SIGKILL` immédiat puis lecture.
  - Étapes : (1) tenter un arrêt gracieux — envoyer `SIGTERM` au groupe (laisse une chance au flush `BeforeClose`/`exit`) ; (2) attendre la sortie du process (`close`) **ou** un délai borné (~700 ms, > throttle 250 ms) ; (3) **lire** le fichier ; (4) `SIGKILL` de garantie pour nettoyer un éventuel survivant.
  - Le timeout global existant (10 s d'attente d'apparition du fichier) est conservé.
- Effet : les dernières actions enregistrées sont persistées avant la lecture.

## 3. Hors périmètre
- Pas de refonte de l'UI de rapport/étapes (la donnée corrigée suffit).
- Pas de parsing statique du fichier spec (on s'appuie sur les étapes réelles d'exécution via le reporter).
- Pas de capture d'écran par étape (inchangé : screenshot only-on-failure).

## 4. Critères d'acceptation & vérification « en tant qu'utilisateur »
En plus de `npm test` + build + lint verts (3 OS) :
1. **Unitaire reporter** : exécuter un spec à plusieurs `page.*`/`expect` via le reporter custom et la config runner → `steps.json` contient les actions (≥ N), sans les étapes `hook`/`fixture`/`browser*`.
2. **Unitaire mapper/runner** : `report.steps` reflète `steps.json` quand présent ; fallback inchangé sinon ; `lastRun.stepCount` = nombre d'étapes réelles.
3. **Unitaire recorder** : `stopRecording` lit le fichier après le flush (la dernière action présente dans le fichier n'est pas perdue) ; le timeout de garantie fonctionne.
4. **E2E** : enregistrement (faux codegen → spec `goto` + `expect`) → auto-run → le **Rapport affiche ≥ 1 étape** (avant ce correctif : 0). Les e2e existants restent verts.
5. **Démo réelle** : relancer l'app, enregistrer un parcours, vérifier que le Rapport/Hub affichent les étapes, captures partagées.

## 5. Séquence
Une PR, mergée après CI verte par job (gate côté loop, pas de `--auto`), via le loop subagent-driven.
