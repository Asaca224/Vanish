import type { DiscoveryTrigger, PrismaClient } from "@prisma/client";
import {
  aiAnalyzeAggregator,
  aiEnabled,
  aiWebSearchDomains,
  normalizeDomain,
} from "@/lib/anthropic";
import { isCoveredByDrop } from "@/lib/channel-router";

/**
 * Aggregator discovery pipeline (spec §8). Serves both the daily cron and the
 * admin "Search for new aggregators" button — the button just triggers a run.
 *
 * Stages: search → filter/dedupe → fetch public pages → AI analyze → propose
 * (status=proposed, admin-gated) → log. NO user PII ever enters this pipeline;
 * it touches only public pages (§2.1, §8.4).
 */

// Rotating query set (§8.1). A run samples a few.
const QUERY_POOL = [
  "people search site",
  "background check lookup",
  "public records search",
  "data broker opt out",
  "find people by name address",
  "reverse phone lookup people finder",
];

const PROPOSE_CONFIDENCE_THRESHOLD = 0.6;
const MAX_CANDIDATES_PER_RUN = 12;
const FETCH_TIMEOUT_MS = 8000;

function sample<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "VanishDiscoveryBot/1.0 (+opt-out research)" },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = await res.text();
    return htmlToText(html);
  } catch {
    return null;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Find privacy-policy / opt-out links in homepage HTML to follow (§8.3).
function findRelevantLinks(homepageHtml: string, domain: string): string[] {
  const links = new Set<string>();
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(homepageHtml)) && links.size < 6) {
    const href = m[1];
    if (/privacy|opt.?out|remove|suppress|do.?not.?sell|ccpa/i.test(href)) {
      try {
        const url = new URL(href, `https://${domain}`);
        if (url.hostname.endsWith(domain)) links.add(url.toString());
      } catch {
        /* skip malformed */
      }
    }
  }
  return [...links];
}

export type DiscoveryResult = {
  runId: string;
  candidatesFound: number;
  proposed: number;
  duplicates: number;
  rejected: number;
  aiEnabled: boolean;
};

export async function runDiscovery(
  prisma: PrismaClient,
  trigger: DiscoveryTrigger,
): Promise<DiscoveryResult> {
  const run = await prisma.discoveryRun.create({ data: { trigger } });
  const queries = sample(QUERY_POOL, 3);
  let candidatesFound = 0;
  let proposed = 0;
  let duplicates = 0;
  let rejected = 0;

  try {
    // Stage 1: search.
    const domains = (await aiWebSearchDomains(queries)).slice(
      0,
      MAX_CANDIDATES_PER_RUN,
    );
    candidatesFound = domains.length;

    for (const raw of domains) {
      const domain = normalizeDomain(raw);
      if (!domain) continue;

      // Stage 2: filter/dedupe against live registry + candidate history.
      const [existingBroker, existingCandidate] = await Promise.all([
        prisma.broker.findUnique({ where: { domain } }),
        prisma.discoveryCandidate.findUnique({ where: { domain } }),
      ]);
      if (existingBroker || existingCandidate) {
        duplicates++;
        await prisma.discoveryCandidate.upsert({
          where: { domain },
          create: { domain, disposition: "duplicate", runId: run.id },
          update: { lastSeen: new Date(), runId: run.id },
        });
        continue;
      }

      // Stage 3: fetch homepage + privacy/opt-out pages.
      const homepageHtml = await fetch(`https://${domain}`, {
        headers: { "user-agent": "VanishDiscoveryBot/1.0 (+opt-out research)" },
      })
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => "");
      const pages: { url: string; text: string }[] = [];
      if (homepageHtml) {
        pages.push({ url: `https://${domain}`, text: htmlToText(homepageHtml) });
        for (const link of findRelevantLinks(homepageHtml, domain)) {
          const text = await fetchText(link);
          if (text) pages.push({ url: link, text });
        }
      }

      // Stage 4: AI analysis → strict JSON.
      const analysis =
        pages.length > 0 ? await aiAnalyzeAggregator({ domain, pages }) : null;

      // Stage 5: propose or reject.
      const shouldPropose =
        analysis?.is_data_aggregator &&
        analysis.confidence >= PROPOSE_CONFIDENCE_THRESHOLD;

      if (shouldPropose && analysis) {
        await prisma.$transaction([
          prisma.broker.create({
            data: {
              name: analysis.name,
              domain,
              optOutUrl: analysis.opt_out_url ?? null,
              removalMethod: analysis.removal_method,
              optOutEmail: analysis.opt_out_email ?? null,
              requiresCaptcha: analysis.requires_captcha,
              requiresId: analysis.requires_id,
              caRegistered: false,
              coveredByDrop: isCoveredByDrop({
                caRegistered: false,
                removalMethod: analysis.removal_method,
              }),
              status: "proposed",
              source: "discovery",
              discoveryConfidence: analysis.confidence,
              evidence: analysis.evidence_quotes,
              notes: analysis.notes ?? null,
            },
          }),
          prisma.discoveryCandidate.create({
            data: { domain, disposition: "proposed", runId: run.id },
          }),
        ]);
        proposed++;
      } else {
        rejected++;
        await prisma.discoveryCandidate.create({
          data: { domain, disposition: "rejected", runId: run.id },
        });
      }
    }

    const stats = { queries, candidatesFound, proposed, duplicates, rejected };
    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), stats },
    });
    return { runId: run.id, candidatesFound, proposed, duplicates, rejected, aiEnabled: aiEnabled() };
  } catch (err) {
    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
        stats: { queries, candidatesFound, proposed, duplicates, rejected },
      },
    });
    throw err;
  }
}
