import { finding, stripComments, isSource, lineOf, phraseTables, isWalkedAsLexicon } from './lib.mjs';

// A spoken interface recognises intents by their SURFACE PHRASES: a table mapping
// each intent to every wording a user might say for it, walked to build a
// phrase-keyed lookup (`EXACT.set(phrase, intent)`) or matched arm by arm against
// the utterance. Both shapes resolve a phrase listed under two intents by
// POSITION — the last arm to write the key wins, or the first arm to be scanned
// wins — and nothing in the source says which was meant.
//
// That is a bug with no symptom at the site of the mistake. The table still
// compiles, every test that says the phrase still passes (against whichever intent
// happened to win), and the loss shows up only as a user saying a perfectly listed
// phrase and getting the other command — the hardest kind of voice bug to report,
// because the user cannot see the table and the developer cannot hear the room.
// These tables grow by accretion — every live mishearing a session turns up gets
// appended to the arm it was heard for — so the collision usually arrives months
// after both arms were written, in a diff that only adds one line.
//
// Deliberately scoped to a phrase listed under two DIFFERENT intents. The same
// phrase twice within one arm is a redundancy that resolves to the intent it was
// always going to resolve to; it costs nothing and this rule has no opinion on it.
// And a table nobody walks as a lexicon is left alone entirely: a synonym or
// expansion map read by key legitimately repeats its values (a homophone set names
// every word in it, under every word in it), and firing there would be exactly the
// false alarm that teaches a team to ignore a check.
//
// Comments are stripped first, so a commented-out arm is not a live arm.

const rule = {
  id: 'intent-phrases-unique',
  severity: 'blocking',
  description: 'No surface phrase is listed under two intents',
  doc: '.claudinite/local/packs/voice-dialog/RULES.md',
  why: 'a phrase listed under two intents is resolved by table order, not by intent — the losing intent becomes unreachable through that wording and nothing anywhere reports it',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('[')) continue;
      const src = stripComments(raw);
      for (const table of phraseTables(src)) {
        if (!isWalkedAsLexicon(src, table)) continue;
        const owner = new Map(); // phrase → first arm's key
        for (const arm of table.arms) {
          for (const phrase of arm.phrases) {
            const first = owner.get(phrase.text);
            if (first === undefined) {
              owner.set(phrase.text, arm.key);
              continue;
            }
            if (first === arm.key) continue; // repeated inside one arm: harmless
            out.push(finding(rule, {
              file,
              line: lineOf(src, phrase.index),
              what: `${table.name} lists the phrase "${phrase.text}" under both "${first}" and "${arm.key}" — whichever the walk reaches last (or first) silently wins`,
              fix: `give the phrase to exactly one intent and delete it from the other, or — if both readings are genuinely meant — resolve it in context rather than in the table (ask which was meant, or key it on the mode the speaker is in)`,
            }));
          }
        }
      }
    }
    return out;
  },
};

export default rule;
