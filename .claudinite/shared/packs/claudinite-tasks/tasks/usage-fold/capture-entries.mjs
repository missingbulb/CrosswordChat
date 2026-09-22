// Reading ONE transcript entry - the shapes every counter in this task asks
// about, in the one place that knows them. Both counting passes read entries
// (fold-usage.mjs counts what the session produced, corpus-use.mjs what the
// corpus did to it), and a shape spelled twice would let the two disagree about
// what a load or a human turn is.

// A genuine human turn. POSITIVE test, deliberately: the transcript stamps a
// typed-by-a-person turn with `origin: { kind: 'human' }`, and everything else a
// user-role entry can be - a tool result, an injected/meta turn, a subagent's
// sidechain traffic, a compaction summary, a slash-command expansion, and (the one
// that matters most here) a scheduled-task firing, which carries
// `origin: { kind: 'task-notification', subkind: 'scheduled-trigger' }` - simply
// lacks that stamp. Testing FOR the human marker rather than against a list of
// automated ones means a new automated entry shape is excluded the day it appears
// instead of silently inflating the denominator.
//
// The honest boundary: an older harness wrote no `origin` at all. Those turns count
// as non-human, so a repo's very old captures under-report userMessages rather than
// over-reporting them. This is the most fragile line in the fold, which is why it is
// one function with a fixture per shape it excludes.
export function isUserMessage(entry) {
  return entry?.type === 'user' && entry?.origin?.kind === 'human';
}

// A user-typed slash command. The harness expands `/name args` into a user entry
// whose string content opens with a `<command-name>` tag - the tag is the marker,
// so prose that merely mentions a slash command never counts. Returns the bare
// command name (no leading slash), or null.
const COMMAND_RE = /<command-name>\s*\/?([A-Za-z0-9:_-]+)\s*<\/command-name>/;
export function commandName(entry) {
  if (entry?.type !== 'user') return null;
  const content = entry?.message?.content;
  if (typeof content !== 'string') return null;
  return COMMAND_RE.exec(content)?.[1] ?? null;
}

// Skill names loaded by an assistant entry: every `Skill` tool_use block's
// `input.skill`. Sidechain (subagent) entries are included by the caller - a
// subagent loading a skill is a load.
export function skillToolLoads(entry) {
  if (entry?.type !== 'assistant') return [];
  const content = entry?.message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b?.type === 'tool_use' && b?.name === 'Skill' && typeof b?.input?.skill === 'string')
    .map((b) => b.input.skill);
}

// The tool_use blocks of an assistant entry, as { name, input, id }.
export function toolCalls(entry) {
  if (entry?.type !== 'assistant' || !Array.isArray(entry?.message?.content)) return [];
  return entry.message.content
    .filter((b) => b?.type === 'tool_use' && typeof b?.name === 'string')
    .map((b) => ({ name: b.name, input: b.input ?? {}, id: b.id }));
}

// Every string value anywhere in one entry, newline-joined - the haystack the
// executor's exec records and the hooks' own log lines are fished out of. They are
// printed by code into tool results, but the model may also quote one back, and the
// harness records both, so every caller dedupes on the record it read rather than
// trusting any one entry shape.
export function entryText(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) entryText(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) entryText(v, out);
  return out;
}
