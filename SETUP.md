# RPG Maker XP MCP Server — Setup Guide

Step-by-step guide to install and configure the RPG Maker XP MCP Server.

## Prerequisites

- Node.js 18 or higher (`npm` comes with it)
- An RPG Maker XP project (a folder containing `Data/System.rxdata`)
- An MCP client — Claude Desktop or Claude Code, or a local-model setup such as
  Open WebUI with Ollama (see "Ollama / Open WebUI" below)
- Optional, for map rendering: an RPG Maker XP install providing the RTP
  graphics (the Steam copy works), or a project that ships its own `Graphics/`

## Installation

### 1. Install dependencies

```bash
cd rpgmaker-xp-mcp
npm install
```

### 2. Build

```bash
npm run build
```

Compiles the TypeScript to `dist/`.

### 3. Verify the build

```bash
# Windows
dir dist
# macOS/Linux
ls -la dist
```

You should see `dist/index.js`.

## Configuration

The server is configured entirely through environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `RPGMAKER_PROJECT_PATH` | yes | Path to your XP project (the folder containing `Data/`) |
| `RPGMAKER_RTP_PATH` | no | RTP graphics root for `render_map` (defaults to the Steam RPGXP `rtp/`); project-local `Graphics/` always takes precedence |

### Claude Code

From your project, register the server (adjust the path to `dist/index.js`):

```bash
claude mcp add rpgmaker-xp \
  --env RPGMAKER_PROJECT_PATH=C:/path/to/your/xp/project \
  -- node C:/path/to/rpgmaker-xp-mcp/dist/index.js
```

Or add it to `.mcp.json` / your Claude Code config:

```json
{
  "mcpServers": {
    "rpgmaker-xp": {
      "command": "node",
      "args": ["C:/path/to/rpgmaker-xp-mcp/dist/index.js"],
      "env": {
        "RPGMAKER_PROJECT_PATH": "C:/path/to/your/xp/project",
        "RPGMAKER_RTP_PATH": "C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp"
      }
    }
  }
}
```

### Claude Desktop

Edit `claude_desktop_config.json`:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rpgmaker-xp": {
      "command": "node",
      "args": ["C:/path/to/rpgmaker-xp-mcp/dist/index.js"],
      "env": {
        "RPGMAKER_PROJECT_PATH": "C:/path/to/your/xp/project"
      }
    }
  }
}
```

Use forward slashes (`/`) in paths even on Windows. Completely quit and restart
Claude Desktop after editing.

### Ollama / Open WebUI (local models)

The server is a standard stdio MCP server, so it is natively compatible with any
MCP client. Ollama itself does not yet include an MCP client, so a local model
connects through a small bridge. The two paths below use the same `mcpServers`
configuration shown above.

#### Open WebUI (chat UI over Ollama)

Open WebUI has native MCP support and talks to stdio servers through `mcpo`, an
OpenAPI proxy (https://github.com/open-webui/mcpo). It runs the MCP server as a
subprocess and exposes its tools as a REST/OpenAPI endpoint Open WebUI can call.

1. Create `mcpo.json`:

   ```json
   {
     "mcpServers": {
       "rpgmaker-xp": {
         "command": "npx",
         "args": ["-y", "rpgmaker-xp-mcp"],
         "env": {
           "RPGMAKER_PROJECT_PATH": "C:/path/to/your/xp/project",
           "RPGMAKER_RTP_PATH": "C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp"
         }
       }
     }
   }
   ```

2. Start the proxy (installs on demand via `uv`; `pip install mcpo` also works):

   ```bash
   uvx mcpo --port 8000 --config mcpo.json
   ```

3. In Open WebUI, open Settings, then Tools, and add the server URL
   `http://localhost:8000/rpgmaker-xp`. Its OpenAPI schema is at
   `http://localhost:8000/rpgmaker-xp/docs`. The tools are then available to any
   Ollama model you load.

Open WebUI's native MCP support landed in v0.6.31; on older versions, update first.

#### Terminal / TUI

`mcp-client-for-ollama` (`ollmcp`, https://github.com/jonigl/mcp-client-for-ollama)
connects one or more MCP servers directly to a local Ollama model from the
terminal, using the same `mcpServers` configuration shape.

#### Model choice

Pick a model with solid tool-calling ability (for example a recent Qwen or Llama
instruct model). Map authoring in particular chains several tool calls per task,
which smaller models can handle unreliably.

### Finding your project path

An RPG Maker XP project folder contains:

- `Game.rxproj` (and `Game.ini`)
- `Data/` — the `.rxdata` files (`System.rxdata`, `MapXXX.rxdata`, `Actors.rxdata`, …)
- `Graphics/` and `Audio/` (a project may instead rely on the shared RTP)

`RPGMAKER_PROJECT_PATH` points at the **folder that contains `Data/`**. The
server validates a project by the presence of `Data/System.rxdata`, so a bare
`Data/` folder works too.

## Verification

In a new conversation:

```
What MCP servers are connected?
```

You should see `rpgmaker-xp`. Then try:

```
Show me the game title and all actors from my project.
Render map 1 so I can see it.
```

The first uses `get_game_title` / `get_actors`; the second uses `render_map` and
writes a PNG to `Data/.mcp-preview/`.

## Troubleshooting

- **`rpgmaker-xp` server not found** — check the path to `dist/index.js`, make
  sure you restarted the client, and that `npm run build` succeeded.
- **"Invalid RPG Maker XP project path"** — `RPGMAKER_PROJECT_PATH` must point at
  a folder containing `Data/System.rxdata`; use forward slashes.
- **`ENOENT` / file errors** — close the RPG Maker XP editor (it locks/rewrites
  files), and re-check the path.
- **`render_map` reports missing graphics** — set `RPGMAKER_RTP_PATH` to your
  RPGXP `rtp/` folder, or ensure the project's `Graphics/Tilesets` & `Autotiles`
  exist. Missing files are listed in the tool's `notes`, not fatal.
- **"Cannot find module"** — re-run `npm install` then `npm run build`.

Client logs: Windows `%APPDATA%\Claude\logs\`, macOS `~/Library/Logs/Claude/`,
Linux `~/.config/Claude/logs/`.

## Advanced

### Environment variable instead of config

Set `RPGMAKER_PROJECT_PATH` as a system/user environment variable and omit `env`
from the config. macOS/Linux: add `export RPGMAKER_PROJECT_PATH=...` to your
shell profile.

### Multiple projects

Register one server entry per project, each with its own
`RPGMAKER_PROJECT_PATH`:

```json
{
  "mcpServers": {
    "xp-game-a": { "command": "node", "args": ["C:/path/to/rpgmaker-xp-mcp/dist/index.js"], "env": { "RPGMAKER_PROJECT_PATH": "C:/games/A" } },
    "xp-game-b": { "command": "node", "args": ["C:/path/to/rpgmaker-xp-mcp/dist/index.js"], "env": { "RPGMAKER_PROJECT_PATH": "C:/games/B" } }
  }
}
```

### Development mode

```bash
npm run dev   # tsc --watch, rebuilds on save
```

Run the server directly to see stderr logs:

```bash
RPGMAKER_PROJECT_PATH=C:/path/to/project node dist/index.js
```

## Safety

- Caution: the server writes to your project's `.rxdata` files directly.
- It backs up each file to `Data/.mcp-backup/` before its first write per
  session, and bumps `System.magic_number` so existing saves reload edited maps.
- **Close the RPG Maker XP editor while using the server** — on save the editor
  rewrites every data file from memory and will clobber external changes.
- Keep your project under version control and test in the editor after changes.

## Next steps

1. [README.md](README.md) — feature/tool overview
2. [EXAMPLES.md](EXAMPLES.md) — usage examples
3. [SKILL_CREATION_GUIDE.md](SKILL_CREATION_GUIDE.md) — creating skills in depth
