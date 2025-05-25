const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHALLENGE_STORE = path.join(__dirname, 'pending-challenges.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const SESSION_SUMMARY_TRACK = path.join(__dirname, 'notified-sessions.json');

// Load config once per handler call
function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// Keep track of which sessionIds have been notified of the config (in-memory or file)
function loadSessionNotified() {
  if (fs.existsSync(SESSION_SUMMARY_TRACK)) {
    return JSON.parse(fs.readFileSync(SESSION_SUMMARY_TRACK, 'utf8'));
  }
  return {};
}
function saveSessionNotified(obj) {
  fs.writeFileSync(SESSION_SUMMARY_TRACK, JSON.stringify(obj, null, 2), 'utf8');
}

// Core command validation
function validateCommand(command, config) {
  if (!command || typeof command !== "string" || !command.trim()) {
    return "❌ Der Befehl darf nicht leer sein.";
  }
  if (command.length > (config.maxCommandLength || 256)) {
    return `❌ Der Befehl ist zu lang (maximal ${config.maxCommandLength || 256} Zeichen).`;
  }

  // Pipes, Verkettungen, Subshells blocken (for security)
  const forbiddenPattern = /[\n;|&`$()\\]/;
  if (forbiddenPattern.test(command)) {
    return "❌ Verkettete, verschachtelte oder mehrzeilige Shell-Kommandos sind nicht erlaubt.";
  }

  // Blacklist commands
  for (const forbidden of config.forbiddenCommands || []) {
    const pattern = new RegExp(`\\b${forbidden.trim()}\\b`, "i");
    if (pattern.test(command)) {
      return `❌ Der Befehl ist verboten: "${forbidden}". Passe die Konfiguration an, falls du ihn erlauben möchtest.`;
    }
  }
  // Blacklist patterns
  for (const pat of config.forbiddenPatterns || []) {
    try {
      if (pat.trim() && new RegExp(pat, "i").test(command)) {
        return `❌ Der Befehl ist aufgrund eines Musters verboten: ${pat}`;
      }
    } catch {}
  }
  return null;
}

// Whitelist check (for immediate exec, no challenge)
function isWhitelisted(command, config) {
  return (
    config.whitelistCommands &&
    config.whitelistCommands.length > 0 &&
    config.alwaysAllowWhitelist &&
    config.whitelistCommands.includes(command.trim())
  );
}

// Write path validation (rudimentary, extend as needed)
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

// Challenge storage
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

module.exports.runtime = {
  handler: async function (args = {}) {
    const { spawnSync } = require('child_process');
    let { sessionId, projectPath, command, confirmationCode, destroyContainer } = args;
    const config = loadConfig();

    // Generate or validate sessionId
    if (!sessionId || typeof sessionId !== "string" || !sessionId.match(/^[a-zA-Z0-9\-_]{3,40}$/)) {
      sessionId = generateSessionId();
      // Return config summary for new session
      const summary = configSummary(config) +
        `\n\nNeue sessionId: ${sessionId}\nBitte verwende diese sessionId für alle weiteren Befehle in diesem Chat!`;
      return summary;
    }
    const containerName = "sandbox_" + sessionId;

    // --- Inform the AI about the config, but only once per sessionId ---
    const notified = loadSessionNotified();
    if (!notified[sessionId]) {
      notified[sessionId] = true;
      saveSessionNotified(notified);
      // Use return, so the LLM/AI can read it
      return configSummary(config) +
        `\n\nBitte benutze sessionId ${sessionId} für alle weiteren Befehle.`;
    }

    // --- Container destroy? ---
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

    // --- Command validation (BLACKLIST first!) ---
    const validationError = validateCommand(command, config);
    if (validationError) return validationError;

    // --- Whitelist: run immediately, no challenge ---
    if (isWhitelisted(command, config)) {
      // Ensure container exists
      let exists = spawnSync(
        `docker ps -q -f name=${containerName}`,
        { shell: true, encoding: "utf8" }
      ).stdout.trim();
      if (!exists) {
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

      this.introspect(`▶️ Führe im Container aus (Whitelist, kein 2FA): ${command}`);
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

    // --- Write path check for non-whitelist commands ---
    const writeFiles = extractWriteFiles(command);
    for (const f of writeFiles) {
      if (!isAllowedWritePath(path.resolve(absProject, f), config)) {
        return `❌ Schreibzugriff auf ${f} ist nicht erlaubt.`;
      }
    }

    // --- 2FA Challenge mechanism for other commands ---
    const challenges = loadChallenges();
    const challenge = challenges[sessionId];
    const now = Date.now();

    // New challenge needed if no code, or wrong code, or expired, or different command
    if (!confirmationCode || !challenge || challenge.command !== command || challenge.projectPath !== projectPath || now - challenge.timestamp > ((config.maxChallengeAge || 180) * 1000)) {
      // Create new challenge
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

    if (challenge.code !== confirmationCode) {
      return "❌ Sicherheitscode falsch oder abgelaufen. Bitte neuen Befehl anfordern!";
    }
    // One-time use
    delete challenges[sessionId];
    saveChallenges(challenges);

    // Ensure container exists (again, in case it was removed)
    let exists = spawnSync(
      `docker ps -q -f name=${containerName}`,
      { shell: true, encoding: "utf8" }
    ).stdout.trim();
    if (!exists) {
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

    this.introspect(`▶️ Führe im Container aus (mit 2FA): ${command}`);
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
