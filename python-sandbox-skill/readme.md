# Python Sandbox Skill

This AnythingLLM Agent Skill executes Python projects inside Docker containers in either **ephemeral** or **persistent** mode.  
It isolates the host system, installs project dependencies, and allows flexible Python execution with detailed progress reporting.

---

## Features

- 🔒 **Isolated execution**: Code runs inside Docker, not on your host.
- 🧹 **Ephemeral mode**: Starts a fresh container each run (clean, repeatable).
- 🚀 **Persistent mode**: Reuses a long-running container for faster iteration.
- 📦 **Dependency installation**: Automatically runs `pip install -r requirements.txt`.
- 📤 **Live feedback**: Progress messages and command output are streamed to the UI.
- ⏱ **Execution timeout**: Default 30s per run (adjustable).
- 💬 **Custom commands**: Run any shell/Python command, like `pytest`, `python main.py`, etc.

---

## Parameters

| Parameter     | Type     | Description                                                                                       |
|---------------|----------|---------------------------------------------------------------------------------------------------|
| `mode`        | string   | `"ephemeral"` (default) starts a new container each time; `"persistent"` keeps one alive          |
| `projectPath` | string   | Absolute path to the Python project root folder                                                   |
| `command`     | string   | Shell command to execute inside the container                                                     |

### Examples

- Run a test suite in a fresh container:
  ```json
  {
    "mode": "ephemeral",
    "projectPath": "/home/elias/myproj",
    "command": "pytest"
  }
  ```

- Run in a reusable, long-lived container:
  ```json
  {
    "mode": "persistent",
    "projectPath": "/home/elias/myproj",
    "command": "python main.py"
  }
  ```

---

## Installation

1. Copy the skill folder into your AnythingLLM custom skills directory:
   ```bash
   /home/elias/anything-llm/storage/plugins/agent-skills/python-sandbox-skill
   ```

2. Make sure these files are present:
   - `plugin.json`
   - `handler.js`
   - `README.md`

3. In `plugin.json`, verify:
   ```json
   {
     "active": true,
     "schema": "skill-1.0.0"
   }
   ```

4. Restart AnythingLLM:
   ```bash
   pm2 restart anything-llm
   ```

5. Activate the skill via **Agent Configuration → Skills** in the UI.

---

## Security Considerations

> ⚠️ This skill runs arbitrary code in a container. Use with care.

- **Untrusted Code**: Do not expose to untrusted users.
- **Docker Access**: The AnythingLLM process must have Docker permissions (typically via the `docker` group).
- **Persistent Mode**:
  - State and installed packages persist between runs.
  - Logs, files, and caches remain unless explicitly cleaned.
  - Run `docker rm -f python_sandbox_llm` to reset.
- **Run as Non-Root**:
  - Consider building a custom Docker image with a non-root user.
- **Resource Limits**:
  - Use flags like `--memory=512m --cpus=1.0` to control resource use.
- **Timeouts**:
  - Modify the timeout in `handler.js` if longer runs are needed.
- **Output Volume**:
  - Extremely verbose output may overwhelm the UI — keep it manageable.

---

## Resetting the Persistent Container

To delete the persistent container and its data:

```bash
docker rm -f python_sandbox_llm
```

---

## Recommended Improvements

- 🔧 Use a custom Docker image with preinstalled dependencies and non-root user.
- ⏳ Add optional `timeout` parameter per run.
- 🧹 Add a “reset mode” to remove or rebuild the persistent container via prompt.
- 🧩 Make the container name project- or user-specific to prevent state sharing.

---

## Requirements

- Docker installed and accessible (e.g., user is in `docker` group)
- Node.js ≥ 18
- AnythingLLM with support for `skill-1.0.0`

---

## License

MIT © 2025 – Custom Python Execution Skill for AnythingLLM
