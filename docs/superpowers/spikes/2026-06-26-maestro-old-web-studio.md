# Spike — Maestro Studio web via CLI (vieille version, sans app desktop)

**Date :** 2026-06-26
**Branche :** `spike/maestro-old-web-studio`
**Question :** L'app Maestro Studio desktop est-elle vraiment obligatoire, ou une **vieille** version de la CLI permet-elle d'enregistrer via le Studio web (localhost), sans installer le desktop ?

## Réponse : OUI, ça marche en 2.5.1

`maestro studio` a été **retiré de la CLI en 2.6.0** (l'utilisateur a 2.6.1). La **dernière version avec le Studio web embarqué est `cli-2.5.1`**.

### Preuve (testée sur la machine, émulateur `emulator-5554` lancé)
- Téléchargé `maestro.zip` de `cli-2.5.1` dans un dossier isolé (sans toucher `~/.maestro` / 2.6.1).
- `maestro --version` → `2.5.1`.
- `maestro studio --help` → « Launch Maestro Studio », option `--no-window` (⇒ UI web + navigateur).
- `maestro studio --no-window` :
  - démarre en ~9 s, **`http://localhost:9999` répond HTTP 200** (sert l'app React « Maestro Studio »),
  - se connecte à l'émulateur : log « Running on Pixel_9_Pro »,
  - endpoint `/api/device-screen` → 200,
  - log : « Maestro Studio is running at http://localhost:9999 ».
- Un bandeau invite à « Download the new and improved Maestro Studio app » mais le Studio web **fonctionne quand même**.

### Conclusion
Avec une CLI **2.5.1 épinglée**, on peut offrir l'enregistrement **sans app desktop** : l'app lance `maestro studio`, le PO enregistre dans son navigateur (vue de l'appareil, clics → commandes).

## Limites / à concevoir avant de câbler
1. **Version dépréciée** : 2.5.1 est en retrait ; Maestro pousse vers le desktop. Le Studio web peut disparaître/casser à terme. À assumer.
2. **Run vs record** : aujourd'hui le runner utilise le `maestro` du PATH (2.6.1). Si on épingle 2.5.1 pour *enregistrer*, soit on épingle aussi 2.5.1 pour *exécuter* (on perd les améliorations 2.6.x), soit on gère deux binaires (un pour `studio`, un pour `test`).
3. **Récupération du flow** : le Studio **desktop** écrit un `.yaml` dans un dossier (notre import auto surveille ce dossier). Le Studio **web** (:9999) a un modèle différent (on copie/exporte le YAML depuis le navigateur). Il faut redéfinir comment le parcours enregistré revient dans l'app (ex. coller le YAML, ou un bouton « importer depuis Studio »). C'est le vrai point d'intégration à brainstormer.

## Reco
Le spike valide la **faisabilité technique**. Le câblage dans l'app est un **changement de conception** (épinglage de version + nouveau flux d'import) → à brainstormer avant d'implémenter. Garder le desktop comme option « officielle/pérenne », proposer le Studio web 2.5.1 comme option « zéro install ».
