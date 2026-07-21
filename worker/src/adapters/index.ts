import type { BrokerAdapter } from "./types.js";
import { genericAdapter } from "./reference.js";

// Register per-site adapters here as they're built (keyed by Broker.adapterKey).
const REGISTRY: Record<string, BrokerAdapter> = {
  generic: genericAdapter,
  "reference-people-search": genericAdapter,
};

export function adapterFor(key: string | null | undefined): BrokerAdapter {
  return (key && REGISTRY[key]) || genericAdapter;
}
