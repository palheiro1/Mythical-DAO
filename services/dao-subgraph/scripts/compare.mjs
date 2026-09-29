// Reuse the portal's viem installation and read-only comparison implementation.
const { main } = await import('../../dao-portal/scripts/compare-subgraph.mjs');
await main();
