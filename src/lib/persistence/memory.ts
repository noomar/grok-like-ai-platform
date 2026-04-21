import type { StorageAdapter, StorageSnapshot } from "./types";

/**
 * No-op adapter. State lives only in `store.ts`'s in-memory Maps.
 * Used on Vercel and any host where `AURORA_STORAGE` is unset.
 */
export function createMemoryAdapter(): StorageAdapter {
  return {
    kind: "memory",
    async hydrate() {
      return null;
    },
    async putJob() {
      /* noop */
    },
    async putRequest() {
      /* noop */
    },
    async incrementVerifications() {
      /* noop */
    },
    async export() {
      return { jobs: [], userRequests: [], verifications: 0 } satisfies StorageSnapshot;
    },
    async import() {
      /* noop */
    },
    describe() {
      return "memory (ephemeral)";
    },
  };
}
