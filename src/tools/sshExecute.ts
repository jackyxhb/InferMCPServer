import { z } from "zod";
import { Client as SshClient } from "ssh2";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerSshTool(server: McpServer): void {
  server.registerTool(
    "sshExecute",
    {
      description: "Execute a command on a remote server via SSH",
      inputSchema: {
        host: z.string().describe("SSH host"),
        port: z.number().optional().default(22).describe("SSH port"),
        username: z.string().describe("SSH username"),
        password: z.string().describe("SSH password"),
        command: z.string().describe("Command to execute")
      }
    },
    async (args) => {
      return new Promise((resolve, reject) => {
        const conn = new SshClient();
        conn
          .on("ready", () => {
            conn.exec(args.command, (err, stream) => {
              if (err) {
                conn.end();
                reject(err);
                return;
              }

              let output = "";

              stream
                .on("close", () => {
                  conn.end();
                  resolve({ content: [{ type: "text", text: output }] });
                })
                .on("data", (data: Buffer) => {
                  output += data.toString();
                })
                .stderr.on("data", (data: Buffer) => {
                  output += "STDERR: " + data.toString();
                });
            });
          })
          .on("error", (err) => {
            conn.end();
            reject(err);
          })
          .connect({
            host: args.host,
            port: args.port,
            username: args.username,
            password: args.password
          });
      });
    }
  );
}
