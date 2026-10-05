import pg from 'pg';
import { createApplication } from './http.mjs';
const port = Number(process.env.PORT ?? 5173),
  origin = process.env.APP_ORIGIN ?? `http://localhost:${port}`;
const address = new URL(origin);
if (address.origin !== origin || !['http:', 'https:'].includes(address.protocol))
  throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path or trailing slash.');
if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN)
  throw new Error('Set APP_ORIGIN to the public HTTPS origin in production.');
if (
  process.env.NODE_ENV === 'production' &&
  address.protocol !== 'https:' &&
  !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)
)
  throw new Error('Public production deployments require an HTTPS APP_ORIGIN.');
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      statement_timeout: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;
const app = createApplication({ pool, origin });
app.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(`OpenChronology: ${origin} (${pool ? 'PostgreSQL' : 'browser storage'})`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    app.close(async () => {
      await pool?.end();
      process.exit(0);
    }),
  );
