import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  var galeenPool: Pool | undefined;
}

function connectionUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is missing");
  return url;
}

export function database(): Pool {
  if (!globalThis.galeenPool) {
    globalThis.galeenPool = new Pool({
      connectionString: connectionUrl(),
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      application_name: "galeen-admin"
    });
  }
  return globalThis.galeenPool;
}

export async function rows<T extends QueryResultRow = QueryResultRow>(
  statement: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await database().query<T>(statement, params);
  return result.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  statement: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await rows<T>(statement, params);
  return result[0] ?? null;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    try {
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }
}
