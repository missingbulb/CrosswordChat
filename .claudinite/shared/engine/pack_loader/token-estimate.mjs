// How many tokens a piece of the corpus costs a session, estimated from its word
// count at the standard English ratio of roughly 0.75 words per token. Prose is
// words, and a character count is thrown off by exactly what this corpus is full
// of - code fences, paths, punctuation-dense Markdown.
//
// One estimator, because two readers state the same number to the same person:
// the session summary's "15.4k context tokens", and the usage review, which prices
// a skill's body against how often it loads. A second spelling would let the two
// disagree about what a skill costs while both sounded authoritative.
export const WORDS_PER_TOKEN = 0.75;

export const countWords = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

// `rounding` coarsens the answer - the session summary rounds to the hundred,
// since a sense of scale is not an accounting. A per-skill figure takes the
// default of 1, where rounding to the hundred would read every short skill as 0.
export const estimateTokens = (words, rounding = 1) => Math.round(words / WORDS_PER_TOKEN / rounding) * rounding;

export const estimateTokensOf = (text, rounding = 1) => estimateTokens(countWords(text), rounding);
