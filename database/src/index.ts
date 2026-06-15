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
import { createProvider, DatabaseProvider } from './providers/index.js';
import { getDatabaseType, getSafetyConfig, getSensitiveConfig } from './config/index.js';
import { validateReadOnly, injectRowLimit, redactTableSchema, redactQueryResult } from './utils/index.js';

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
      let tableSchema = await dbProvider.describeTable(database, table, schema);

      // Sensitive column redaction: remove hit columns entirely
      const { enabled, matchSet } = getSensitiveConfig();
      if (enabled) {
        tableSchema = redactTableSchema(tableSchema, matchSet);
      }

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
      let result = await dbProvider.executeQuery(limitedQuery, database);

      // Sensitive column redaction: remove hit columns from result
      const { enabled, matchSet } = getSensitiveConfig();
      if (enabled) {
        result = redactQueryResult(result, matchSet);
      }

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
