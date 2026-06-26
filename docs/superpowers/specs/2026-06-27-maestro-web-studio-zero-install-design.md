# Design — Enregistrement mobile « zéro installation » (Studio web 2.5.1, géré par l'app)

**Date :** 2026-06-27
**Statut :** validé (à implémenter)
**Remplace / fait évoluer :** le chemin d'enregistrement mobile actuel (Maestro Studio desktop + surveillance de dossier), introduit aux PRs #146–#160.

## Contexte

Le chemin mobile actuel exige que le PO installe **Maestro Studio desktop** pour enregistrer un parcours. C'est un frein « plug-and-play » : l'app desktop est lourde, l'installation est manuelle, et le diagnostic affiche un prérequis de plus.

Le spike `docs/superpowers/spikes/2026-06-26-maestro-old-web-studio.md` a vérifié que la CLI **Maestro 2.5.1** embarque encore le **Studio web** (`maestro studio` → `http://localhost:9999`), retiré en 2.6.0. On peut donc offrir l'enregistrement **sans aucune app desktop**, à condition que l'app pilote elle-même une CLI 2.5.1.

## Décisions prises (brainstorming)

1. **Plug-and-play, un seul Maestro géré par l'app.** Le PO n'installe rien. L'app télécharge et gère **un seul binaire Maestro 2.5.1**, utilisé pour **enregistrer** *et* **exécuter**. (Réponse user : « la solution faut qu'elle soit plug play. Je pense pas que le P.O. va installer deux versions de maestro. »)
2. **Import du parcours par collage.** Après enregistrement dans le Studio web, le PO clique **Copy** dans le navigateur, revient dans l'app et **colle** le YAML. L'app crée le scénario. (Réponse user : « Coller le parcours (robuste) ».)
3. Java + adb **restent** des prérequis guidés (trop fragiles à auto-installer ; ils étaient ✓ sur la machine de test).

## Comportement cible

Le PO :
1. ouvre « Nouveau scénario », choisit **Mobile**, un environnement avec app configurée, et un appareil ;
2. clique **« Démarrer l'enregistrement »** → l'app garantit le binaire géré (téléchargement la 1re fois, avec progression), installe l'app sur l'appareil au besoin, lance le Studio web et ouvre le navigateur ;
3. enregistre son parcours dans le navigateur, clique **Copy** ;
4. revient dans l'app, **colle** le parcours dans la zone prévue, clique **« Créer le scénario »** ;
5. le scénario est créé (appId rebasé sur l'env) et lancé automatiquement.

## Architecture — 3 phases (PRs séquentielles, CI verte, auto-merge)

Le parallélisme « interface `TestRunner` + dispatch par `scenario.platform` » reste inchangé. Les phases sont indépendamment livrables et testables.

### Phase A — Maestro géré par l'app

**Objectif :** un binaire Maestro 2.5.1 que l'app télécharge, met en cache, et résout partout.

- **Nouveau** `src/main/mobile/managedMaestro.ts`
  - `managedMaestroDir(): string` — dossier de données de l'app (`getWorkspaceDir()` parent ou `app.getPath("userData")` ; en test `OTL_WORKSPACE`), sous-dossier `maestro-2.5.1/`.
  - `managedMaestroBin(exists?): string | undefined` — chemin du binaire `bin/maestro` (`.bat` sous Windows) s'il existe, sinon `undefined`.
  - `isManagedMaestroReady(exists?): boolean` — `managedMaestroBin(exists) !== undefined`.
  - `ensureManagedMaestro(deps?): Promise<{ bin: string }>` — si déjà présent, renvoie le chemin. Sinon télécharge le zip `cli-2.5.1`, dézippe dans le dossier géré, rend le binaire exécutable (`chmodSync 0o755` hors Windows), renvoie le chemin. Émet la progression via un callback `onProgress?(received, total)`.
  - Constantes : `MAESTRO_VERSION = "2.5.1"`, `MAESTRO_ZIP_URL = "https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.5.1/maestro.zip"`.
  - **Seams de test** : `OTL_MAESTRO_BIN` court-circuite tout (priorité absolue) ; `deps` injecte `download`, `unzip`, `exists`, `chmod` pour des tests hermétiques sans réseau ni I/O réelle.
- **Modif** `src/main/mobile/exec.ts` → `maestroBin()` résout dans l'ordre : `OTL_MAESTRO_BIN` → `managedMaestroBin()` → `~/.maestro/bin/maestro` (legacy) → `"maestro"` (PATH). Le binaire géré prime sur le PATH pour garantir la 2.5.1.
- Le **runner** (`maestroRunner.ts`) et le **studio** (phase B) utilisent `maestroBin()` → donc le même binaire géré.

**Tests (`tests/main/managedMaestro.test.ts`)**
- `OTL_MAESTRO_BIN` défini → `ensureManagedMaestro` ne télécharge pas, renvoie ce chemin.
- binaire déjà présent → pas de téléchargement, renvoie le chemin existant.
- absent → appelle `download` puis `unzip` puis `chmod`, renvoie le chemin attendu.
- `onProgress` est invoqué avec (reçu, total).
- `maestroBin()` (exec) préfère le binaire géré au PATH quand il existe (test dans `mobileExec.test.ts`).

### Phase B — Enregistrement Studio web + import par collage

**Objectif :** remplacer le lancement de l'app desktop + surveillance de dossier par : lancer le serveur Studio web, ouvrir le navigateur ; importer le parcours **collé**.

- **Modif** `src/main/recorder/maestroRecorder.ts`
  - `startRecording` ne lance plus l'app desktop et ne pré-amorce plus de `flow.yaml`. Il :
    1. valide `env.app.appId` + `deviceId` (inchangé) ;
    2. `await ensureManagedMaestro(...)` (déclenche le téléchargement la 1re fois) ;
    3. `await ensureAppOnDevice(env, deviceId)` ;
    4. **spawn** `maestroBin() studio --no-window` (serveur long), garde le handle process dans `activeRecordings` par `recordingId` ;
    5. attend que `http://localhost:9999` réponde (polling de condition, timeout ~30 s) ;
    6. `openExternal("http://localhost:9999")` (via le même mécanisme que `app:openExternal`).
  - `stopRecording(recordingId, pastedFlow: string): Promise<Scenario>` — **change de signature** : reçoit le **YAML collé** au lieu de lire un dossier.
    1. tue le process Studio du `recordingId` (groupe de process, comme `maestroRunner`) ;
    2. valide que `pastedFlow` n'est pas vide et que `parseFlowSteps(pastedFlow).length > 0` (sinon erreur « Aucune étape détectée — colle bien le parcours copié depuis Maestro Studio. ») ;
    3. `rebaseFlowAppId(pastedFlow, session.appId)` → `saveScenario` (logique existante, inchangée) ;
    4. nettoie `activeRecordings`.
  - `cancelRecording(recordingId)` (nouveau, best-effort) — tue le process Studio sans créer de scénario (pour fermer proprement si le PO annule). Exposé en IPC + preload.
  - On **retire** la dépendance à `studioInstalled` (desktop) dans le recorder (la garde #160 disparaît pour ce chemin) ; le pré-amorçage `flow.yaml`/seed et toute la logique de surveillance de dossier de `stopRecording` sont supprimés.
- **Modif** `src/main/ipc/register.ts` + `src/preload/index.ts` + `src/renderer/api.d.ts`
  - `stopRecording(recordingId, pastedFlow)` propage le YAML collé.
  - `cancelRecording(recordingId)` nouveau canal.
- **Modif** `src/renderer/screens/NewScenario.tsx` (chemin mobile)
  - Après `startRecording`, afficher l'état « enregistrement » mobile : message « Studio ouvert dans le navigateur — enregistre ton parcours, clique **Copy**, puis colle-le ci-dessous. », un `<textarea>` (label « Parcours enregistré »), un bouton **« Créer le scénario »** (désactivé tant que la zone est vide) et un bouton **« Annuler »** (→ `cancelRecording`).
  - `handleStop` (mobile) passe le contenu de la zone à `stopRecording`. Conserve la gestion d'erreur existante (`recError`, try/catch, états `stopping`).
  - Le chemin **web** (Playwright) reste strictement inchangé (`stopRecording(recordingId)` côté web n'utilise pas de YAML collé — voir note compat ci-dessous).

**Note compatibilité de signature.** `stopRecording` est partagé web/mobile via une seule façade IPC. On rend le 2e argument **optionnel** (`pastedFlow?: string`) : le recorder web l'ignore, le recorder mobile l'exige. La façade `register.ts` route déjà par type d'enregistrement ; on documente que `pastedFlow` n'est consommé que par le chemin mobile.

**Tests**
- `tests/main/maestroRecorder.test.ts` (réécrits) :
  - `startRecording` : sans device/app → erreurs (inchangé) ; avec seams (`OTL_SKIP_STUDIO_LAUNCH`, studio spawn mocké, port mocké), renvoie un `recordingId` et enregistre un process actif.
  - `stopRecording(id, yaml)` : YAML avec commandes → scénario `platform:"mobile"`, appId rebasé, `recordedStepCount` correct, persisté.
  - `stopRecording(id, "")` et YAML sans commande → erreur « Aucune étape ».
  - `cancelRecording(id)` : pas de scénario créé, process nettoyé.
- `tests/renderer/newScenario.test.tsx` : zone de collage visible après start (mobile) ; bouton « Créer le scénario » désactivé si vide ; `stopRecording` appelé avec le YAML collé ; « Annuler » appelle `cancelRecording`.

### Phase C — Simplification du Diagnostic mobile

**Objectif :** refléter « Maestro géré par l'app » et retirer le prérequis Studio desktop.

- **Modif** `src/main/mobile/doctor.ts`
  - Remplacer la ligne **« Maestro CLI »** par **« Maestro (géré par l'app) »** : `ok = isManagedMaestroReady()` ; `version = "2.5.1"` si prêt ; `hint` si absent = « L'app va télécharger Maestro automatiquement au 1er enregistrement, ou clique « Préparer ». »
  - **Supprimer** la ligne **« Maestro Studio (desktop) »** et la fonction `studioInstalled`/`studioPaths` (plus utilisées). `MobileDoctorReport` perd le champ `studio` ; `allOk` ne le compte plus.
- **Modif** `src/renderer/screens/MobileDoctor.tsx`
  - Ligne maestro : action **« Préparer »** → nouveau canal `mobile:prepareMaestro` (→ `ensureManagedMaestro`) avec spinner + barre de progression ; au succès, re-run du diagnostic.
  - Retirer la ligne Studio desktop et `studioDownloadUrl` (devenu inutile). Java/adb inchangés (« Ouvrir la page »).
- **Modif** IPC : nouveau `mobile:prepareMaestro` → `ensureManagedMaestro` ; on **retire** `mobile:installMaestro` (l'ancien `curl … | bash` n'a plus de sens) et le bouton « Installer » CLI. `app:openExternal` reste (Java/adb).

**Tests**
- `tests/main/mobileDoctor.test.ts` : rapport sans champ `studio` ; ligne maestro ok/ko selon `isManagedMaestroReady` injecté ; `allOk` ne dépend plus du studio desktop.
- `tests/renderer/mobileDoctor.test.tsx` : pas de ligne « Studio (desktop) » ; bouton « Préparer » appelle `prepareMaestro` ; spinner pendant la préparation.

## Cycle de vie du serveur Studio (détail technique)

- Spawn `maestro studio --no-window` en process détaché avec son propre groupe (`detached: true`), handle stocké par `recordingId`.
- **Attente du port** : polling `http://localhost:9999` (HEAD/GET) jusqu'à 200, intervalle ~500 ms, timeout 30 s ; à l'échec → tuer le process + erreur « Maestro Studio n'a pas démarré à temps. Vérifie qu'un appareil est connecté et réessaie. ».
- **Arrêt** : `stopRecording`/`cancelRecording` tuent le groupe de process (réutilise l'utilitaire de kill de `maestroRunner`). Si le PO ferme l'app, les process détachés sont orphelins — acceptable (le port se libère ; un nouveau `studio` réutilise 9999).
- Port fixe **9999** (défaut Maestro). Conflit improbable en pratique ; non géré en v1 (documenté).

## Gestion d'erreurs

| Cas | Message |
|-----|---------|
| Téléchargement Maestro échoue | « Le téléchargement de Maestro a échoué. Vérifie ta connexion et réessaie. » |
| Studio ne démarre pas (timeout port) | « Maestro Studio n'a pas démarré à temps. Vérifie qu'un appareil est connecté et réessaie. » |
| App absente de l'appareil (Firebase échoue) | message existant de `ensureAppOnDevice` |
| Zone de collage vide / 0 étape | « Aucune étape détectée — colle bien le parcours copié depuis Maestro Studio. » |
| Aucun appareil / pas d'app configurée | messages existants (inchangés) |

Tous les chemins remontent l'erreur au renderer (try/catch → `recError`), jamais d'échec silencieux (acquis #159).

## Hors périmètre (YAGNI)

- Gestion d'un port autre que 9999.
- Auto-installation de Java/adb.
- Repli automatique vers le Studio desktop (on garde le code 2.5.1 comme unique chemin ; le desktop pourra revenir si 2.5.1 casse).
- Téléchargement repris/segmenté (un simple re-téléchargement complet suffit en v1).

## Risques assumés

- **2.5.1 est déprécié** : le Studio web peut casser à terme côté Maestro. Faisabilité validée au spike ; on assume.
- **Téléchargement ~210 Mo** la 1re fois : atténué par cache + progression + bouton « Préparer » anticipé dans le Diagnostic.
- **Process Studio orphelins** si fermeture brutale : impact nul en pratique (réutilisation du port).

## Plan de migration / nettoyage

Code supprimé une fois les 3 phases mergées : `studioInstalled`/`studioPaths` (doctor), `launchStudio` + pré-amorçage seed + surveillance de dossier (recorder), `studioDownloadUrl` + bouton « Télécharger » + `mobile:installMaestro` (renderer/IPC). Branche spike `spike/maestro-old-web-studio` conservée comme référence.
