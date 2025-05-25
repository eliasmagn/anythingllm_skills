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
    this.introspect(`Calling: ${caller}`);

    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');

    // === 1) Hartcodierte Git-Credentials ===
    const config = require('config');
    const port = config.get('github.owner');
    const host = config.get('github.token');

    // === Whitelist für lokale Pfade ===
    const ALLOWED_DIRS = [
      '/home/elias/Development/ADRIANA'
    ];
    const ALLOW_PUBLIC = false; // default: private

    function isAllowed(p) {
      const abs = path.resolve(p);
      return ALLOWED_DIRS.some(d => {
        const absD = path.resolve(d);
        return abs === absD || abs.startsWith(absD + path.sep);
      });
    }

    // Parameter extrahieren
    const {
      action,
      repoName,
      localPath,
      commitMessage,
      sourceBranch,
      targetBranch
    } = args;

    // Validierung
    if (!action || !['create','clone','pull','commit','push','merge'].includes(action)) {
      throw new Error("Param 'action' muss einer von create, clone, pull, commit, push, merge sein.");
    }
    if (!localPath) {
      throw new Error("Param 'localPath' ist erforderlich.");
    }
    if (['create','clone'].includes(action) && !repoName) {
      throw new Error("Param 'repoName' ist erforderlich für create/clone.");
    }
    if (action === 'commit' && !commitMessage) {
      throw new Error("Param 'commitMessage' ist erforderlich für commit.");
    }
    if (action === 'merge' && (!sourceBranch || !targetBranch)) {
      throw new Error("Param 'sourceBranch' und 'targetBranch' sind erforderlich für merge.");
    }
    if (!isAllowed(localPath)) {
      return 'Zugriff verweigert: Pfad nicht in Whitelist.';
    }

    // Repo-Name ermitteln (für push/merge)
    const repo = repoName || path.basename(path.resolve(localPath));

    // === CREATE ===
    if (action === 'create') {
      // GitHub-API-Call
      const payload = JSON.stringify({ name: repo, private: !ALLOW_PUBLIC });
      execSync(
        `curl -H "Authorization: token ${GITHUB_TOKEN}" -d '${payload}' https://api.github.com/user/repos`,
        { stdio: 'inherit' }
      );

      // lokal initialisieren & erster Commit
      fs.mkdirSync(localPath, { recursive: true });
      execSync('git init', { cwd: localPath });
      execSync('git add .', { cwd: localPath });
      execSync('git commit -m "Initial commit"', { cwd: localPath });

      // erster Push auf main
      execSync(
        `git push https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${repo}.git HEAD:main`,
        { cwd: localPath, stdio: 'inherit' }
      );
      return `Repo ${repo} erstellt und initialer Push durchgeführt.`;
    }

    // === CLONE ===
    if (action === 'clone') {
      fs.mkdirSync(localPath, { recursive: true });
      execSync(
        `git clone https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${repo}.git "${localPath}"`,
        { stdio: 'inherit' }
      );
      return `Repo ${repo} geklont nach ${localPath}`;
    }

    // === PULL ===
    if (action === 'pull') {
      execSync('git pull', { cwd: localPath, stdio: 'inherit' });
      return `git pull erfolgreich in ${localPath}`;
    }

    // === COMMIT ===
    if (action === 'commit') {
      execSync('git add .', { cwd: localPath });
      execSync(
        `git commit -m "${commitMessage.replace(/"/g,'\\"')}"`,
        { cwd: localPath }
      );
      return `Commit erstellt: "${commitMessage}"`;
    }

    // === PUSH ===
    if (action === 'push') {
      // aktuellen Branch ermitteln
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: localPath })
        .toString().trim();
      execSync(
        `git push https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${repo}.git HEAD:${branch}`,
        { cwd: localPath, stdio: 'inherit' }
      );
      return `git push erfolgreich auf Branch ${branch}`;
    }

    // === MERGE ===
    if (action === 'merge') {
      execSync(`git checkout ${targetBranch}`, { cwd: localPath });
      execSync(`git merge ${sourceBranch}`, { cwd: localPath });
      execSync(
        `git push https://${GITHUB_TOKEN}@github.com/${GITHUB_OWNER}/${repo}.git ${targetBranch}`,
        { cwd: localPath, stdio: 'inherit' }
      );
      return `Branch ${sourceBranch} nach ${targetBranch} gemerged und gepusht.`;
    }
  }
};
