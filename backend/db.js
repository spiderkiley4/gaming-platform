import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DB_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 10000, // How long to wait for a connection
  maxUses: 7500, // Close & replace a connection after it has been used this many times
  allowExitOnIdle: false, // Don't allow the pool to destroy idle clients while we have active connections
  keepAlive: true, // Use TCP keepalive
  keepAliveInitialDelayMillis: 10000 // Start keepalive probes after 10 seconds
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Handle connection errors
pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.error('Database client error:', err);
  });
});

export default pool;
