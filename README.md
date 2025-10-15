# Infer MCP Server

This is an MCP (Model Context Protocol) server providing resource access via SSH and RDBMS connections. It is designed to integrate with AI Copilot tools like GitHub Copilot in VS Code and Cursor.

## Setup

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Run: `npm start`

## Features

- SSH command execution
- PostgreSQL database queries
- Classifier training orchestration via SSH profiles

## Configuration

The server loads configuration from either `INFER_MCP_CONFIG_PATH` (JSON file) or `INFER_MCP_CONFIG` (inline JSON string). A starter config is available at `config/sample-config.json`; copy `.env.example` to `.env` and update paths/secrets as needed.

Secrets can be provided inline, via environment variables, or read from disk. Example:

```json
{
	"sshProfiles": {
		"training-cluster": {
			"host": "cluster.example.com",
			"port": 22,
			"username": "trainer",
			"privateKey": {
				"path": "./secrets/training-cluster.key"
			},
			"passphrase": {
				"env": "TRAINING_CLUSTER_KEY_PASSPHRASE",
				"optional": true
			}
		}
	},
	"training": {
		"defaultCommandTemplate": "python train.py --dataset={{datasetPath}} --class={{subclass}}",
		"defaultTimeoutMs": 600000
	}
}
```

- `sshProfiles` define reusable credentials for tools such as `trainClassifier`. For `password`, `privateKey`, or `passphrase`, supply either a raw string, `{ "env": "VAR_NAME" }`, or `{ "path": "relative/or/absolute" }`. Base64-encoded files are supported with `{ "path": "...", "encoding": "base64" }`.
- `training` controls defaults for classifier jobs.

## Integration

Configure in your AI tool's MCP settings to connect to this server.

For VS Code GitHub Copilot: Add to `mcp.json` in `.vscode` folder.

## Debugging

You can debug this MCP server using VS Code's debugger.
