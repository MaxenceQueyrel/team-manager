import { execFileSync } from "node:child_process";
import path from "node:path";
import { test as setup } from "@playwright/test";
import { MANAGER_EMAIL, MANAGER_PASSWORD } from "./helpers";

const BACKEND_DIR = path.resolve(__dirname, "..", "..", "backend");

// Every other spec logs in as this manager account (creating roles/projects, running
// optimizations, ...). Registration only ever grants "employee", so promote it straight
// in Postgres — the same escape hatch the real bootstrap flow uses. Runs once per suite;
// registration 409s harmlessly on repeat runs since the account already exists from before.
setup("ensure a manager account exists", async ({ request }) => {
  await request.post("/api/v1/auth/register", {
    data: { email: MANAGER_EMAIL, password: MANAGER_PASSWORD },
  });

  execFileSync("uv", ["run", "python", "scripts/bootstrap_manager.py", MANAGER_EMAIL], {
    cwd: BACKEND_DIR,
  });
});
