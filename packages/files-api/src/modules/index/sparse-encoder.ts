/**
 * What finds `EN 1992-1-1` or drawing number `A-102`, the queries an embedding
 * turns into a neighbourhood and answers with the wrong standard. In process
 * rather than hosted, so it costs no call and works offline, which is what keeps
 * the pipeline testable against the emulator.
 *
 * BM25 term-frequency saturation with length normalisation on the document side,
 * uniform weights on the query side. IDF is deliberately absent: it is a
 * function of the whole corpus, so every document added would change the correct
 * weight of every document already stored, with no way to notice the drift.
 *
 * Terms hash into a fixed space rather than a vocabulary table, so encoding is
 * stateless and a term means the same thing forever. A collision adds noise to
 * one dimension of a ranking that is then fused with a semantic one.
 */

/**
 * 2^20 slots keeps collisions negligible for prose. Changing it, or the hash
 * below, changes what every stored sparse vector means and forces a rebuild, so
 * indexed.
 */
export const TERM_SPACE = 2 ** 20;
/** Multiplier and modulus of the term hash. Both prime, both arbitrary. */
const HASH_MULTIPLIER = 131;
const HASH_MODULUS = 2_147_483_647;
/** BM25 k1: how fast term frequency saturates. */
const K1 = 1.2;
/** BM25 b: how much document length is normalised out. */
const B = 0.75;
/** Assumed mean document length in terms, standing in for a corpus statistic. */
const AVERAGE_LENGTH = 120;
/** Shorter than this carries no lexical signal worth a slot. */
const MIN_TERM_LENGTH = 2;

const TOKEN_RE = /[a-z0-9]+(?:[-_.][a-z0-9]+)*/g;
/** The separators a compound term is also split on. */
const COMPOUND_RE = /[-_.]/;

/**
 * English function words, which match everything and distinguish nothing. This
 * is the cheap stand-in for IDF, so it covers the words that would otherwise
 * dominate a score rather than being a linguistically complete list.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "must",
  "no",
  "not",
  "of",
  "on",
  "or",
  "shall",
  "should",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "would",
]);

export interface SparseVector {
  indices: number[];
  values: number[];
}

export interface SparseEncoder {
  /** Weight by term frequency, saturated and length-normalised. */
  encodeDocument(text: string): SparseVector;
  /** Weight each distinct term equally; the document side carries the shape. */
  encodeQuery(text: string): SparseVector;
}

/**
 * Tokenise for retrieval, not for language. Identifiers are the point, so
 * internal hyphens, dots and underscores are kept: `EN 1992-1-1` yields the term
 * `1992-1-1`, which matches a document containing the same standard and nothing
 * else. The parts are emitted too, so `1992` still matches a looser citation.
 */
export function tokenize(text: string): string[] {
  const terms: string[] = [];
  for (const match of text.toLowerCase().matchAll(TOKEN_RE)) {
    const token = match[0];
    if (token.length < MIN_TERM_LENGTH || STOPWORDS.has(token)) {
      continue;
    }
    terms.push(token);
    if (!COMPOUND_RE.test(token)) {
      continue;
    }
    // A compound also contributes its parts, so a partial citation still hits.
    for (const part of token.split(COMPOUND_RE)) {
      if (part.length >= MIN_TERM_LENGTH && !STOPWORDS.has(part)) {
        terms.push(part);
      }
    }
  }
  return terms;
}

/**
 * Polynomial rolling hash, folded into the term space. Stateless, so a term maps
 * to the same slot in every process and every document forever.
 *
 * Modular arithmetic rather than the usual 32-bit bitwise mixing, so every
 * intermediate stays a safe integer and the result is never negative. Term
 * hashing wants collision resistance across a vocabulary of thousands, which this
 * has; it is not a checksum and nothing depends on avalanche behaviour.
 */
export function hashTerm(term: string): number {
  let hash = 0;
  for (let i = 0; i < term.length; i++) {
    hash = (hash * HASH_MULTIPLIER + term.charCodeAt(i)) % HASH_MODULUS;
  }
  return hash % TERM_SPACE;
}

function counts(terms: string[]): Map<number, number> {
  const byIndex = new Map<number, number>();
  for (const term of terms) {
    const index = hashTerm(term);
    byIndex.set(index, (byIndex.get(index) ?? 0) + 1);
  }
  return byIndex;
}

function toVector(weights: Map<number, number>): SparseVector {
  // Ascending indices: Pinecone requires it, and it makes the encoding
  // comparable byte for byte in tests.
  const indices = [...weights.keys()].sort((a, b) => a - b);
  return {
    indices,
    values: indices.map((index) => weights.get(index) as number),
  };
}

export function createSparseEncoder(): SparseEncoder {
  return {
    encodeDocument(text: string): SparseVector {
      const terms = tokenize(text);
      const frequencies = counts(terms);
      const lengthNorm = K1 * (1 - B + (B * terms.length) / AVERAGE_LENGTH);
      const weights = new Map<number, number>();
      for (const [index, frequency] of frequencies) {
        // BM25 term saturation: the tenth mention of a word adds far less than
        // the second, so a long document cannot win on repetition alone.
        weights.set(index, (frequency * (K1 + 1)) / (frequency + lengthNorm));
      }
      return toVector(weights);
    },

    encodeQuery(text: string): SparseVector {
      const weights = new Map<number, number>();
      for (const term of tokenize(text)) {
        weights.set(hashTerm(term), 1);
      }
      return toVector(weights);
    },
  };
}
