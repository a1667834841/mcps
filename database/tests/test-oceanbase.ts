/**
 * Test script for OceanBase provider
 */

import { createProvider } from '../src/providers/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('=== OceanBase Provider Test ===\n');

  const provider = createProvider();

  try {
    console.log('1. Connecting to OceanBase...');
    await provider.connect();
    console.log('   ✓ Connected successfully\n');

    console.log('2. Listing databases...');
    const databases = await provider.listDatabases();
    console.log('   Found databases:', databases.length);
    databases.slice(0, 5).forEach(db => {
      console.log(`   - ${db.name}`);
    });
    console.log();

    const dbName = process.env.TEST_DB ?? 'testdb';
    console.log(`3. Listing tables in ${dbName} database...`);
    const tables = await provider.listTables(dbName);
    console.log('   Found tables:', tables.length);
    tables.slice(0, 5).forEach(t => {
      console.log(`   - ${t.name} (${t.row_count || 0} rows)`);
    });
    console.log();

    console.log(`4. Describing table from ${dbName} database...`);
    try {
      if (tables.length > 0) {
        const schema = await provider.describeTable(dbName, tables[0].name);
        console.log('   Table:', schema.table);
        console.log('   Columns:', schema.columns.length);
        schema.columns.slice(0, 5).forEach(col => {
          console.log(`   - ${col.name} (${col.data_type})`);
        });
        console.log('   Primary Keys:', schema.primary_keys);
      } else {
        console.log('   No tables found');
      }
    } catch (e: any) {
      console.log('   Note:', e.message);
    }
    console.log();

    console.log('5. Executing query (SELECT 1 + 1 AS result)...');
    const result = await provider.executeQuery('SELECT 1 + 1 AS result');
    console.log('   Result:', result.rows);
    console.log();

    console.log('6. Executing query (SELECT VERSION())...');
    const version = await provider.executeQuery('SELECT VERSION() AS version');
    console.log('   OceanBase Version:', version.rows);
    console.log();

    console.log('=== All tests passed! ===');

  } catch (error: any) {
    console.error('Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await provider.close();
  }
}

test();
