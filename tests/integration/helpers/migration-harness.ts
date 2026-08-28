import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type postgres from "postgres";

const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

export interface MigrationFile {
  digest: string;
  name: string;
  sql: string;
}

export function defaultMigrationDirectory(): string {
  return resolve(process.cwd(), "db/migrations");
}

export async function discoverMigrations(
  directory = defaultMigrationDirectory(),
): Promise<MigrationFile[]> {
  let names: string[];

  try {
    names = await readdir(directory);
  } catch (error: unknown) {
    if (isMissingDirectory(error)) {
      return [];
    }
    throw error;
  }

  return Promise.all(
    names
      .filter((name) => MIGRATION_FILE_PATTERN.test(name))
      .sort()
      .map(async (name) => {
        const sql = await readFile(resolve(directory, name), "utf8");
        return {
          digest: createHash("sha256").update(sql).digest("hex"),
          name,
          sql,
        };
      }),
  );
}

export async function applyMigrations(
  sql: postgres.Sql,
  migrations: readonly MigrationFile[],
): Promise<string[]> {
  await createBookkeepingTable(sql);
  const applied: string[] = [];

  for (const migration of migrations) {
    const prior = await sql<{ digest: string }[]>`
      select digest
      from _olt_migrations
      where name = ${migration.name}
    `;

    if (prior[0]) {
      assertDigestMatches(migration, prior[0].digest);
      continue;
    }

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration.sql);
      await transaction`
        insert into _olt_migrations (name, digest)
        values (${migration.name}, ${migration.digest})
      `;
    });
    applied.push(migration.name);
  }

  return applied;
}

async function createBookkeepingTable(sql: postgres.Sql): Promise<void> {
  await sql`
    create table if not exists _olt_migrations (
      name text primary key,
      digest text not null,
      applied_at timestamptz not null default now()
    )
  `;
}

function assertDigestMatches(
  migration: MigrationFile,
  appliedDigest: string,
): void {
  if (migration.digest !== appliedDigest) {
    throw new Error(
      `Migration ${migration.name} changed after it was applied; create a new migration instead.`,
    );
  }
}

function isMissingDirectory(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
