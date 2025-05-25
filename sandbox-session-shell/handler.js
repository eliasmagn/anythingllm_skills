const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHALLENGE_STORE = path.join(__dirname, 'pending-challenges.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function validateCommand(command, config) {
  if (!command || typeof command !== "string" || !command.trim()) {
    return "❌ Der Befehl darf nicht leer sein.";
  }
  if (command.length > (config.maxCommandLength || 256)) {
    return `❌ Der Befehl ist zu lang (maximal ${config.maxCommandLength || 256} Zeichen).`;
  }

  // Pipes, Verkettungen, Subshells blocken
  const forbiddenPattern = /[\n;|&`$()\\]/;
  if (forbiddenPattern.test(command)) {
    return "❌ Verkettete, verschachtelte oder mehrzeilige Shell-Kommandos sind nicht erlaubt.";
  }

  if (config.whitelistCommands && config.whitelistCommands.length > 0 && config.alwaysAllowWhitelist) {
    if (config.whitelistCommands.includes(command.trim())) {
      return null; // Whitelisted-Befehl, sofort OK
    }
    return `❌ Nur folgende Befehle sind erlaubt:\n${config.whitelistCommands.join(", ")}`;
  }

  for (const forbidden of config.forbiddenCommands || []) {
    const pattern = new RegExp(`\\b${forbidden.trim()}\\b`, "i");
    if (pattern.test(command)) {
      return `❌ Der Befehl enthält ein verbotenes Kommando: "${forbidden}"`;
    }
  }
  for (const pat of config.forbiddenPatterns || []) {
    try {
      if (pat.trim() && new RegExp(pat, "i").test(command)) {
        return `❌ Der Befehl ist aufgrund eines Musters nicht erlaubt: ${pat}`;
      }
    } catch {}
  }
  return null;
}

function isAllowedWritePath(filename, config) {
  let absPath = filename;
  if (!path.isAbsolute(absPath)) return true;
  absPath = path.normalize(absPath);
  for (const dir of config.forbiddenWriteDirs || []) {
    if (absPath === dir || absPath.startsWith(dir + "/")) return false;
  }
  let ok = false;
  for (const dir of config.allowedWriteDirs || []) {
    if (absPath === dir || absPath.startsWith(dir + "/")) {
      ok = true;
      break;
    }
  }
  if (!ok && config.allowedTmpWrite && absPath.startsWith("/tmp/")) ok = true;
  return ok;
}

function extractWriteFiles(command) {
  // Fängt einfache Umleitungen > oder >> auf
  const filePattern = />{1,2}\s*([^\s|&;]+)/g;
  let match, files = [];
  while ((match = filePattern.exec(command)) !== null) files.push(match[1]);
  return files;
}

function generateSessionId() {
  return crypto.randomBytes(12).toString('hex');
}

function loadChallenges() {
  if (fs.existsSync(CHALLENGE_STORE)) {
    return JSON.parse(fs.readFileSync(CHALLENGE_STORE, 'utf8'));
  }
  return {};
}
function saveChallenges(obj) {
  fs.writeFileSync(CHALLENGE_STORE, JSON.stringify(obj, null, 2), 'utf8');
}
function randomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports.runtime = {
  handler: async function (args = {}) {
    const { spawnSync } = require('child_process');
    let { sessionId, projectPath, command, confirmationCode, destroyContainer } = args;
    const config = loadConfig();

    // --- SessionId generieren, falls nicht übergeben ---
    if (!sessionId || typeof sessionId !== "string" || !sessionId.match(/^[a-zA-Z0-9\-_]{3,40}$/)) {
      sessionId = generateSessionId();
      return (
        `⚠️ Es wurde eine neue sessionId erzeugt:\n\n${sessionId}\n\n` +
        `Bitte verwende diese sessionId für alle weiteren Befehle in diesem Chat!`
      );
    }
    const containerName = "sandbox_" + sessionId;

    // --- Explizit Container zerstören? ---
    if (destroyContainer === true) {
      this.introspect(
        `⚠️ Soll der Container für diese Session wirklich gelöscht werden?\n\n` +
        `Antworte mit:\n{"sessionId": "${sessionId}", "destroyContainer": true, "confirmationCode": "<CODE>"}`
      );
      return "Container-Löschung benötigt ebenfalls einen Sicherheitscode. Bitte Code eingeben.";
    }

    // --- Projektpfad prüfen ---
    if (!projectPath || typeof projectPath !== "string" || !projectPath.trim()) {
      throw new Error("❌ Parameter 'projectPath' fehlt oder ist ungültig.");
    }
    const absProject = path.resolve(projectPath);
    if (!fs.existsSync(absProject) || !fs.statSync(absProject).isDirectory()) {
      throw new Error(`❌ Projektverzeichnis nicht gefunden: ${absProject}`);
    }

    // --- Befehl validieren ---
    const validationError = validateCommand(command, config);
    if (validationError) return validationError;

    // --- Schreibe-Check: Nur Projektverzeichnis oder erlaubte Dirs ---
    const writeFiles = extractWriteFiles(command);
    for (const f of writeFiles) {
      if (!isAllowedWritePath(path.resolve(absProject, f), config)) {
        return `❌ Schreibzugriff auf ${f} ist nicht erlaubt.`;
      }
    }

    // --- Challenge-Mechanismus ---
    const challenges = loadChallenges();
    const challenge = challenges[sessionId];
    const now = Date.now();

    // Challenge notwendig, wenn keine gültige oder anderer Befehl:
    if (!confirmationCode || !challenge || challenge.command !== command || challenge.projectPath !== projectPath || now - challenge.timestamp > ((config.maxChallengeAge || 180) * 1000)) {
      // Neue Challenge erzeugen (alte überschreiben!)
      const code = randomCode();
      challenges[sessionId] = {
        command,
        projectPath,
        code,
        timestamp: now
      };
      saveChallenges(challenges);

      this.introspect(
        `Sicherheitsabfrage: Um den Befehl \`${command}\` auszuführen, gib bitte diesen Code ein: **${code}** (gültig für ${(config.maxChallengeAge || 180)} Sekunden)`
      );
      if (config.enableIntrospectDebug)
        this.introspect(`[DEBUG] Challenge erzeugt für Session ${sessionId} und command: ${command}`);
      return "Warte auf Bestätigungscode vom Benutzer...";
    }

    // Challenge prüfen
    if (challenge.code !== confirmationCode) {
      return "❌ Sicherheitscode falsch oder abgelaufen. Bitte neuen Befehl anfordern!";
    }

    // Challenge einmalig benutzen, dann löschen!
    delete challenges[sessionId];
    saveChallenges(challenges);

    // Persistent Container anlegen, falls noch nicht vorhanden
    let exists = spawnSync(
      `docker ps -q -f name=${containerName}`,
      { shell: true, encoding: "utf8" }
    ).stdout.trim();
    if (!exists) {
      // --user <user> (nur falls nicht root)
      let userOpt = "";
      if (config.defaultContainerUser && config.defaultContainerUser !== "root") {
        userOpt = `--user ${config.defaultContainerUser}`;
      }
      spawnSync([
        'docker run -d --name', containerName,
        `-v ${absProject}:/sandbox/project:rw`,
        '-w /sandbox/project',
        userOpt,
        config.defaultDockerImage,
        'tail -f /dev/null'
      ].join(' '), { shell: true });
      await new Promise(res => setTimeout(res, 1000));
      if (config.enableIntrospectDebug)
        this.introspect(`[DEBUG] Neuer Container ${containerName} gestartet als User: ${config.defaultContainerUser || "root"}`);
    }

    // Befehl ausführen!
    this.introspect(`▶️ Führe im Container aus: ${command}`);
    const res = spawnSync(
      `docker exec ${containerName} bash -lc "${command}"`,
      { shell: true, encoding: "utf8" }
    );
    let output = (res.stdout || "") + (res.stderr || "");
    if (res.status !== 0) {
      output = `❌ Fehler (Exit-Code ${res.status}):\n${output}`;
    }
    return output.trim();
  }
};
