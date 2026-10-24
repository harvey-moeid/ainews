import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../worker/index.js";

export function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of [
    "0000_newsroom.sql",
    "0001_overlay2.sql",
    "0002_social_sources.sql",
  ])
    sqlite.exec(
      readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8"),
    );
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return statement.get(...args) || null;
        },
        async all() {
          return { results: statement.all(...args) };
        },
        execute() {
          return { meta: { changes: Number(statement.run(...args).changes) } };
        },
        async run() {
          return this.execute();
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = statements.map((s) => s.execute());
        sqlite.exec("COMMIT");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const objects = new Map();
  return {
    sqlite,
    env: {
      DB,
      DEV_AUTH: "1",
      AI_KEY_ENCRYPTION_SECRET: "test-master-key-only-not-a-real-secret-123",
      BUCKET: {
        async put(key, value) {
          objects.set(key, value);
        },
        async get(key) {
          return objects.has(key)
            ? { json: async () => JSON.parse(objects.get(key)) }
            : null;
        },
      },
    },
  };
}
export const request = async (env, path, value, method = "POST") => {
  const response = await worker.fetch(
    new Request("https://ainews.test/api" + path, {
      method,
      headers: {
        Origin: "https://ainews.test",
        "Content-Type": "application/json",
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(value) }),
    }),
    env,
  );
  return { status: response.status, data: await response.json() };
};
