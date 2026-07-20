/**
 * Broker-registry importer (spec §11, Phase 0).
 *
 * Ingests two sources into the `Broker` table, upserting by domain:
 *   1. The authoritative CA data broker registry (a downloadable CSV from
 *      cppa.ca.gov). Every row → caRegistered = true.
 *   2. A curated top-N people-search list (data/curated-brokers.json) with
 *      hand-verified routing metadata (removalMethod, captcha/id flags, etc).
 *
 * The curated list wins for routing metadata where present; the CA registry is
 * authoritative for the caRegistered flag. `coveredByDrop` is derived.
 *
 * CA registry CSV: place it at data/ca-data-broker-registry.csv. Expected
 * columns (case-insensitive, best-effort mapping): "Data Broker Name" /
 * "Business Name", "Website" / "URL", "Email". Download the current file from
 * the CPPA data broker registry page and drop it in — the format is not
 * guaranteed stable, so the parser is defensive.
 *
 * Run: npm run brokers:import
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type RemovalMethod } from "@prisma/client";

const prisma = new PrismaClient();

const DATA_DIR = join(process.cwd(), "data");
const CA_CSV = join(DATA_DIR, "ca-data-broker-registry.csv");
const CURATED = join(DATA_DIR, "curated-brokers.json");

type BrokerInput = {
  name: string;
  domain: string;
  optOutUrl?: string | null;
  removalMethod: RemovalMethod;
  requiresCaptcha?: boolean;
  requiresId?: boolean;
  confirmationEmailFrom?: string | null;
  optOutEmail?: string | null;
  recheckDays?: number;
  caRegistered?: boolean;
  adapterKey?: string | null;
  notes?: string | null;
};

// Normalize a URL/website field down to a bare domain for de-duping.
function toDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0];
  return s;
}

// A minimal, dependency-free CSV parser that handles quoted fields.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((h) => h.includes(k));
    if (found && row[found]) return row[found];
  }
  return "";
}

function loadCaRegistry(): BrokerInput[] {
  if (!existsSync(CA_CSV)) {
    console.warn(
      `⚠  CA registry CSV not found at ${CA_CSV}. Skipping. ` +
        `Download the current CA data broker registry and place it there to seed the 600+ brokers.`,
    );
    return [];
  }
  const rows = parseCsv(readFileSync(CA_CSV, "utf8"));
  const brokers: BrokerInput[] = [];
  for (const row of rows) {
    const name = pick(row, ["broker name", "business name", "name"]);
    const website = pick(row, ["website", "url", "web"]);
    const email = pick(row, ["email"]);
    const domain = toDomain(website || name.replace(/\s+/g, ""));
    if (!name || !domain) continue;
    brokers.push({
      name,
      domain,
      optOutUrl: website || null,
      // CA registry doesn't declare a mechanism → default to email if an email
      // is present, else manual_only. DROP covers these regardless.
      removalMethod: email ? "email" : "manual_only",
      optOutEmail: email || null,
      caRegistered: true,
      recheckDays: 45,
    });
  }
  console.log(`✓ Parsed ${brokers.length} brokers from CA registry CSV.`);
  return brokers;
}

function loadCurated(): BrokerInput[] {
  if (!existsSync(CURATED)) return [];
  const json = JSON.parse(readFileSync(CURATED, "utf8"));
  const list = (json.brokers ?? []) as BrokerInput[];
  console.log(`✓ Loaded ${list.length} curated brokers.`);
  return list;
}

// Merge: curated metadata takes precedence; CA flag OR-ed in.
function merge(ca: BrokerInput[], curated: BrokerInput[]): BrokerInput[] {
  const byDomain = new Map<string, BrokerInput>();
  for (const b of ca) {
    const domain = toDomain(b.domain);
    if (domain) byDomain.set(domain, { ...b, domain });
  }
  for (const b of curated) {
    const domain = toDomain(b.domain);
    if (!domain) continue;
    const existing = byDomain.get(domain);
    byDomain.set(domain, {
      ...existing,
      ...b,
      domain,
      caRegistered: Boolean(existing?.caRegistered) || Boolean(b.caRegistered),
    });
  }
  return [...byDomain.values()];
}

// coveredByDrop derivation (mirrors src/lib/channel-router.isCoveredByDrop).
function coveredByDrop(b: BrokerInput): boolean {
  return Boolean(b.caRegistered) && b.removalMethod !== "manual_only";
}

async function main() {
  const merged = merge(loadCaRegistry(), loadCurated());
  if (merged.length === 0) {
    console.error(
      "No brokers to import. Add data/curated-brokers.json and/or the CA registry CSV.",
    );
    process.exit(1);
  }

  let created = 0;
  let updated = 0;
  for (const b of merged) {
    const data = {
      name: b.name,
      optOutUrl: b.optOutUrl ?? null,
      removalMethod: b.removalMethod,
      requiresCaptcha: b.requiresCaptcha ?? false,
      requiresId: b.requiresId ?? false,
      confirmationEmailFrom: b.confirmationEmailFrom ?? null,
      optOutEmail: b.optOutEmail ?? null,
      recheckDays: b.recheckDays ?? 30,
      caRegistered: b.caRegistered ?? false,
      coveredByDrop: coveredByDrop(b),
      adapterKey: b.adapterKey ?? null,
      notes: b.notes ?? null,
    };
    const existing = await prisma.broker.findUnique({
      where: { domain: b.domain },
    });
    await prisma.broker.upsert({
      where: { domain: b.domain },
      create: { domain: b.domain, ...data },
      update: data,
    });
    existing ? updated++ : created++;
  }

  const total = await prisma.broker.count();
  const ca = await prisma.broker.count({ where: { caRegistered: true } });
  console.log(
    `\n✓ Import complete: ${created} created, ${updated} updated. ` +
      `Registry now has ${total} brokers (${ca} CA-registered).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
