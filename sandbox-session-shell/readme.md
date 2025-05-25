# Sandbox Session Shell Skill

**Autor:** Elias

---

## Zweck

Ein AnythingLLM-Agent-Skill für maximale Sicherheit:

- Führt Shell-Befehle **nur nach expliziter User-Bestätigung per Challenge-Code (2FA)** in einem persistenten Docker-Container pro Session aus.
- Die KI (und automatisierte Agenten) können **keine Befehle ohne Nutzer-Interaktion freigeben**.
- Zentrale Konfiguration aller Sicherheitsregeln, User, Whitelists etc.

---

## Features

- **Sicherer Challenge-Flow:**  
  Jeder kritische Befehl kann nur nach echtem Code-Eingabe freigegeben werden.
- **Zentrale config.json:**  
  Blacklist/Whitelist für Kommandos und Verzeichnisse, User, Docker-Image, Challenge-Zeit, Debug.
- **Nur ein aktiver Challenge-Code pro Session und Befehl, zeitlich begrenzt gültig.**
- **Warnungen und Hinweise im Debug-Modus via Introspect.**
- **Voreinstellung:** Kein Root, keine gefährlichen Kommandos oder Verzeichnisse, alles einfach anpassbar.

---

## Installation & Setup

1. **Lege die vier Dateien**
    - `config.json`
    - `plugin.json`
    - `handler.js`
    - (`pending-challenges.json` wird automatisch erstellt)
    
    im Ordner  
    `~/.config/anythingllm-desktop/storage/plugins/agent-skills/sandbox-session-shell/` ab.

2. **Docker muss laufen**  
   und dein User Docker-Rechte haben.

3. **Aktiviere den Skill**  
   im AnythingLLM Desktop.

---

## Nutzung

### **Neuer Session-Start:**
```json
{
  "projectPath": "/pfad/zu/deinem/projekt",
  "command": "apt update"
}
```
Antwort:  
Skill erzeugt sessionId, fordert Challenge-Code.

---

### **Weitere Aktionen:**
```json
{
  "sessionId": "DEINE_SESSIONID",
  "projectPath": "/pfad/zu/deinem/projekt",
  "command": "ls -l"
}
```
Antwort:  
Skill fordert Challenge-Code.

---

### **Code-Bestätigung:**
```json
{
  "sessionId": "DEINE_SESSIONID",
  "projectPath": "/pfad/zu/deinem/projekt",
  "command": "ls -l",
  "confirmationCode": "DEINCODE"
}
```
Antwort:  
Befehl wird ausgeführt, Ausgabe erscheint im Chat/UI.

---

### **Container löschen:**
```json
{
  "sessionId": "DEINE_SESSIONID",
  "destroyContainer": true,
  "confirmationCode": "DEINCODE"
}
```
---

## Hinweise

- **Challenge-Codes gelten nur für den aktuellen Befehl und sind zeitlich begrenzt.**
- **Alle Regeln und Warnungen sind in `config.json` einstellbar.**
- **Wer „root“ und gefährliche Mounts erlaubt, macht das auf eigene Verantwortung!**

---

## Lizenz

MIT

---
