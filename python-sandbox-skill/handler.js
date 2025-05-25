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
    this.introspect(`Copying project and running in sandbox...`);

    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { execSync } = require('child_process');

    const { projectPath, command } = args;
    if (!projectPath) {
      throw new Error("Param 'projectPath' ist erforderlich.");
    }
    if (!command) {
      throw new Error("Param 'command' ist erforderlich (z.B. 'python main.py').");
    }

    // 1) Absoluten Pfad prüfen
    const absProject = path.resolve(projectPath);
    if (!fs.existsSync(absProject) || !fs.statSync(absProject).isDirectory()) {
      throw new Error(`Projektverzeichnis nicht gefunden: ${absProject}`);
    }

    // 2) Temporäres Arbeitsverzeichnis anlegen
    const tmpRoot = os.tmpdir();
    const tmpDir = fs.mkdtempSync(path.join(tmpRoot, 'sandbox-'));

    // 3) Projekt kopieren (inkl. versteckter Dateien)
    execSync(`cp -a ${absProject}/. ${tmpDir}`);

    // 4) Docker-Command bauen
    const dockerCmd = [
      'timeout 30s docker run --rm',
      `-v ${tmpDir}:/sandbox/project:ro`,
      'python:3.10-slim',
      'bash -lc',
      `"pip install -r /sandbox/project/requirements.txt && ${command}"`
    ].join(' ');

    this.logger(`Running sandbox: ${dockerCmd}`);
    this.introspect(`Installing dependencies and executing command...`);

    try {
      const output = execSync(dockerCmd, { encoding: 'utf8' });
      return output.trim();
    } catch (e) {
      return `Fehler in Sandbox: ${e.message}`;
    } finally {
      // Aufräumen
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
};
