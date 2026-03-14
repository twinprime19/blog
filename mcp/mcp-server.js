#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS } from './mcp-tools.js';

const server = new McpServer({ name: 'the-wire', version: '1.0.0' });

// Register each tool with MCP server
for (const [name, tool] of Object.entries(TOOLS)) {
  server.tool(name, tool.description, tool.schema, async (args) => {
    try {
      return await tool.handler(args);
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  });
}

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[the-wire-mcp] Server started on stdio');
