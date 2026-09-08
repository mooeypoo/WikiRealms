/**
 * Wikipedia's inline citation markers, in the forms Parsoid emits.
 *
 * Shared by the two things that need to agree about them: the citation
 * count itself, and the sentence counter that has to remove them before
 * it can see the sentences they attach to.
 *
 * A marker renders as its own text — "[1]" for Parsoid's
 * `<span class="mw-reflink-text">` — and it lands DIRECTLY after the
 * sentence's full stop, by citation convention. So "…sourced.[1]" has no
 * whitespace after the period, and a text-based sentence counter fires on
 * neither. That biases the count in the worst possible direction: the
 * sentences that go uncounted are exactly the cited ones, so
 * citations-per-sentence comes out inflated, and inflated most in the
 * best-cited sections.
 */
export const CITATION_MARKER_SELECTOR = 'sup.reference, sup.mw-ref, sup[typeof~="mw:Extension/ref"]'
