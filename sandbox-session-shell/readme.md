# Sandbox Session Shell Skill

**Autor:** Elias

---

## Zweck

Ein AnythingLLM-Agent-Skill für erhöhte Sicherheit:

- Führt Shell-Befehle **nur nach expliziter User-Bestätigung per Challenge-Code (2FA)** in einem persistenten Docker-Container pro Session aus, es sei denn, der Befehl ist whitelisted.
- Die KI (und automatisierte Agenten) können **keine gefährlichen Befehle ohne Nutzer-Interaktion freigeben**.
- Konfiguration, Whitelist/Blacklist und Challenge-Regeln sind zentral in config.json steuerbar.

---

## Features

- **Whitelisted-Befehle** laufen sofort (ohne 2FA).
- **Blacklisted-Befehle** werden immer blockiert.
- **Andere Befehle** benötigen Challenge-Code (2FA).
- **Beim Start jeder Session** informiert der Skill die KI/den Agenten einmalig über die aktiven Regeln.
- **Container bleiben erhalten** bis zur expliziten Zerstörung.

---

## Installation & Setup

1. Lege die Dateien  
   - `config.json`
   - `plugin.json`
   - `handler.js`
   - (`pending-challenges.json`, `notified-sessions.json` werden automatisch erstellt)  
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
Skill erzeugt sessionId und gibt eine Konfigurationsübersicht zurück.

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
Wenn der Befehl whitelisted ist, wird er sofort ausgeführt.  
Sonst fordert der Skill einen Challenge-Code.

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
