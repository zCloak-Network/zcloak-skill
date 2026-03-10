/**
 * Shared helpers for parsing human-readable AI IDs (".ai") and Agent IDs (".agent")
 * into the IDRecord structure expected by the registry canister.
 */

/** ID record type matching the registry canister's user_profile_get_by_id parameter */
export type IDRecord = {
  id: string;
  index: [] | [bigint];
  domain: [] | [{ AI: null } | { ORG: null } | { AGENT: null }];
};

/**
 * Detect whether the input looks like a human-readable AI/Agent ID rather than a raw principal.
 *
 * Readable IDs end with either:
 *   - ".ai"    → Owner AI ID (human user)
 *   - ".agent" → Agent AI ID
 *
 * ICP principals only contain alphanumeric characters and hyphens, never a dot.
 */
export function isReadableId(input: string): boolean {
  return input.endsWith('.ai') || input.endsWith('.agent');
}

/**
 * General parser for human-readable AI IDs (".ai") and Agent IDs (".agent").
 *
 * Both share the same logical structure: `id_string[#index].ai|.agent`
 *
 * Supported formats:
 *   - With discriminator : "alice#8730.ai"      → { id: "alice", index: [8730n], domain: [{ AI: null }] }
 *   - Vanity (no #)      : "alice.ai"          → { id: "alice", index: [],      domain: [{ AI: null }] }
 *   - Agent with index   : "runner#8939.agent" → { id: "runner", index: [8939n], domain: [{ AGENT: null }] }
 *   - Agent vanity       : "runner.agent"      → { id: "runner", index: [],      domain: [{ AGENT: null }] }
 *
 * @param readableId - String ending with ".ai" or ".agent"
 * @returns Structured ID record ready to pass to user_profile_get_by_id
 * @throws If the string does not end with a supported suffix or has an invalid format
 */
export function generalParseAiIdToRecord(readableId: string): IDRecord {
  const suffixConfig = [
    { suffix: '.ai', domain: { AI: null } as const },
    { suffix: '.agent', domain: { AGENT: null } as const },
  ];

  const matched = suffixConfig.find(({ suffix }) => readableId.endsWith(suffix));
  if (!matched) {
    throw new Error(
      `Expected a readable ID ending with ".ai" or ".agent", got: "${readableId}"`,
    );
  }

  const { suffix, domain } = matched;

  // Strip the suffix to get the name part (e.g. "alice#8730" or "alice")
  const namePart = readableId.slice(0, -suffix.length);

  const hashIndex = namePart.indexOf('#');

  if (hashIndex === -1) {
    // Vanity name — no discriminator (e.g. "alice.ai" / "runner.agent")
    return {
      id: namePart,
      index: [],          // Candid opt — empty = null
      domain: [domain],
    };
  }

  // Indexed name (e.g. "alice#8730.ai" / "runner#8939.agent")
  const baseName = namePart.slice(0, hashIndex);
  const indexStr = namePart.slice(hashIndex + 1);
  const indexNum = parseInt(indexStr, 10);

  if (!baseName || !indexStr || isNaN(indexNum) || indexNum < 0) {
    throw new Error(
      `Invalid readable ID format: "${readableId}". Expected "name#number.ai", "name.ai", "name#number.agent" or "name.agent".`,
    );
  }

  return {
    id: baseName,
    index: [BigInt(indexNum)],   // Candid opt — [value] = Some(value)
    domain: [domain],
  };
}

/**
 * Backward-compatible helper for Owner AI IDs (".ai").
 * Delegates to the generalized parser.
 */
export function parseAiIdToRecord(aiId: string): IDRecord {
  return generalParseAiIdToRecord(aiId);
}


