import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

// Try direct database connection
const DATABASE_URL = `postgresql://postgres:Medinexus009@db.vcjvdqhgvdlrzmnymkpf.supabase.co:5432/postgres`;

async function run() {
  console.log('Connecting to Supabase PostgreSQL (direct connection)...');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Test connection
    const res = await pool.query('SELECT now()');
    console.log('Connected! Server time:', res.rows[0].now);

    // Read the full schema SQL
    const sqlPath = path.join(__dirname, 'src', 'db', 'full_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Running full schema migration...');
    await pool.query(sql);
    console.log('✅ All tables, indexes, RLS policies, and functions created successfully!');

    // Verify tables exist
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('\n📋 Tables in public schema:');
    tableCheck.rows.forEach((row: any) => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    if (err.position) {
      console.error('Error at SQL position:', err.position);
    }
  } finally {
    await pool.end();
  }
}

run();
