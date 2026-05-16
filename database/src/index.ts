#!/usr/bin/env node
/**
 * MCP Server for SQL Server and MySQL
 * 
 * A Model Context Protocol server for connecting to and querying databases.
 * Supports: SQL Server, MySQL (extensible to more databases)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProvider, DatabaseProvider } from './providers/index.js';
import { getDatabaseType, getSafetyConfig } from './config/index.js';
import { validateReadOnly, injectRowLimit } from './utils/index.js';

// install-skill 子命令：在初始化 MCP 或数据库之前拦截并退出。
// 用法：mcp-database install-skill <目标目录>
//   会把本包内的 skill/ 复制到 <目标目录>/mcp-database/
const _argv = process.argv.slice(2);
if (_argv[0] === 'install-skill') {
  const targetRoot = resolve(process.cwd(), _argv[1] ?? '.');
  const here = dirname(fileURLToPath(import.meta.url)); // dist/
  const skillSource = resolve(here, '..', 'skill');
  if (!existsSync(skillSource)) {
    console.error(`[mcp-database] skill 资源未随包发布: ${skillSource}`);
    process.exit(1);
  }
  const dest = resolve(targetRoot, 'mcp-database');
  mkdirSync(dest, { recursive: true });
  cpSync(skillSource, dest, { recursive: true });
  console.log(`[mcp-database] skill 已安装到: ${dest}`);
  process.exit(0);
}

// Load environment variables
dotenv.config();

// Global database provider
let dbProvider: DatabaseProvider;

// Create MCP server
const server = new McpServer({
  name: 'database',
  version: '2.0.0',
});

// Initialize database provider
async function initProvider() {
  const dbType = getDatabaseType();
  console.error(`Initializing database provider for: ${dbType}`);

  dbProvider = createProvider();

  try {
    await dbProvider.connect();
    console.error(`Connected to ${dbType} successfully`);
  } catch (error: any) {
    console.error(`Warning: Could not connect to ${dbType}: ${error.message}`);
  }
}

// Tool: list_databases
server.registerTool(
  'list_databases',
  {
    title: 'List Databases',
    description: 'List all databases (excluding system databases)',
  },
  async () => {
    try {
      const databases = await dbProvider.listDatabases();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(databases, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing databases: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: list_tables
server.registerTool(
  'list_tables',
  {
    title: 'List Tables',
    description: 'List all tables in a specific database',
    inputSchema: {
      database: z.string(),
      schema: z.string().default('dbo').optional(),
    },
  },
  async ({ database, schema = 'dbo' }) => {
    try {
      const tables = await dbProvider.listTables(database, schema);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(tables, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing tables: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: describe_table
server.registerTool(
  'describe_table',
  {
    title: 'Describe Table',
    description: 'Get table structure information (columns, data types, nullable, primary keys, etc.)',
    inputSchema: {
      database: z.string(),
      table: z.string(),
      schema: z.string().default('dbo').optional(),
    },
  },
  async ({ database, table, schema = 'dbo' }) => {
    try {
      const tableSchema = await dbProvider.describeTable(database, table, schema);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(tableSchema, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error describing table: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: execute_query
server.registerTool(
  'execute_query',
  {
    title: 'Execute Query',
    description: 'Execute SQL SELECT queries (only SELECT and WITH allowed, limited to 1000 rows)',
    inputSchema: {
      query: z.string(),
      database: z.string().optional(),
    },
  },
  async ({ query, database }) => {
    const { readonly, maxRows } = getSafetyConfig();
    const dbType = getDatabaseType();

    // Readonly validation: whitelist-based SQL static check
    if (readonly) {
      const check = validateReadOnly(query, dbType);
      if (!check.safe) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${check.reason}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Inject row limit at SQL level
    const limitedQuery = injectRowLimit(query, dbType, maxRows);

    try {
      const result = await dbProvider.executeQuery(limitedQuery, database);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `SQL Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get_table_indexes
server.registerTool(
  'get_table_indexes',
  {
    title: 'Get Table Indexes',
    description: 'Get index information for a table',
    inputSchema: {
      database: z.string(),
      table: z.string(),
      schema: z.string().default('dbo').optional(),
    },
  },
  async ({ database, table, schema = 'dbo' }) => {
    try {
      const indexes = await dbProvider.getTableIndexes(database, table, schema);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(indexes, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting indexes: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Tool: get_table_stats
server.registerTool(
  'get_table_stats',
  {
    title: 'Get Table Statistics',
    description: 'Get table statistics (row count, size, etc.)',
    inputSchema: {
      database: z.string(),
      table: z.string(),
      schema: z.string().default('dbo').optional(),
    },
  },
  async ({ database, table, schema = 'dbo' }) => {
    try {
      const stats = await dbProvider.getTableStats(database, table, schema);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting table stats: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Cleanup on exit
process.on('SIGINT', async () => {
  await dbProvider.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await dbProvider.close();
  process.exit(0);
});

// Start server
async function main() {
  await initProvider();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
