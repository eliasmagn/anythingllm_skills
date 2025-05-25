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
    const callerId = `${this.config.name}-v${this.config.version}`;
    this.logger(`Calling: ${callerId}`);
    this.introspect(`Calling: ${callerId}`);

    const fs   = require('fs');
    const path = require('path');

    // === 1) Whitelist definieren ===
    const ALLOWED_DIRS = [
      '/home/elias/Development/ADRIANA'
    ];
    function isAllowed(fileOrDir) {
      const abs   = path.resolve(fileOrDir);
      return ALLOWED_DIRS.some(d => {
        const absDir = path.resolve(d);
        return abs === absDir || abs.startsWith(absDir + path.sep);
      });
    }

    try {
      const { action, path: p, filename, content } = args;

      // === 2) Parameter validieren ===
      if (!action || !['read','write','mkdir'].includes(action)) {
        throw new Error("Param 'action' muss 'read', 'write' oder 'mkdir' sein.");
      }
      if (!p) {
        throw new Error("Param 'path' ist erforderlich.");
      }

      // --- M K D I R ---
      if (action === 'mkdir') {
        const dirPath = path.resolve(p);
        if (!isAllowed(dirPath)) {
          return 'Zugriff verweigert: Ordner nicht erlaubt.';
        }
        fs.mkdirSync(dirPath, { recursive: true });
        this.logger(`Created directory ${dirPath}`);
        this.introspect(`Created directory ${dirPath}`);
        return `Ordner erstellt: ${dirPath}`;
      }

      // --- WRITE ---
      if (action === 'write') {
        if (!filename)    throw new Error("'filename' ist erforderlich für write.");
        if (content == null) throw new Error("'content' ist erforderlich für write.");

        const folder = path.resolve(p);
        if (!isAllowed(folder)) {
          return 'Zugriff verweigert: Ordner nicht erlaubt.';
        }

        fs.mkdirSync(folder, { recursive: true });
        let outName  = filename;
        let filePath = path.join(folder, outName);

        if (fs.existsSync(filePath)) {
          const ts = new Date().toISOString().replace(/[-:T.]/g, '');
          outName  = `${ts}-${filename}`;
          filePath = path.join(folder, outName);
        }

        this.logger(`Saving file to ${filePath}`);
        this.introspect(`Saving file to ${filePath}`);
        fs.writeFileSync(filePath, content, 'utf8');
        return `Datei gespeichert: ${filePath}`;
      }

      // --- READ ---
      {
        const filePath = path.resolve(p);
        const dir      = path.dirname(filePath);

        if (!isAllowed(dir)) {
          return 'Zugriff verweigert: Pfad nicht erlaubt.';
        }
        if (!fs.existsSync(filePath)) {
          return `Datei nicht gefunden: ${filePath}`;
        }

        this.logger(`Reading file from ${filePath}`);
        this.introspect(`Reading file from ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        return data;
      }

    } catch (e) {
      this.logger(e);
      this.introspect(`${callerId} fehlgeschlagen: ${e.message}`);
      return `Fehler: ${e.message}`;
    }
  }
};
