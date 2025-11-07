# Infer MCP Server

This is an MCP (Model Context Protocol) server providing resource access via SSH and RDBMS connections. It is designed to integrate with AI Copilot tools like GitHub Copilot in VS Code and Cursor.

<a href="https://glama.ai/mcp/servers/@jackyxhb/InferMCPServer">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@jackyxhb/InferMCPServer/badge" alt="Infer Server MCP server" />
</a>

## Setup

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Run: `npm start`

## Features

- SSH command execution enforced through configured profiles, command allowlists, and output quotas
- PostgreSQL database queries limited to configured connections and statement patterns
- Per-profile concurrency limits with cancellation-aware execution and progress notifications
- Classifier training orchestration via SSH profiles

## Configuration

The server loads configuration from either `INFER_MCP_CONFIG_PATH` (JSON file) or `INFER_MCP_CONFIG` (inline JSON string). A starter config is available at `config/sample-config.json`; copy `.env.example` to `.env` and update paths/secrets as needed.

Secrets can be provided inline, via environment variables, or read from disk. Example:

```json
{
	"sshProfiles": {
		"training-cluster": {
			"host": "cluster.example.com",
			"username": "trainer",
			"privateKey": {
				"path": "./secrets/training-cluster.key"
			},
			"policy": {
				"allowedCommands": ["^python\\s+train.py\\b"],
				"maxExecutionMs": 900000,
				"maxOutputBytes": 1048576
			}
		}
	},
	"databaseProfiles": {
		"training-metadata": {
			"connectionString": { "env": "TRAINING_METADATA_DB_URL" },
			"allowedStatements": ["^\\s*SELECT\\b", "^\\s*WITH\\b"],
			"maxRows": 1000,
			"maxExecutionMs": 20000
		}
	},
	"training": {
		"defaultCommandTemplate": "python train.py --dataset={{datasetPath}} --class={{subclass}}",
		"defaultTimeoutMs": 600000
	}
}
```

- `sshProfiles` define reusable credentials for tools such as `sshExecute` and `trainClassifier`. For `password`, `privateKey`, or `passphrase`, supply either a raw string, `{ "env": "VAR_NAME" }`, or `{ "path": "relative/or/absolute" }`. Base64-encoded files are supported with `{ "path": "...", "encoding": "base64" }`. Policies control command allowlists, maximum runtime, captured output size, and per-profile `maxConcurrent` slots. The sample config includes a `local-test` profile against `127.0.0.1` with placeholder credentials (`tester` / `changeme`) so you can quickly exercise SSH tooling via a local daemon—update these values before real use.
- `databaseProfiles` centralise PostgreSQL access. Statements must match the configured regex allowlists and respect row/time limits, with `maxConcurrent` restricting simultaneous queries per profile.
- `training` controls defaults for classifier jobs.

## Integration

Configure in your AI tool's MCP settings to connect to this server.

For VS Code GitHub Copilot: Add to `mcp.json` in `.vscode` folder.

## Debugging

You can debug this MCP server using VS Code's debugger.

## Simulator

Build the project (`npm run build`) and use the simulator to exercise tools locally without an agent client:

```bash
npm run simulate -- list
npm run simulate -- call sshExecute '{"profile":"training-cluster","command":"python train.py --help"}'
npm run simulate -- call dbQuery '{"profile":"training-metadata","query":"SELECT * FROM jobs LIMIT 5"}'
```

Override defaults with environment variables:

- `MCP_SERVER_COMMAND` – binary to launch (default `node`)
- `MCP_SERVER_ARGS` – comma-separated arguments (default `build/index.js`)
- `MCP_SERVER_CWD` – working directory for the spawned server

For staging validation, copy `config/staging-config.json`, populate the referenced secrets, and set `INFER_MCP_CONFIG_PATH=$(pwd)/config/staging-config.json` before running `npm run simulate -- …` commands. For quick localhost smoke-tests, aim `INFER_MCP_CONFIG_PATH` at `config/sample-config.json`, ensure your SSH server accepts the `local-test` credentials, or tweak that profile to match an existing local account. The server runs in permissive local-test mode by default; set `INFER_MCP_MODE=production` to re-enable SSH policy enforcement for the loopback profile when you deploy.

## Integration Testing

- Build the project (`npm run build`) so the simulator artifact exists.
- Configure staging credentials via `INFER_MCP_CONFIG_PATH` or `INFER_MCP_CONFIG` (the staging sample references environment variables and secret files under `config/secrets/`).
- Run `npm run test:integration` to execute Vitest suites that shell out to the simulator (guarded by `INTEGRATION=1`).
- The integration suite expects the simulator to list `sshExecute`, `dbQuery`, and `trainClassifier`; extend `tests/integration/` with additional cases as you add tools.