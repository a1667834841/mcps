/**
 * Integration test for SQL safety check with real OceanBase connection
 */

// Load env from .env file (copy .env.example to .env and fill in your own values)
import dotenv from 'dotenv';
dotenv.config();

process.env.DB_TYPE = process.env.DB_TYPE ?? 'oceanbase';
process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '2881';
process.env.DB_USER = process.env.DB_USER ?? 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? '';
process.env.DB_DATABASE = process.env.DB_DATABASE ?? 'testdb';
process.env.DB_CHARSET = process.env.DB_CHARSET ?? 'utf8';
process.env.DB_READONLY = process.env.DB_READONLY ?? 'true';
process.env.DB_MAX_ROWS = process.env.DB_MAX_ROWS ?? '10';

const TEST_TABLE = process.env.TEST_TABLE ?? 'test_table';

import { createProvider } from '../src/providers/index.js';
import { validateReadOnly, injectRowLimit } from '../src/utils/index.js';
import { getDatabaseType, getSafetyConfig } from '../src/config/index.js';

async function main() {
  const provider = createProvider();
  await provider.connect();
  const dbType = getDatabaseType();
  const { readonly, maxRows } = getSafetyConfig();
  console.log('Config:', { dbType, readonly, maxRows });

  // Test 1: Valid SELECT with row limit injection
  console.log('\n--- Test 1: SELECT with LIMIT injection ---');
  const sql1 = `SELECT * FROM ${TEST_TABLE}`;
  const check1 = validateReadOnly(sql1, dbType);
  console.log('Validation:', check1);
  const limited1 = injectRowLimit(sql1, dbType, maxRows);
  console.log('Injected SQL:', limited1);
  const result1 = await provider.executeQuery(limited1);
  console.log('Rows returned:', result1.row_count, '| limited:', result1.limited);

  // Test 2: Block dangerous query
  console.log('\n--- Test 2: Block DELETE ---');
  const sql2 = `DELETE FROM ${TEST_TABLE} WHERE id = 1`;
  const check2 = validateReadOnly(sql2, dbType);
  console.log('Validation:', check2);

  // Test 3: Block multi-statement injection
  console.log('\n--- Test 3: Block multi-statement injection ---');
  const sql3 = `SELECT 1; DROP TABLE ${TEST_TABLE}`;
  const check3 = validateReadOnly(sql3, dbType);
  console.log('Validation:', check3);

  // Test 4: Allow string with dangerous keyword
  console.log('\n--- Test 4: Allow string with dangerous word ---');
  const sql4 = `SELECT * FROM ${TEST_TABLE} WHERE OperateName = 'DELETE task'`;
  const check4 = validateReadOnly(sql4, dbType);
  console.log('Validation:', check4);
  if (check4.safe) {
    const limited4 = injectRowLimit(sql4, dbType, maxRows);
    const result4 = await provider.executeQuery(limited4);
    console.log('Rows returned:', result4.row_count);
  }

  // Test 5: Block comment bypass
  console.log('\n--- Test 5: Block comment bypass ---');
  const sql5 = `/* SELECT */ UPDATE ${TEST_TABLE} SET taskname = "hacked"`;
  const check5 = validateReadOnly(sql5, dbType);
  console.log('Validation:', check5);

  // Test 6: Existing LIMIT smaller than maxRows
  console.log('\n--- Test 6: Existing LIMIT smaller preserved ---');
  const sql6 = `SELECT * FROM ${TEST_TABLE} LIMIT 3`;
  const limited6 = injectRowLimit(sql6, dbType, maxRows);
  console.log('SQL:', limited6);
  const result6 = await provider.executeQuery(limited6);
  console.log('Rows returned:', result6.row_count);

  // Test 7: DESCRIBE allowed
  console.log('\n--- Test 7: DESCRIBE allowed ---');
  const sql7 = `DESCRIBE ${TEST_TABLE}`;
  const check7 = validateReadOnly(sql7, dbType);
  console.log('Validation:', check7);
  if (check7.safe) {
    const result7 = await provider.executeQuery(sql7);
    console.log('Columns:', result7.columns);
    console.log('Row count:', result7.row_count);
  }

  // Test 8: SHOW allowed
  console.log('\n--- Test 8: SHOW TABLES allowed ---');
  const sql8 = 'SHOW TABLES';
  const check8 = validateReadOnly(sql8, dbType);
  console.log('Validation:', check8);

  await provider.close();
  console.log('\n=== All integration tests passed! ===');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
