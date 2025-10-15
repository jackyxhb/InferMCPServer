# Secrets Directory

Store private keys, certificates, and other sensitive artifacts in this folder. Files here are ignored by git via the project `.gitignore`, so they stay local to your environment.

Suggested layout:

- `training-cluster.key` – SSH private key for the training cluster
- `rdbms-password.txt` – optional database credentials or connection strings

Update your MCP configuration (see `config/sample-config.json`) to reference these files via relative paths from this directory.
