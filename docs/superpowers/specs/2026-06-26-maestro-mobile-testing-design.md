# Tests mobiles avec Maestro — Design

**Date :** 2026-06-26
**Statut :** Validé (brainstorming) — prêt pour le plan d'implémentation
**Portée v1 :** Android uniquement. iOS différé (Simulateur macOS-only ; appareils iOS réels non supportés en first-party par Maestro).

## 1. Objectif

Ajouter un parcours de test **mobile** à Ouigo Test Lab, propulsé par
[Maestro](https://maestro.dev), en gardant la promesse produit « enregistrer en
cliquant, sans écrire de code » et en réutilisant au maximum l'architecture web
existante (Playwright).

L'idée de départ : pouvoir lancer l'app mobile sous test **sans brancher les
pipelines pour récupérer les builds**. On répond à ça de deux façons :
1. **App déjà installée** — on ne stocke que l'`appId` (package name) ; l'app est
   supposée présente sur l'appareil/émulateur (config zéro).
2. **Firebase App Distribution** — on récupère automatiquement le dernier build
   APK depuis App Distribution et on l'installe avant le run. C'est *la* source
   de build « sans pipeline ».

La carte « Mobile / Maestro » existe déjà dans `NewScenario` (désactivée,
« bientôt »), `Platform` inclut déjà `"mobile"`, et `devices.ts` documente déjà
l'intention « mobile = Maestro ». Ce design remplit ce chemin déjà esquissé.

## 2. Décisions (issues du brainstorming)

| Décision | Choix retenu |
|---|---|
| Plateformes v1 | **Android d'abord** (émulateur + appareil physique via adb) |
| Création d'un scénario | **Studio desktop + auto-import + auto-run** (parité avec le web) |
| Modèle « Applications » | Champ `app` sur l'**environnement** ; 2 sources : `installed` (appId seul) **et** `firebase` (auto-pull APK) — **les deux en v1** |
| Cible d'exécution | **Sélecteur d'appareils + démarrage d'émulateur** |
| Prérequis (Java/adb/Maestro) | **Détecter + guider** (rien n'est embarqué) |

## 3. Contexte de recherche (faits qui cadrent le design)

- **Maestro = un seul binaire CLI** (`maestro test flow.yaml`) → même modèle
  spawn-child-process que le chemin Playwright actuel.
- **Maestro est un outil JVM → Java 17+ est un prérequis dur** (nouveau, absent
  du chemin Node/Playwright).
- **Artefact de flow** = un `.yaml` avec un en-tête `appId:` (parallèle au
  `.spec.ts`).
- **Installation/lancement du build** : `adb install app.apk` puis `launchApp`
  par `appId` ; ou `maestro test --app-path app.apk`. L'`appId` (package name)
  est la clé de jointure pour lancer l'app installée.
- **Rapports** : `--format junit --output …` + `--debug-output <dir>` qui produit
  `commands-*.json` (résultats par commande, machine-readable). Le streaming
  d'étapes en direct est du parsing stdout best-effort (pas de protocole stable).
- **Maestro Studio web embarquable (port 9999) : RETIRÉ en CLI 2.6.0**
  (mai 2026). Le remplaçant utilisable est l'**app Maestro Studio desktop**
  (Electron séparé) qui **écrit les flows en `.yaml` dans un dossier de
  workspace choisi par l'utilisateur** → capture la plus fiable = **surveiller
  ce dossier** (`fs.watch`). On n'embarque donc PAS Studio dans notre fenêtre.
- **Firebase App Distribution** expose une **API REST v1 (GA)** : lister les
  releases → `binaryDownloadUri` (signé, expire ~1 h) → télécharger l'APK.
  Auth = clé de compte de service (rôle *App Distribution Viewer*, scope
  `cloud-platform`). **Contrainte amont : les builds doivent être uploadés en
  `.apk`, pas en `.aab`** (un AAB ne donne pas de fichier directement
  installable).
- **Windows = Android uniquement** ; **iOS réel non supporté first-party**.
  Android-first évite ces deux écueils.

Sources : docs.maestro.dev (install, CLI, devices, reports, studio overview),
maestro.dev/blog (v2.6.0, rebuild iOS), firebase.google.com/docs/reference/
app-distribution/rest, firebase.google.com/docs/app-distribution/
authenticate-service-account.

## 4. Architecture — un chemin Maestro parallèle

Le code abstrait déjà les bons seams. On ajoute une implémentation Maestro
parallèle derrière les **mêmes interfaces**, et on dispatch sur
`scenario.platform`.

| Préoccupation | Web/Responsive (existant) | Mobile (nouveau) |
|---|---|---|
| Runner | `playwrightRunner` implémente `TestRunner` | **`maestroRunner`** implémente le **même** `TestRunner` |
| Recorder | `playwrightRecorder` (codegen) | **`maestroRecorder`** (Studio desktop + dir-watch) |
| Artefact | `<id>.spec.ts` | **`<id>.flow.yaml`** |
| Dispatch run | `handleRunScenario` → `playwrightRunner` | même handler, **switch sur `platform`** → `maestroRunner` |
| Événements live | émet `RunEvent` | émet **les mêmes `RunEvent`** (parse stdout / `commands-*.json`) |
| Rapport | `Report` via `reportMapper` | même `Report` via `maestroReportMapper` (JUnit + commands JSON) |

**Principe clé :** le renderer (LiveRun, Report, History, BatchRun) reste quasi
inchangé car le mobile émet les **mêmes types** `RunEvent`/`Report`. La
branche par plateforme vit côté main, uniquement aux points de dispatch
recorder/runner.

**Nouveaux modules main (calqués sur l'arbo existante) :**
- `src/main/recorder/maestroRecorder.ts`
- `src/main/runner/maestroRunner.ts` + `maestroReportMapper.ts`
- `src/main/mobile/devices.ts` (lister/booter via `maestro list-devices` / `start-device` / `adb`)
- `src/main/mobile/firebase.ts` (pull App Distribution)
- `src/main/mobile/doctor.ts` (détecter Java/Maestro/adb/Studio → guidance)
- `src/shared/flow.ts` (`rebaseFlowAppId`, `parseFlowSteps`)

## 5. Modèle de données

Tout est **additif et optionnel** → aucune migration des données existantes.

### `src/shared/types.ts`

```ts
export type MobileAppSource = "installed" | "firebase";

export interface FirebaseAppDistConfig {
  projectNumber: string;          // numéro de projet Firebase (numérique)
  firebaseAppId: string;          // 1:1234567890:android:abc123
  serviceAccountKeyPath: string;  // chemin du JSON de compte de service
}

export interface MobileApp {
  appId: string;                  // package name Android (com.ouigo.app) — install/launch Maestro
  source: MobileAppSource;        // "installed" (défaut) | "firebase"
  firebase?: FirebaseAppDistConfig;  // présent ssi source === "firebase"
}

export interface Environment {
  id: string;
  label: string;
  baseURL: string;                // web/responsive (peut être vide pour un env mobile)
  variables: Record<string, string>;
  app?: MobileApp;                // NOUVEAU — mobile ; ignoré par web/responsive
}

export interface MobileDevice {
  id: string;                     // "emulator-5554" ou UDID
  name: string;                   // "Pixel 6 — API 33"
  kind: "emulator" | "physical";
  state: "booted" | "offline";
}

export interface RunOptions {
  // …existant…
  deviceId?: string;              // NOUVEAU — mobile : appareil/émulateur cible
}
```

- **`Scenario`** : aucun nouveau champ. `platform: "mobile"` existe déjà ; on
  réutilise `specFile` en `<id>.flow.yaml` (le store écrit par nom de fichier,
  agnostique au contenu). `browser` est simplement ignoré pour le mobile.
- **Correction au switch d'env (important)** : comme le web rebase l'URL
  enregistrée vers l'env de run (`rebaseSpecUrls`), le mobile rebase l'en-tête
  `appId:` du flow vers `env.app.appId` **au lancement** — switcher d'env switche
  réellement l'app sous test. Helper dans `src/shared/flow.ts`.

### `src/shared/flow.ts` (nouveau, pur, testable)

- `rebaseFlowAppId(yaml: string, appId: string): string` — réécrit l'en-tête
  `appId:` du flow.
- `parseFlowSteps(yaml: string): string[]` — compte/titre les commandes Maestro
  (→ `recordedStepCount`, miroir de `parseRecordedSteps`).

## 6. Flow d'enregistrement (`src/main/recorder/maestroRecorder.ts`)

Même forme `start`/`stop` que `playwrightRecorder`, mais on **surveille un
dossier** au lieu de poller un fichier `-o` unique.

**`startRecording({ name, projectId, tunnelId, environmentId, platform:"mobile", deviceId })`**
1. **Résoudre & valider** : charger l'env ; exiger `env.app?.appId` (sinon erreur
   claire : « Configure l'application mobile de cet environnement »). Exiger un
   `deviceId` (l'enregistrement nécessite un appareil vivant).
2. **Assurer l'app sur l'appareil** : helper partagé `ensureAppOnDevice(env, deviceId)`
   — si `source:"firebase"`, pull+install du dernier APK (§7) ; si `"installed"`,
   supposer présent.
3. **Créer un workspace par enregistrement** : `recordings/<recordingId>/`,
   pré-amorcé avec un `flow.yaml` contenant l'en-tête `appId:` (l'utilisateur
   enregistre dans un fichier qu'on connaît déjà, avec le bon appId).
4. **Lancer le Studio desktop** pointé sur ce dossier (`open -a "Maestro Studio"`
   macOS / `.exe` Windows) **et** ouvrir le dossier dans le gestionnaire de
   fichiers. Le panneau in-app affiche le chemin exact + étapes courtes.
5. **Surveiller** : `fs.watch(recordings/<recordingId>/)` sur `*.yaml`/`*.yml` ;
   suivre le fichier de flow non-vide le plus récemment modifié.

**`stopRecording(recordingId)`** — même contrat que le recorder web, renvoie un `Scenario` :
1. Lire le `.yaml` non-vide le plus récent du dossier (sinon erreur : « Aucun
   flow détecté — as-tu enregistré dans le bon dossier ? »).
2. `rebaseFlowAppId(yaml, env.app.appId)` ; `parseFlowSteps` → `recordedStepCount`.
3. Construire `Scenario { platform:"mobile", specFile:"<id>.flow.yaml", … }`,
   persister via `saveScenario(scenario, flowContent)` existant.
4. Fermer le process Studio en best-effort ; sortir proprement sinon.

**Auto-run (parité Phase C)** : lancer aussitôt le nouveau scénario sur le même
`deviceId` → naviguer vers `LiveRun`, exactement comme le web aujourd'hui.

**Spike d'implémentation** : vérifier si l'app Studio desktop accepte un chemin de
workspace via argument CLI / deep-link. Si oui, le handoff par dossier devient
entièrement automatique (sinon : pré-création + ouverture du dossier + fichier
pré-nommé comme mitigation).

## 7. Flow d'exécution (`src/main/runner/maestroRunner.ts`, implémente `TestRunner`)

Même contrat `run()`/`cancel()` que `playwrightRunner` → `handleRunScenario`
dispatch sur `scenario.platform`.

**`run(scenario, env, onEvent, opts)`**
1. **Valider** : `env.app?.appId` présent ; `opts.deviceId` présent. Sinon →
   erreur mappée dans le rapport.
2. **`ensureAppOnDevice(env, deviceId)`** (partagé avec le recorder) :
   - `source:"firebase"` → `firebase.pullLatestApk(env.app.firebase)` →
     `adb -s <device> install -r <apk>`.
   - `source:"installed"` → no-op.
3. **Compiler le flow** : lire `<id>.flow.yaml`, `rebaseFlowAppId(yaml, env.app.appId)`
   → écrire le flow effectif dans `runs/<runId>.flow.yaml`. (Pas de compile
   `visible/invisible` — les flows Maestro n'ont pas de dualité headed/headless ;
   le mobile ignore `RunMode` en v1.)
4. **Spawn** :
   `maestro --device <deviceId> test --format junit --output runs/<runId>/report.xml --debug-output runs/<runId> runs/<runId>.flow.yaml`.
5. **Événements live** : émettre `run-started` avec les titres d'étapes de
   `parseFlowSteps` ; parser stdout pour `step-started`/`step-passed`/`step-failed`
   (**best-effort**, pas de protocole stable Maestro).
6. **À la sortie — rapport faisant foi** : `maestroReportMapper` lit
   `commands-*.json` (résultats par commande) + JUnit (statut/durées) → construit
   le **même** `Report`/`ReportStep[]`. Sur une étape échouée, capturer une
   capture d'écran via `adb -s <device> exec-out screencap` (parallèle au
   « screenshot uniquement sur échec » du web). `saveReport` + `updateLastRun`,
   émettre `run-finished`.
7. **`cancel(runId)`** tue le child maestro (même `killProcessTree` que le recorder).

**Module appareils (`src/main/mobile/devices.ts`)**
- `listDevices()` → `maestro list-devices` (+ réconciliation `adb devices`) → `MobileDevice[]`.
- `startDevice()` → `maestro start-device --platform android`, résout une fois booté.

**Module Firebase (`src/main/mobile/firebase.ts`)** — nouvelle dép
**`google-auth-library`** (OK dans le main Electron).
- `pullLatestApk(cfg)` : `GoogleAuth` (keyFile = `serviceAccountKeyPath`, scope
  `cloud-platform`) → token → `GET …/releases?pageSize=1` →
  `releases[0].binaryDownloadUri` → télécharger (pas d'en-tête auth sur l'URL
  signée) dans un cache indexé par `buildVersion` (évite de re-télécharger le même
  build).
- Erreurs mappées : échec d'auth/rôle, aucune release, **cas AAB** (« le build
  doit être un .apk, pas un .aab »), URL signée expirée (re-fetch).

**IPC + preload (nouveaux)** : `mobile:listDevices`, `mobile:startDevice`,
`mobile:doctor` ; `recording:start` et `scenario:run` reçoivent `deviceId` dans
les opts. Le renderer ajoute un **sélecteur d'appareils** (avec bouton « Démarrer
un émulateur ») affiché uniquement pour les scénarios mobiles — dans le
`RunOptionsModal` existant et sur `NewScenario` avant l'enregistrement.

Les écrans renderer (LiveRun, Report, History, BatchRun) sont **inchangés** —
ils consomment les mêmes `RunEvent`/`Report`.

## 8. Prérequis (doctor) & gestion d'erreurs

**Doctor (`src/main/mobile/doctor.ts`) — « détecter + guider » :**
- `mobileDoctor()` renvoie `{ java, maestro, adb, studio, anyDeviceAvailable }`,
  chacun `{ ok, version?, hint }` :
  - **Java 17+** (`java -version`), **Maestro** (`maestro --version`), **adb**
    (`adb version`), **Maestro Studio desktop** (bundle/exe présent), au moins un
    **appareil/émulateur** joignable.
- Déclenché la 1re fois qu'on choisit la plateforme Mobile (et re-vérifiable
  depuis un petit panneau « Diagnostic mobile »). Si manque : écran checklist
  propre avec commandes d'install copiables par OS (`curl …get.maestro.mobile.dev`,
  install Java, SDK platform-tools) — **jamais de stack trace brute**. Calqué sur
  `AppGate`/`ensureBrowsers` (navigateurs Playwright).
- **Garde-fou plateforme** : sous Windows, la carte Mobile reste Android-only
  (iOS masqué) ; iOS hors-scope v1.

**Gestion d'erreurs** — chaque échec devient un message mappé et humain, exposé
dans le rapport/UI (miroir de `buildMinimalFailedReport`) :
- Aucun appareil sélectionné / aucun booté → « Aucun appareil — branche un
  téléphone ou démarre un émulateur. »
- Env sans app mobile configurée → renvoie vers l'éditeur d'env.
- Firebase : échec auth/rôle, aucune release, **AAB-pas-APK**, URL de
  téléchargement expirée (re-fetch).
- Échec `adb install` (signature, ABI incompatible) → exposé verbatim mais cadré.
- Sortie non-zéro de Maestro sans rapport parsable → rapport d'échec minimal avec
  la fin du stderr capturé.

## 9. Stratégie de test (Vitest + e2e Playwright, déjà en place)

Tous les appels CLI sont derrière un spawn injectable (comme `OTL_CODEGEN`).

- **Unit (Vitest)** :
  - `src/shared/flow.ts` (`rebaseFlowAppId`, `parseFlowSteps`) — pur,
    table-driven, le plus de valeur.
  - `maestroReportMapper` sur des fixtures `commands-*.json`/JUnit.
  - `firebase` : choix de la release + détection AAB, HTTP mocké.
  - `doctor` : parsing avec sortie de commandes mockée.
- **Runner/recorder** : injecter un faux binaire `maestro`/`adb` (override env,
  comme `OTL_CODEGEN`) → tester `maestroRunner`/`maestroRecorder` sans appareil
  réel — asserter l'argv spawné, l'ingestion par dir-watch, le rebase d'appId, et
  l'émission d'événements.
- **Pas d'appareil réel en CI** — les chemins device-dependent restent derrière
  le seam spawn ; pas de e2e mobile en CI. Une courte **checklist de smoke
  manuel** (ci-dessous) sert à valider localement sur un émulateur réel.

### Checklist de smoke manuel (local, émulateur Android)
1. Doctor : tout vert (Java/Maestro/adb/Studio + 1 émulateur booté).
2. Env : configurer `app` en `installed` (appId d'une app présente).
3. Nouveau scénario mobile → enregistrer un flow dans Studio → auto-import →
   auto-run → rapport vert avec étapes.
4. Re-run depuis le rapport sur un autre appareil via le sélecteur.
5. Basculer l'env sur une source `firebase` → run → vérifier pull+install du
   dernier APK, puis exécution.
6. Cas d'erreur : aucun appareil, AAB, appId absent → messages clairs.

## 10. Dépendances & portée

- **Nouvelle dépendance npm** : `google-auth-library` uniquement.
- **Prérequis externes (non embarqués, guidés par le doctor)** : Java 17+,
  Maestro CLI, Android SDK/adb, Maestro Studio desktop.
- **Hors-scope v1** : iOS (Simulateur + appareils réels), modes `visible/invisible`
  pour le mobile, scoping d'étapes par mode pour les flows, deep-link de workspace
  Studio (spike).

## 11. Risques principaux (à garder en tête au plan)

1. **Handoff du dossier de workspace Studio** — l'utilisateur doit pointer Studio
   sur notre dossier. Mitigé par pré-création/ouverture/fichier pré-nommé ;
   spike sur l'arg CLI/deep-link.
2. **Pas de stream machine-readable live** — progression live = parsing stdout
   best-effort ; vérité = JUnit + `commands-*.json`.
3. **Dépendance Java 17 + SDK Android** — plus lourd que « lancer un navigateur » ;
   le doctor doit être impeccable.
4. **AAB vs APK côté Firebase** — contrainte amont (uploader des APK).
