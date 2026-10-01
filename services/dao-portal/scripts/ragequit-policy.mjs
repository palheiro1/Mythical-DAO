import { isAddress, zeroAddress } from "viem";

// Approved Polygon identities, independent of an editable deployment manifest.
export const fixedAddresses = Object.freeze({
  governor: "0x7b9e327748462f1038c9d081c98d189b22c60a27",
  treasury: "0x7b9e327748462f1038c9d081c98d189b22c60a27",
  mana: "0x2cacca1266653bb090d3fb511456ebca33150562",
  gem: "0x5f790ffa0695967a2d711872ecb4c7553e24794d",
  weth: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
  usdcNative: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  usdcBridged: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
});
export function assertModuleAddress(module, manifest) {
  if (
    !isAddress(module) ||
    module.toLowerCase() === zeroAddress ||
    Object.entries(manifest.contracts).some(
      ([role, e]) =>
        e.address.toLowerCase() === module.toLowerCase() &&
        role !== "ragequitModule",
    )
  )
    throw Error(
      "Module must be a distinct nonzero contract address, never an existing token or treasury",
    );
}
export function assertRagequitManifest(m) {
  if (
    m.schemaVersion !== 2 ||
    m.chainId !== 137 ||
    m.architecture !== "existing-governor"
  )
    throw Error("Expected the approved existing Polygon Governor architecture");
  for (const [role, address] of Object.entries(fixedAddresses))
    if (m.contracts?.[role]?.address?.toLowerCase() !== address)
      throw Error(`Unexpected approved address: ${role}`);
  if (
    m.contracts.usdc &&
    m.contracts.usdc.address.toLowerCase() !== fixedAddresses.usdcBridged
  )
    throw Error("Historical usdc must remain USDC.e");
  if (m.contracts.ragequitModule)
    assertModuleAddress(m.contracts.ragequitModule.address, m);
}
export function assertIndependentProviders(urls) {
  if (urls.some((u) => !u))
    throw Error("Two independent HTTPS RPC providers are required");
  const parsed = urls.map((u) => new URL(u));
  if (
    parsed.some((u) => u.protocol !== "https:") ||
    parsed[0].hostname === parsed[1].hostname
  )
    throw Error("Two independent HTTPS RPC providers are required");
}

/** Verify every copy of each immutable, not just getter results or masked code. */
export function assertModuleRuntime(code, artifact, addresses) {
  const template = artifact.deployedBytecode.object.toLowerCase();
  if (!code || code.length !== template.length)
    throw Error("Module runtime length mismatch");
  const allowed = new Set(
    addresses.map((a) => a.toLowerCase().slice(2).padStart(64, "0")),
  );
  const groups = Object.values(artifact.deployedBytecode.immutableReferences);
  if (groups.length !== 5 || allowed.size !== 5)
    throw Error("Unexpected immutable layout");
  let masked = code.toLowerCase();
  const seen = new Set();
  for (const refs of groups) {
    let value;
    for (const { start, length } of refs) {
      if (
        length !== 32 ||
        !Number.isSafeInteger(start) ||
        start < 0 ||
        2 + (start + length) * 2 > code.length
      )
        throw Error("Invalid immutable offset");
      const copy = code
        .slice(2 + start * 2, 2 + (start + length) * 2)
        .toLowerCase();
      if (!allowed.has(copy) || (value && value !== copy))
        throw Error("Inconsistent module immutable copies");
      value = copy;
      masked =
        masked.slice(0, 2 + start * 2) +
        template.slice(2 + start * 2, 2 + (start + length) * 2) +
        masked.slice(2 + (start + length) * 2);
    }
    if (!value || seen.has(value))
      throw Error("Duplicate or missing immutable identity");
    seen.add(value);
  }
  if (masked !== template)
    throw Error("Module runtime differs from the compiled immutable contract");
}

/** Instantiate each named immutable using the compiler AST, never guessed AST IDs. */
export function instantiateModuleRuntime(artifact, addresses) {
  const names = ["treasury", "mana", "gem", "weth", "usdc"];
  const contract = artifact.ast?.nodes.find(
    (n) =>
      n.nodeType === "ContractDefinition" &&
      n.name === "MythicalRagequitModule",
  );
  const declarations = contract?.nodes.filter(
    (n) => n.mutability === "immutable",
  );
  const refs = artifact.deployedBytecode.immutableReferences;
  if (
    declarations?.length !== 5 ||
    Object.keys(refs).length !== 5 ||
    addresses.length !== 5
  )
    throw Error(
      "Expected five named immutables and compiler AST; rebuild with ast enabled",
    );
  let code = artifact.deployedBytecode.object;
  const occupied = new Set();
  names.forEach((name, i) => {
    const declaration = declarations.find((n) => n.name === name);
    const positions = refs[declaration?.id];
    if (!positions?.length || !isAddress(addresses[i]))
      throw Error("Invalid named immutable");
    const value = addresses[i].toLowerCase().slice(2).padStart(64, "0");
    for (const { start, length } of positions) {
      if (
        length !== 32 ||
        !Number.isSafeInteger(start) ||
        start < 0 ||
        2 + (start + length) * 2 > code.length
      )
        throw Error("Invalid immutable offset");
      for (let j = start; j < start + length; j++) {
        if (occupied.has(j)) throw Error("Overlapping immutable offsets");
        occupied.add(j);
      }
      code =
        code.slice(0, 2 + start * 2) +
        value +
        code.slice(2 + (start + length) * 2);
    }
  });
  assertModuleRuntime(code, artifact, addresses);
  return code;
}
