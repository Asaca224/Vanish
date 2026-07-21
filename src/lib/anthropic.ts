import { z } from "zod";
import { env } from "@/env";

/**
 * Minimal Anthropic Messages API client for the discovery pipeline (§8, §9).
 *
 * DATA MINIMIZATION (§2.1): these calls only ever touch PUBLIC broker pages and
 * search queries — never any user PII. That invariant is enforced by the call
 * sites (discovery only), not here.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

export function aiEnabled(): boolean {
  return env().AI_ASSIST_ENABLED === true && Boolean(env().ANTHROPIC_API_KEY);
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: string; [k: string]: unknown };

async function callMessages(body: Record<string, unknown>): Promise<ContentBlock[]> {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: ContentBlock[] };
  return json.content ?? [];
}

function concatText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// Pull the first JSON value (object or array) out of a model response.
function extractJson(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in model response");
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("Unbalanced JSON in model response");
}

/**
 * Stage 1 (§8.1): use web search to surface candidate aggregator domains.
 * Returns normalized bare domains. Uses the Anthropic server-side web_search
 * tool so we stay single-vendor.
 */
export async function aiWebSearchDomains(queries: string[]): Promise<string[]> {
  if (!aiEnabled()) return [];
  const blocks = await callMessages({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content:
          `Use web search to find data-broker / people-search aggregator websites ` +
          `matching these themes: ${queries.join("; ")}. ` +
          `Return ONLY a JSON array of bare domains (e.g. ["example.com"]) for sites ` +
          `that look like people-search or data-broker services. No prose.`,
      },
    ],
  });
  try {
    const parsed = z.array(z.string()).parse(extractJson(concatText(blocks)));
    return parsed.map(normalizeDomain).filter(Boolean);
  } catch {
    return [];
  }
}

// Strict schema for the analysis output (§8.4).
export const aggregatorAnalysis = z.object({
  is_data_aggregator: z.boolean(),
  confidence: z.number().min(0).max(1),
  name: z.string().min(1),
  opt_out_url: z.string().nullable().optional(),
  removal_method: z.enum(["drop", "email", "web_form", "postal", "manual_only"]),
  opt_out_email: z.string().nullable().optional(),
  requires_captcha: z.boolean().default(false),
  requires_id: z.boolean().default(false),
  notes: z.string().nullable().optional(),
  evidence_quotes: z
    .array(z.object({ url: z.string(), snippet: z.string() }))
    .default([]),
});
export type AggregatorAnalysis = z.infer<typeof aggregatorAnalysis>;

/**
 * Stage 4 (§8.4): read fetched PUBLIC pages and emit strict structured JSON.
 * Non-conforming output is discarded (returns null).
 */
export async function aiAnalyzeAggregator(input: {
  domain: string;
  pages: { url: string; text: string }[];
}): Promise<AggregatorAnalysis | null> {
  if (!aiEnabled()) return null;
  const pageDump = input.pages
    .map((p) => `URL: ${p.url}\n${p.text.slice(0, 6000)}`)
    .join("\n\n---\n\n");

  const blocks = await callMessages({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system:
      "You classify websites as data-broker/people-search aggregators and extract " +
      "their opt-out process from the provided public pages. Respond with a SINGLE " +
      "JSON object only, matching the requested schema. Do not invent an opt-out URL " +
      "or email — use null if not clearly present in the pages.",
    messages: [
      {
        role: "user",
        content:
          `Domain: ${input.domain}\n\nPublic pages:\n${pageDump}\n\n` +
          `Return JSON with keys: is_data_aggregator (bool), confidence (0-1), ` +
          `name, opt_out_url (or null), removal_method (drop|email|web_form|postal|manual_only), ` +
          `opt_out_email (or null), requires_captcha (bool), requires_id (bool), ` +
          `notes, evidence_quotes ([{url, snippet}] quoting the opt-out instructions).`,
      },
    ],
  });

  try {
    return aggregatorAnalysis.parse(extractJson(concatText(blocks)));
  } catch {
    return null; // discard non-conforming responses (§8.4)
  }
}

export function normalizeDomain(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : "";
}
