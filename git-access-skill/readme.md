# Git Access Skill

Dieser Agenten-Skill ermöglicht es, Git-Operationen direkt über AnythingLLM durchzuführen. Dabei werden nur ein hartcodierter GitHub-Owner und ein Personal Access Token im Handler verwendet – Credentials werden nie als Parameter über die KI übergeben.

## Features

* **create**: Neues Repository über GitHub-API anlegen (standardmäßig privat).
* **clone**: Repository klonen mit Token-Authentifizierung.
* **pull**: `git pull` im lokalen Repository.
* **commit**: `git add .` und `git commit -m "<message>"`.
* **push**: `git push --set-upstream origin HEAD`.
* **merge**: Branch-Merge und automatischer Push.

## Voraussetzungen

* Node.js ≥18
* `curl` auf dem System installiert
* AnythingLLM-Version mit Custom Skills (Schema `skill-1.0.0`)

## Installation

1. Wechsle in dein AnythingLLM-Storage-Verzeichnis:

   ```bash
   cd /home/elias/anything-llm/storage/plugins/agent-skills/
   ```
2. Skill-Ordner anlegen (HubID entspricht Ordnername):

   ```bash
   mkdir git-access-skill
   cd git-access-skill
   ```
3. Lege `plugin.json`, `handler.js` und diese `README.md` im Verzeichnis ab.
4. Stelle in `plugin.json` sicher, dass `"active": true` und `"schema": "skill-1.0.0"` gesetzt sind.
5. AnythingLLM neu starten:

   ```bash
   pm2 restart anything-llm
   # oder
   node /home/elias/anything-llm/server.js
   ```
6. Im AnythingLLM-Frontend unter **Agenten-Konfiguration → Skills** den Skill **„Git Access“** aktivieren.

## Konfiguration

Im `handler.js` kannst du folgende Werte anpassen:

* **GITHUB\_OWNER**: Dein GitHub-Benutzername.
* **GITHUB\_TOKEN**: Dein GitHub Personal Access Token (hartcodiert im Code).
* **ALLOWED\_DIRS**: Array mit absoluten Pfaden, in denen Git-Operationen erlaubt sind.
* **ALLOW\_PUBLIC**: `true`/`false`, legt fest, ob öffentliche Repositories erstellt werden dürfen (default `false`).

## Parameter

| Parameter       | Beschreibung                                                            |
| --------------- | ----------------------------------------------------------------------- |
| `action`        | Aktion: `create`, `clone`, `pull`, `commit`, `push`, `merge`.           |
| `repoName`      | Name des Repositories (bei `create`/`clone`).                           |
| `localPath`     | Lokaler Pfad zum Repository (alle Aktionen außer `create` und `clone`). |
| `commitMessage` | Commit-Message (nur bei `commit`).                                      |
| `sourceBranch`  | Quell-Branch für Merge (nur bei `merge`).                               |
| `targetBranch`  | Ziel-Branch für Merge (nur bei `merge`).                                |

## Beispiele

* **Repository erstellen**

  ```json
  {"action":"create","repoName":"myproject","localPath":"/home/elias/Development/ADRIANA/myproject"}
  ```

* **Repository klonen**

  ```json
  {"action":"clone","repoName":"myproject","localPath":"/home/elias/Development/ADRIANA/myproject"}
  ```

* **Commit & Push**

  ```json
  {"action":"commit","localPath":"/home/elias/Development/ADRIANA/myproject","commitMessage":"Update docs"}
  ```

  ```json
  {"action":"push","localPath":"/home/elias/Development/ADRIANA/myproject"}
  ```

* **Branch-Merge**

  ```json
  {"action":"merge","localPath":"/home/elias/Development/ADRIANA/myproject","sourceBranch":"feature","targetBranch":"main"}
  ```

## Sicherheitshinweise

* Credentials werden fest im `handler.js` kodiert – stelle sicher, dass nur vertrauenswürdige Nutzer Zugriff auf den Code haben.
* Schränke **ALLOWED\_DIRS** auf vertrauenswürdige Pfade ein.
* Setze **ALLOW\_PUBLIC** auf `false`, um Datenleaks zu vermeiden.
* Verwende ein GitHub Personal Access Token mit minimalen Berechtigungen.

---

*Erstellt für das AnythingLLM Git Access Skill*
