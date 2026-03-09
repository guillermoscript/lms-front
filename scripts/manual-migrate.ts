import pg from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = "postgresql://postgres.tcqqnjfwmbfwcyhafbbt:R808Z4QSPxGet1mC@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

async function migrate() {
    const client = new pg.Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to database');

        // Get applied migrations
        const { rows } = await client.query('SELECT version FROM supabase_migrations.schema_migrations');
        const applied = new Set(rows.map(r => r.version));

        const migrationsDir = './supabase/migrations';
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const version = file.split('_')[0];
            if (applied.has(version)) {
                console.log(`Skipping applied migration: ${file}`);
                continue;
            }

            console.log(`Applying migration: ${file}`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

            await client.query('BEGIN');
            try {
                // We use the simple query protocol by passing just a string to client.query
                // which helps avoid prepared statement issues in transaction mode
                await client.query(sql);
                await client.query('INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1)', [version]);
                await client.query('COMMIT');
                console.log(`Successfully applied ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.log(`Failed to apply ${file}`);
                throw err;
            }
        }

        console.log('All migrations completed successfully');
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrate();
