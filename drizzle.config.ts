const drizzleConfig = {
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost/one_last_turn",
  },
  dialect: "postgresql",
  out: "./db/migrations",
  schema: "./db/schema/index.ts",
  strict: true,
  verbose: true,
} as const;

export default drizzleConfig;

