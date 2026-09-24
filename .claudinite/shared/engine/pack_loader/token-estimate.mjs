// How many tokens a piece of the corpus costs a session, estimated from its
// CHARACTER count. Characters rather than words because this corpus is not English
// prose: it is paths, backticked ids, kebab-case rule names and code fences, all of
// which a tokenizer splits far more finely than the word they sit inside, so a
// words-per-token ratio reads the same text as smaller than it is.
//
// THE RATIO IS MEASURED, not assumed. `cl100k_base` over this repo's own corpus
// answers 4.16 chars per token across the pack prose CLAUDE.md imports and 4.27
// across the skill bodies, the two bodies of text the two readers below weigh, so
// one ratio covers both to within 2%. It is an estimate either way: a session's real
// tokenizer is not this one, and the number is a sense of scale rather than a bill.
export const CHARS_PER_TOKEN = 4.2;

export const countChars = (text) => String(text ?? '').length;

// `rounding` coarsens the answer - the session summary rounds to the hundred,
// since a sense of scale is not an accounting. A per-skill figure takes the
// default of 1, where rounding to the hundred would read every short skill as 0.
export const estimateTokens = (chars, rounding = 1) => Math.round(chars / CHARS_PER_TOKEN / rounding) * rounding;

// One estimator, because two readers state the same number to the same person: the
// session summary's "N context tokens", and the usage review, which prices a skill's
// body against how often it loads. A second spelling would let the two disagree about
// what a skill costs while both sounded authoritative.
export const estimateTokensOf = (text, rounding = 1) => estimateTokens(countChars(text), rounding);

// @deprecated. The name a `packs/` file called this counter by before the estimate
// moved to characters. It counts CHARACTERS: the only thing any caller did with it was
// `estimateTokens(countWords(text))`, and that composition has to keep answering the
// corrected number while a member holds this engine beside a `packs/` copy one lane
// behind. Dropping the export instead fails that copy's import, which fails the pack,
// which is what the engine flow's self-test refuses to land an update over.
// @legacy-tolerance advisory:none retire:#2295
export const countWords = countChars;

// @deprecated. The ratio the estimate went through before it moved to characters,
// standing for a member's own local pack that named it. Nothing here reads it, and it
// still says what it always said: English runs about three quarters of a word to the
// token. It is the corpus this repo weighs that is not English.
// @legacy-tolerance advisory:none retire:#2295
export const WORDS_PER_TOKEN = 0.75;
