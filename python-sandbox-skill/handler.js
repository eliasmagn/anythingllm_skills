/**
 * @typedef {Object} AnythingLLM
 * @property {('docker'|'desktop')} runtime
 * @property {import('./plugin.json')} config
 * @property {function(string|Error): void} logger
 * @property {function(string): void} introspect
 */

module.exports.runtime = {
  handler: async function (args = {}) {
    const caller = `${this.config.name}-v${this.config.version}`;
    this.logger(`Calling: ${caller}`);

    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { spawnSync, execSync } = require('child_process');

    const { mode = 'ephemeral', projectPath, command } = args;

    if (!projectPath) throw new Error("Param 'projectPath' ist erforderlich.");
    if (!command)     throw new Error("Param 'command' ist erforderlich (z.B. 'python main.py').");

    const absProject = path.resolve(projectPath);
    if (!fs.existsSync(absProject) || !fs.statSync(absProject).isDirectory()) {
      throw new Error(`Projektverzeichnis nicht gefunden: ${absProject}`);
    }
    this.introspect(`✔ Projekt gefunden: ${absProject}`);

    // 1. Temp-Verzeichnis anlegen und Projekt kopieren
    const tmpRoot = os.tmpdir();
    const tmpDir  = fs.mkdtempSync(path.join(tmpRoot, 'sandbox-'));
    this.introspect(`✔ Temporäres Verzeichnis erstellt: ${tmpDir}`);
    this.introspect(`⏳ Kopiere Projekt nach Sandbox...`);
    execSync(`cp -a ${absProject}/. ${tmpDir}`);
    this.introspect(`✔ Kopieren abgeschlossen`);

    let output = "";
    let error = "";

    if (mode === "ephemeral") {
      // --- Ephemerer Modus ---
      this.introspect(`▶️ Starte ephemeren Container mit: ${command}`);
      const dockerCmd = [
        'timeout 30s docker run --rm',
        `-v ${tmpDir}:/sandbox/project:rw`,
        '-w /sandbox/project',
        'python:3.10-slim',
        'bash', '-lc',
        `"${command}"`
      ].join(' ');

      // stdout/stderr sammeln, auch bei Fehler!
      const res = spawnSync(dockerCmd, { shell: true, encoding: 'utf8' });
      output = (res.stdout || "") + (res.stderr || "");
      if (res.error) {
        error = res.error.message;
      }
      if (res.status !== 0) {
        output = `❌ Fehler (Exit-Code ${res.status}):\n${output}`;
      }
    }
    else if (mode === "persistent") {
      // --- Persistenter Modus ---
      const containerName = 'python_sandbox_llm';
      this.introspect(`🔄 Nutze persistenten Container: ${containerName}`);

      // Container existiert? Sonst anlegen und requirements installieren.
      let exists = execSync(
        `docker ps -q -f name=${containerName}`,
        { encoding: 'utf8' }
      ).trim();

      if (!exists) {
        this.introspect(`⚙️ Persistent Container wird erstellt...`);
        execSync([
          'docker run -d --name', containerName,
          `-v ${tmpDir}:/sandbox/project:rw`,
          '-w /sandbox/project',
          'python:3.10-slim tail -f /dev/null'
        ].join(' '));
        this.introspect(`📦 Installiere requirements in persistentem Container...`);
        execSync(`docker exec ${containerName} bash -lc "pip install -r requirements.txt"`);
      }

      // Befehl ausführen und Output/Fehler erfassen:
      this.introspect(`▶️ Führe im Container aus: ${command}`);
      const res = spawnSync(
        'docker',
        ['exec', containerName, 'bash', '-lc', command],
        { encoding: 'utf8' }
      );
      output = (res.stdout || "") + (res.stderr || "");
      if (res.error) {
        error = res.error.message;
      }
      if (res.status !== 0) {
        output = `❌ Fehler (Exit-Code ${res.status}):\n${output}`;
      }
    }
    else {
      throw new Error(`Unbekannter mode: ${mode}`);
    }

    // Aufräumen (nur temp-dir, persistenter Container bleibt)
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    this.introspect(`✔ Sandbox aufgeräumt: ${tmpDir}`);

    if (error) {
      return `${output}\n\nWeitere Fehlerinfo: ${error}`;
    } else {
      return output.trim();
    }
  }
};
