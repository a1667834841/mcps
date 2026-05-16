/**
 * Test all MCP methods for SQL Server
 * 
 * Usage: npx tsx tests/test-mcp-methods-sqlserver.ts
 */

import { createProvider } from '../src/providers/index.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.sqlserver' });

async function testAllMethods() {
  console.log('=== MCP All Methods Test (SQL Server) ===\n');

  const provider = createProvider();

  try {
    // 1. Connect
    console.log('1. Testing connect...');
    await provider.connect();
    console.log('   ✓ Connected successfully\n');

    // 2. List databases
    console.log('2. Testing list_databases...');
    const databases = await provider.listDatabases();
    console.log(`   Found ${databases.length} databases:`);
    databases.slice(0, 10).forEach(db => {
      console.log(`   - ${db.name || db}`);
    });
    console.log();

    // 3. List tables
    console.log('3. Testing list_tables...');
    const dbName = 'hems_henanshengrenmindev_dev';
    console.log(`   Listing tables in database: ${dbName}`);
    const tables = await provider.listTables(dbName);
    console.log(`   Found ${tables.length} tables:`);
    tables.slice(0, 10).forEach(t => {
      console.log(`   - ${t.name || t.table_name || t}`);
    });
    console.log();

    // 4. Describe table
    console.log('4. Testing describe_table...');
    if (tables.length > 0) {
      const tableName = tables[0]?.name || tables[0]?.table_name || tables[0];
      console.log(`   Describing table: ${tableName}`);
      const schema = await provider.describeTable(dbName, tableName);
      console.log(`   Table: ${schema.table}`);
      console.log(`   Columns: ${schema.columns.length}`);
      schema.columns.slice(0, 5).forEach(col => {
        console.log(`   - ${col.name} (${col.data_type})`);
      });
      if (schema.primary_keys && schema.primary_keys.length > 0) {
        console.log(`   Primary Keys: ${schema.primary_keys.join(', ')}`);
      }
    } else {
      console.log('   No tables to describe');
    }
    console.log();

    // 5. Execute query
    console.log('5. Testing execute_query...');
    console.log('   Query: SELECT 1 + 1 AS result');
    const result = await provider.executeQuery('SELECT 1 + 1 AS result', dbName);
    console.log(`   Result: ${JSON.stringify(result.rows)}`);
    console.log();

    // 6. Execute query - get version
    console.log('6. Testing execute_query (version)...');
    console.log('   Query: SELECT @@VERSION');
    const version = await provider.executeQuery('SELECT @@VERSION AS version', dbName);
    console.log(`   Version: ${JSON.stringify(version.rows)}`);
    console.log();

    // 7. Get table indexes
    console.log('7. Testing get_table_indexes...');
    if (tables.length > 0) {
      const tableName = tables[0]?.name || tables[0]?.table_name || tables[0];
      console.log(`   Getting indexes for table: ${tableName}`);
      const indexes = await provider.getTableIndexes(dbName, tableName);
      console.log(`   Found ${indexes.length} indexes:`);
      indexes.slice(0, 5).forEach(idx => {
        console.log(`   - ${idx.name || idx.index_name || idx}`);
      });
    } else {
      console.log('   No tables to get indexes');
    }
    console.log();

    // 8. Get table stats
    console.log('8. Testing get_table_stats...');
    if (tables.length > 0) {
      const tableName = tables[0]?.name || tables[0]?.table_name || tables[0];
      console.log(`   Getting stats for table: ${tableName}`);
      const stats = await provider.getTableStats(dbName, tableName);
      console.log(`   Stats: ${JSON.stringify(stats)}`);
    } else {
      console.log('   No tables to get stats');
    }
    console.log();

    console.log('=== All MCP methods test passed! ===');

  } catch (error: any) {
    console.error('Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await provider.close();
  }
}

testAllMethods();
