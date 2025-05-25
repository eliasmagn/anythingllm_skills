const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHALLENGE_STORE = path.join(__dirname, 'pending-challenges.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const SESSION_SUMMARY_TRACK = path.join(__dirname, 'notified-sessions.json');
const LOG_DIR = "/tmp";

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function loadSessionNotified() {
  if (fs.existsSync(SESSION_SUMMARY_TRACK)) {
    return JSON.parse(fs.readFileSync(SESSION_SUMMARY_TRACK, 'utf8'));
  }
  return {};
}
function saveSessionNotified(obj) {
  fs.writeFileSync(SESSION_SUMMARY_TRACK, JSON.stringify(obj, null, 2), 'utf8');
}

function validateCommand(command, config) {
  if (!command || typeof command !== "string" || !command.trim()) {
    return "❌ Der Befehl darf nicht leer sein.";
  }
  if (command.length > (config.maxCommandLength || 256)) {
    return `❌ Der Befehl ist zu lang (maximal ${config.maxCommandLength || 256} Zeichen).`;
  }
  const forbiddenPattern = /[\n;|&`$()\\]/;
  if (forbiddenPattern.test(command)) {
    return "❌ Verkettete, verschachtelte oder mehrzeilige Shell-Kommandos sind nicht erlaubt.";
  }
  for (const forbidden of config.forbiddenCommands || []) {
    const pattern = new RegExp(`\\b${forbidden.trim()}\\b`, "i");
    if (pattern.test(command)) {
      return `❌ Der Befehl ist verboten: "${forbidden}". Passe die Konfiguration an, falls du ihn erlauben möchtest.`;
    }
  }
  for (const pat of config.forbiddenPatterns || []) {
    try {
      if (pat.trim() && new RegExp(pat, "i").test(command)) {
        return `❌ Der Befehl ist aufgrund eines Musters verboten: ${pat}`;
      }
    } catch {}
  }
  return null;
}

function isWhitelisted(command, config) {
  return (
    config.whitelistCommands &&
    config.whitelistCommands.length > 0 &&
    config.alwaysAllowWhitelist &&
    config.whitelistCommands.includes(command.trim())
  );
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

function configSummary(config) {
  return [
    "Skill active.",
    `- Whitelisted commands (no 2FA): ${config.whitelistCommands.join(', ') || 'none'}`,
    `- Blacklisted commands: ${config.forbiddenCommands.join(', ') || 'none'}`,
    `- All other commands require user confirmation (2FA challenge).`,
    `- Container user: ${config.defaultContainerUser}`,
    `- Project directory (mount): /sandbox/project`
  ].join('\n');
}

// JSONL-Logger für jedes Kommando
function logToJsonl(sessionId, command, output) {
  const logFile = path.join(LOG_DIR, `anythingllm_shelllog_${sessionId}.jsonl`);
  const entry = {
    timestamp: new Date().toISOString(),
    session: sessionId,
    command,
    output
  };
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

module.exports.runtime = {
  handler: async function (args = {}) {
    const { spawnSync } = require('child_process');
    let { sessionId, projectPath, command, confirmationCode, destroyContainer } = args;
    const config = loadConfig();

    // SessionId erzeugen/festlegen
    if (!sessionId || typeof sessionId !== "string" || !sessionId.match(/^[a-zA-Z0-9\-_]{3,40}$/)) {
      sessionId = generateSessionId();
      const summary = configSummary(config) +
        `\n\nNeue sessionId: ${sessionId}\nBitte verwende diese sessionId für alle weiteren Befehle in diesem Chat!`;
      return summary;
    }
    const containerName = "sandbox_" + sessionId;

    // Config-Zusammenfassung am Start der SessionId nur einmal senden
    const notified = loadSessionNotified();
    if (!notified[sessionId]) {
      notified[sessionId] = true;
      saveSessionNotified(notified);
      return configSummary(config) +
        `\n\nBitte benutze sessionId ${sessionId} für alle weiteren Befehle.`;
    }

    // Container-Stop/Löschung
    if (destroyContainer === true) {
      this.introspect(
        `⚠️ Soll der Container für diese Session wirklich gelöscht werden?\n\n` +
        `Antworte mit:\n{"sessionId": "${sessionId}", "destroyContainer": true, "confirmationCode": "<CODE>"}`
      );
      return `[Session: ${sessionId}]\nContainer-Löschung benötigt einen Sicherheitscode.`;
    }

    // Projektpfad prüfen
    if (!projectPath || typeof projectPath !== "string" || !projectPath.trim()) {
      throw new Error("❌ Parameter 'projectPath' fehlt oder ist ungültig.");
    }
    const absProject = path.resolve(projectPath);
    if (!fs.existsSync(absProject) || !fs.statSync(absProject).isDirectory()) {
      throw new Error(`❌ Projektverzeichnis nicht gefunden: ${absProject}`);
    }

    // Command Validation (BLACKLIST first!)
    const validationError = validateCommand(command, config);
    if (validationError) return `[Session: ${sessionId}]\n${validationError}`;

    // Whitelist: sofort ausführen, keine Challenge
    if (isWhitelisted(command, config)) {
      // Container sicherstellen
      let exists = spawnSync(
        `docker ps -q -f name=${containerName}`,
        { shell: true, encoding: "utf8" }
      ).stdout.trim();

      if (!exists) {
        let userOpt = "";
        if (config.defaultContainerUser && config.defaultContainerUser !== "root") {
          userOpt = `--user ${config.defaultContainerUser}`;
        }
        const runCmd = [
          'docker run -d --name', containerName,
          `-v ${absProject}:/sandbox/project:rw`,
          '-w /sandbox/project',
          userOpt,
          config.defaultDockerImage,
          'tail -f /dev/null'
        ].join(' ');
        this.introspect(`[INFO] Führe aus: ${runCmd}`);
        spawnSync(runCmd, { shell: true });
        await new Promise(res => setTimeout(res, 1000));

        // Verifizieren, dass Container läuft
        const verify = spawnSync(
          `docker ps -q -f name=${containerName}`,
          { shell: true, encoding: "utf8" }
        ).stdout.trim();
        if (!verify) {
          const logOutput = spawnSync(
            `docker logs ${containerName}`,
            { shell: true, encoding: "utf8" }
          ).stdout.trim();
          throw new Error(
            `❌ Fehler: Container '${containerName}' konnte nicht erfolgreich gestartet werden!` +
            (logOutput ? `\nDocker-Log-Ausgabe:\n${logOutput}` : "")
          );
        }
        this.introspect(`[DEBUG] Container '${containerName}' läuft (SessionId: ${sessionId})`);
      }

      const execCmd = `docker exec ${containerName} bash -lc "${command}"`;
      this.introspect(`[INFO] Führe aus: ${execCmd}`);
      const res = spawnSync(execCmd, { shell: true, encoding: "utf8" });
      let output = (res.stdout || "") + (res.stderr || "");
      logToJsonl(sessionId, command, output);
      if (res.status !== 0) {
        output = `❌ Fehler (Exit-Code ${res.status}):\n${output}`;
      }
      return `[Session: ${sessionId}]\n[INFO] Führe aus: ${execCmd}\n${output.trim()}\nLog: ${LOG_DIR}/anythingllm_shelllog_${sessionId}.jsonl`;
    }

    // Schreib-Checks für nicht-whitelist Befehle
    const writeFiles = extractWriteFiles(command);
    for (const f of writeFiles) {
      if (!isAllowedWritePath(path.resolve(absProject, f), config)) {
        return `[Session: ${sessionId}]\n❌ Schreibzugriff auf ${f} ist nicht erlaubt.`;
      }
    }

    // 2FA Challenge für sonstige Kommandos
    const challenges = loadChallenges();
    const challenge = challenges[sessionId];
    const now = Date.now();

    if (!confirmationCode || !challenge || challenge.command !== command || challenge.projectPath !== projectPath || now - challenge.timestamp > ((config.maxChallengeAge || 180) * 1000)) {
      // Neue Challenge erzeugen
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
      return `[Session: ${sessionId}]\nWarte auf Bestätigungscode vom Benutzer...`;
    }

    if (challenge.code !== confirmationCode) {
      return `[Session: ${sessionId}]\n❌ Sicherheitscode falsch oder abgelaufen. Bitte neuen Befehl anfordern!`;
    }
    delete challenges[sessionId];
    saveChallenges(challenges);

    // Container wieder sicherstellen (z.B. nach Timeout)
    let exists = spawnSync(
      `docker ps -q -f name=${containerName}`,
      { shell: true, encoding: "utf8" }
    ).stdout.trim();
    if (!exists) {
      let userOpt = "";
      if (config.defaultContainerUser && config.defaultContainerUser !== "root") {
        userOpt = `--user ${config.defaultContainerUser}`;
      }
      const runCmd = [
        'docker run -d --name', containerName,
        `-v ${absProject}:/sandbox/project:rw`,
        '-w /sandbox/project',
        userOpt,
        config.defaultDockerImage,
        'tail -f /dev/null'
      ].join(' ');
      this.introspect(`[INFO] Führe aus: ${runCmd}`);
      spawnSync(runCmd, { shell: true });
      await new Promise(res => setTimeout(res, 1000));

      const verify = spawnSync(
        `docker ps -q -f name=${containerName}`,
        { shell: true, encoding: "utf8" }
      ).stdout.trim();
      if (!verify) {
        const logOutput = spawnSync(
          `docker logs ${containerName}`,
          { shell: true, encoding: "utf8" }
        ).stdout.trim();
        throw new Error(
          `❌ Fehler: Container '${containerName}' konnte nicht erfolgreich gestartet werden!` +
          (logOutput ? `\nDocker-Log-Ausgabe:\n${logOutput}` : "")
        );
      }
      this.introspect(`[DEBUG] Container '${containerName}' läuft (SessionId: ${sessionId})`);
    }

    const execCmd = `docker exec ${containerName} bash -lc "${command}"`;
    this.introspect(`[INFO] Führe aus: ${execCmd}`);
    const res = spawnSync(execCmd, { shell: true, encoding: "utf8" });
    let output = (res.stdout || "") + (res.stderr || "");
    logToJsonl(sessionId, command, output);
    if (res.status !== 0) {
      output = `❌ Fehler (Exit-Code ${res.status}):\n${output}`;
    }
    return `[Session: ${sessionId}]\n[INFO] Führe aus: ${execCmd}\n${output.trim()}\nLog: ${LOG_DIR}/anythingllm_shelllog_${sessionId}.jsonl`;
  }
};
