// File: src/infrastructure/db/migrations.ts
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { DatabaseClient } from "./client";

type Migration = Readonly<{ name: string; sql: string; checksum: string }>;

export async function discoverMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(path.join(directory, name), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

export async function applyMigrations(database: DatabaseClient, directory: string): Promise<readonly string[]> {
  await database.sql`create table if not exists _olt_migrations (
    name text primary key, digest text not null, applied_at timestamptz not null default now()
  )`;
  const applied = new Map((await database.sql<{ name: string; digest: string }[]>`
    select name, digest from _olt_migrations`).map((row) => [row.name, row.digest]));
  const completed: string[] = [];
  for (const migration of await discoverMigrations(directory)) {
    if (applied.has(migration.name)) {
      if (applied.get(migration.name) !== migration.checksum) {
        throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${migration.name}`);
      }
      continue;
    }
    await database.sql.begin(async (sql) => {
      await sql.unsafe(migration.sql);
      await sql`insert into _olt_migrations (name, digest) values (${migration.name}, ${migration.checksum})`;
    });
    completed.push(migration.name);
  }
  return completed;
}
