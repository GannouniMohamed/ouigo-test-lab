# Auto-installation des prérequis mobiles — Design

**Date :** 2026-06-26
**Statut :** approuvé (brainstorming)

## Contexte

L'écran **Diagnostic mobile** (`/mobile/doctor`, livré en Phase 6b) vérifie cinq prérequis Maestro (Java 17+, Maestro CLI, adb, Maestro Studio desktop, appareil joignable) et, en cas d'échec, affiche un conseil texte (« Installe maestro : `curl …` »). Le testeur non technique doit alors copier-coller des commandes — friction inutile.

**Objectif :** chaque prérequis en échec affiche un bouton d'action adapté à sa nature, pour réduire la friction au minimum.

## Décisions de brainstorming

- **Périmètre :** vraie auto-installation seulement pour **Maestro CLI** (script fiable). Maestro Studio, Java et adb → bouton qui **ouvre la page** d'installation (auto-install système trop fragile : brew/SDK absents, permissions, conflits de versions).
- **Studio :** « Ouvrir la page » (pas d'auto-download .dmg).
- **Retour visuel de l'install CLI :** spinner simple + re-vérification auto ; message d'erreur court en cas d'échec (pas de journal live).
- **Plateforme :** l'auto-install CLI cible macOS/Linux (script bash). Les boutons « Ouvrir la page » marchent partout.

## UX — une action par ligne en échec

| Prérequis | Bouton si ✗ | Action |
|---|---|---|
| Maestro CLI | **Installer** | Auto-install (script), spinner, puis re-vérification auto |
| Maestro Studio | **Ouvrir la page** | `shell.openExternal("https://studio.maestro.dev")` |
| Java 17+ | **Voir comment** | `https://adoptium.net/temurin/releases/?version=17` |
| adb (Android SDK) | **Voir comment** | `https://developer.android.com/tools/releases/platform-tools` |
| Appareil / émulateur | **Démarrer un émulateur** | `startDevice` (déjà existant) devient l'action de cette ligne |

- Le bouton global **« Revérifier »** reste.
- Une ligne déjà ✓ n'affiche aucun bouton.
- La ligne en cours d'installation affiche « Installation… », bouton désactivé.

## Architecture

### Main process

1. **`src/main/mobile/installers.ts`** (nouveau)
   - `installMaestroCli(run = runTool): Promise<{ ok: boolean; error?: string }>`
   - Exécute la commande d'install via le `ToolRunner` injectable : `run("sh", ["-c", INSTALL_CMD])` où `INSTALL_CMD = process.env.OTL_MAESTRO_INSTALL_CMD ?? "curl -fsSL https://get.maestro.mobile.dev | bash"`.
   - `ok = code === 0`. Sinon `error` = `stderr` (tronqué) ou message générique.
   - Le seam `OTL_MAESTRO_INSTALL_CMD` permet des tests hermétiques (sans réseau).

2. **Résolution du binaire `maestro` consciente de `~/.maestro/bin`** (correctif PATH crucial)
   - Le script installe dans `~/.maestro/bin/maestro`, **hors du PATH du process Electron**. Sans correctif, la re-vérification resterait ✗ juste après une install réussie.
   - Nouvelle fonction dans `src/main/mobile/exec.ts` :
     `maestroBin(exists = existsSync): string` = `OTL_MAESTRO_BIN` → sinon `~/.maestro/bin/maestro` s'il existe → sinon `"maestro"`.
   - Remplace `toolBin("maestro")` dans `doctor.ts` et `maestroRunner.ts` (et `devices.ts` `startDevice`). `toolBin` reste pour java/adb.

3. **Ouverture d'URL externe**
   - Nouveau canal IPC `app:openExternal` → `shell.openExternal(url)` (Electron), enregistré dans `register.ts`.

### IPC / preload / types

- `register.ts` : `mobile:installMaestro` → `installMaestroCli()` ; `app:openExternal` → `shell.openExternal(url)`.
- `preload/index.ts` + `renderer/api.d.ts` :
  - `installMaestro(): Promise<{ ok: boolean; error?: string }>`
  - `openExternal(url: string): void`

### Renderer — `MobileDoctor.tsx`

- Chaque `CheckRow` reçoit une action optionnelle selon la clé du check (`maestro` → Installer ; `studio`/`java`/`adb` → lien ; `device` → Démarrer un émulateur).
- État local : `installing: boolean` + `installError: string` (pour la ligne maestro).
- « Installer » → `installing=true` ; `const res = await window.api.installMaestro()` ; si `!res.ok` → `installError = res.error` ; `finally` → `await refresh()` (re-`mobileDoctor`) ; `installing=false`.
- Liens → `window.api.openExternal(url)`.
- La ligne appareil réutilise `bootEmulator` (déjà présent : `startDevice` + refresh).

## Gestion des erreurs

- `installMaestroCli` : échec réseau, `curl`/`sh` absent, script en erreur → `{ ok:false, error }`. Le renderer affiche `error` (court) sous la ligne ; l'utilisateur peut réessayer ou « Revérifier ».
- `openExternal` : best-effort (ne lève pas vers le renderer).
- Après install réussie, le refresh fait passer la ligne maestro à ✓ grâce à `maestroBin()` (résolution `~/.maestro/bin`).

## Tests

- **Main** :
  - `installMaestroCli` : runner injecté code 0 → `{ok:true}` ; code ≠ 0 → `{ok:false, error}` ; vérifie l'appel `sh -c <cmd>`.
  - `maestroBin` : `OTL_MAESTRO_BIN` prioritaire ; `~/.maestro/bin/maestro` présent (via `exists` injecté) → ce chemin ; sinon `"maestro"`.
  - `doctor` : maestro résolu depuis `~/.maestro/bin` quand présent.
  - Handler IPC `mobile:installMaestro`.
- **Renderer** (`mobileDoctor.test.tsx`) :
  - ligne maestro ✗ → bouton « Installer » → `installMaestro` appelé puis `mobileDoctor` re-appelé (2×).
  - install échoue → message d'erreur affiché, UI réutilisable.
  - lignes Studio/Java/adb ✗ → `openExternal` appelé avec la bonne URL.
  - ligne appareil ✗ → `startDevice` appelé.

## Hors périmètre (YAGNI)

- Auto-install Java/adb (fragile).
- Auto-download du .dmg Maestro Studio (l'utilisateur a choisi « ouvrir la page »).
- Journal live d'installation.
- Boutons d'install dupliqués dans NewScenario (le lien « Diagnostic » y mène déjà).

## Découpage (PRs phasées)

- **PR 1 (back-end)** : `installers.ts` + `maestroBin()` + branchements doctor/runner/devices + IPC `mobile:installMaestro` & `app:openExternal` + preload/types. Tests main.
- **PR 2 (renderer)** : actions par ligne dans `MobileDoctor`, états install, liens. Tests renderer.

Chaque PR : TDD, revue adversariale pré-PR, CI verte (mac/ubuntu/windows + E2E), auto-merge sur vert.
