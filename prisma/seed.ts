/**
 * Seed: loads the curated broker list so a fresh DB has a working registry
 * without the CA CSV. For the full 600+ CA-registered set, run the importer
 * (`npm run brokers:import`) after downloading the CA registry CSV.
 */
import { execSync } from "node:child_process";

console.log("Seeding broker registry via the importer…");
execSync("tsx scripts/import-brokers.ts", { stdio: "inherit" });
