import { WorkspaceService } from "@atria/core";
import { FileSystemWorkspaceRepository, resolveWorkspacePath } from "@atria/core/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAtriaMcpTools } from "./index";

export async function startAtriaMcpServer(workspacePath = resolveWorkspacePath()): Promise<void> {
  const service = new WorkspaceService(new FileSystemWorkspaceRepository(workspacePath));
  const server = new McpServer({ name: "atria", version: "0.1.0" });

  for (const tool of createAtriaMcpTools(service)) {
    server.tool(tool.name, tool.description, tool.inputSchema.shape, async (input) => {
      const result = await tool.handler(input);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    });
  }

  await server.connect(new StdioServerTransport());
}

