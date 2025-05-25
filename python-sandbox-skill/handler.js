/**
 * @typedef {Object} AnythingLLM
 * @property {('docker'|'desktop')} runtime
 * @property {import('./plugin.json')} config
 * @property {function(string|Error): void} logger
 * @property {function(string): void} introspect
 */

/** @type {AnythingLLM} */
module.exports.runtime = {
  handler: async function (args = {}) {
    const caller = `${this.config.name}-v${this.config.version}`;
    this.logger(`Calling: ${caller}`);

    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { execSync } = require('child_process');

    // Neu: Modus (default: ephemeral)
    const { mode = 'ephemeral', projectPath, command } = args;

    if (!projectPath) throw new Error("Param 'projectPath' ist erforderlich.");
    if (!command)     throw new Error("Param 'command' ist erforderlich (z.B. 'python main.py').");

    // 1. Projekt-Verzeichnis prüfen
    const absProject = path.resolve(projectPath);
    if (!fs.existsSync(absProject) || !fs.statSync(absProject).isDirectory()) {
      throw new Error(`Projektverzeichnis nicht gefunden: ${absProject}`);
    }
    this.introspect(`✔ Projekt gefunden: ${absProject}`);

    // 2. Temp-Verzeichnis anlegen
    const tmpRoot = os.tmpdir();
    const tmpDir  = fs.mkdtempSync(path.join(tmpRoot, 'sandbox-'));
    this.introspect(`✔ Temporäres Verzeichnis erstellt: ${tmpDir}`);

    // 3. Projekt kopieren (inkl. versteckter Dateien)
    this.introspect(`⏳ Kopiere Projekt nach Sandbox...`);
    execSync(`cp -a ${absProject}/. ${tmpDir}`);
    this.introspect(`✔ Kopieren abgeschlossen`);

    let output;
    if (mode === 'ephemeral') {
      // Frischer Container pro Aufruf
      this.introspect(`▶️ Starte ephemeren Container...`);
      const dockerCmd = [
        'timeout 30s docker run --rm',
        `-v ${tmpDir}:/sandbox/project:rw`,
        '-w /sandbox/project',
        'python:3.10-slim',
        'bash -lc',
        `"pip install -r requirements.txt && ${command}"`
      ].join(' ');
      this.introspect(`🔧 Running: ${dockerCmd}`);
      output = execSync(dockerCmd, { encoding: 'utf8' });

    } else if (mode === 'persistent') {
      // Persistent Container nutzen
      const containerName = 'python_sandbox_llm';
      this.introspect(`🔄 Nutze persistenten Container: ${containerName}`);
      // Container starten, falls noch nicht vorhanden
      const exists = execSync(
        `docker ps -q -f name=${containerName}`, { encoding: 'utf8' }
      ).trim();
      if (!exists) {
        this.introspect(`⚙️ Persistent Container wird erstellt...`);
        execSync([
          'docker run -d --name', containerName,
          `-v ${tmpDir}:/sandbox/project:rw`,
          '-w /sandbox/project',
          'python:3.10-slim tail -f /dev/null'
        ].join(' '));
        this.introspect(`📦 Dependencies werden im Container installiert...`);
        execSync(`docker exec ${containerName} bash -lc "pip install -r requirements.txt"`);
      }
      // Befehl im persistent container ausführen
      this.introspect(`▶️ Führe im Container aus: ${command}`);
      output = execSync(
        `docker exec ${containerName} bash -lc "${command}"`,
        { encoding: 'utf8' }
      );
    } else {
      throw new Error(`Unbekannter mode: ${mode}`);
    }

    // 4. Aufräumen
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); }
    catch {}

    this.introspect(`✔ Sandbox aufgeräumt: ${tmpDir}`);
    return output.trim();
  }
};
