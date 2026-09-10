/**
 * Competency display names, pedagogical ladder order, domains and families.
 *
 * This is the single place a competency label is written. Nothing else in the
 * app maps a std_competency to human text.
 *
 * The order below is the pedagogical ladder from the build brief, section 3.5.
 * It is the default sort everywhere, applied within each domain.
 *
 * A std_competency that is not in this table still renders: it gets a humanised
 * name, is placed at the end of its domain, and logs a console warning. The
 * pipeline can add competencies without a code change.
 */

/** @type {{id: string, name: string, domain: 'literacy'|'numeracy'}[]} */
const LADDER = [
  // --- Literacy -------------------------------------------------------------
  { id: 'oral_language_dev', name: 'Oral language', domain: 'literacy' },
  { id: 'listening_comprehension', name: 'Listening comprehension', domain: 'literacy' },
  { id: 'oral_vocabulary', name: 'Oral vocabulary', domain: 'literacy' },
  { id: 'picture_comprehension', name: 'Picture comprehension', domain: 'literacy' },
  { id: 'letter_recognition', name: 'Letter recognition', domain: 'literacy' },
  { id: 'letter_naming_fluency', name: 'Letter naming (timed)', domain: 'literacy' },
  { id: 'word_reading', name: 'Word reading', domain: 'literacy' },
  { id: 'word_reading_fluency', name: 'Word reading (timed)', domain: 'literacy' },
  { id: 'sentence_reading', name: 'Sentence reading', domain: 'literacy' },
  { id: 'oral_reading_fluency', name: 'Oral reading fluency', domain: 'literacy' },
  { id: 'reading_comprehension', name: 'Reading comprehension', domain: 'literacy' },
  { id: 'letter_writing', name: 'Letter writing', domain: 'literacy' },
  { id: 'word_writing', name: 'Word writing', domain: 'literacy' },
  { id: 'sentence_writing', name: 'Sentence writing', domain: 'literacy' },
  { id: 'independent_writing', name: 'Independent writing', domain: 'literacy' },
  // --- Numeracy -------------------------------------------------------------
  { id: 'number_recognition', name: 'Number recognition', domain: 'numeracy' },
  { id: 'number_comparison', name: 'Number comparison', domain: 'numeracy' },
  { id: 'number_writing', name: 'Number writing', domain: 'numeracy' },
  { id: 'place_value_bundles', name: 'Place value (counting in bundles)', domain: 'numeracy' },
  { id: 'addition_1digit', name: 'Addition, 1-digit', domain: 'numeracy' },
  { id: 'addition', name: 'Addition (district tools)', domain: 'numeracy' },
  { id: 'addition_2digit', name: 'Addition, 2-digit (DiD)', domain: 'numeracy' },
  { id: 'subtraction_1digit', name: 'Subtraction, 1-digit', domain: 'numeracy' },
  { id: 'subtraction', name: 'Subtraction (district tools)', domain: 'numeracy' },
  { id: 'subtraction_2digit', name: 'Subtraction, 2-digit (DiD)', domain: 'numeracy' },
  { id: 'add_sub_1digit_combined', name: 'Addition and subtraction, 1-digit (combined score)', domain: 'numeracy' },
  { id: 'word_problem_addition', name: 'Word problems, addition', domain: 'numeracy' },
  { id: 'word_problem_subtraction', name: 'Word problems, subtraction', domain: 'numeracy' },
  { id: 'multiplication', name: 'Multiplication', domain: 'numeracy' },
  { id: 'pattern', name: 'Patterns (district tools)', domain: 'numeracy' },
  { id: 'number_pattern', name: 'Number patterns (DiD)', domain: 'numeracy' },
  { id: 'shape_pattern', name: 'Shape patterns (DiD)', domain: 'numeracy' },
  { id: 'shapes_2d', name: '2D shapes', domain: 'numeracy' },
  { id: 'shapes_1', name: 'Shapes, item 1 (DiD)', domain: 'numeracy' },
  { id: 'shapes_2', name: 'Shapes, item 2 (DiD)', domain: 'numeracy' },
  { id: 'shapes_midline_unspecified', name: 'Shapes (midline)', domain: 'numeracy' },
  { id: 'measurement', name: 'Measurement', domain: 'numeracy' },
  { id: 'data_handling', name: 'Data handling', domain: 'numeracy' },
  { id: 'money', name: 'Money', domain: 'numeracy' },
];

const BY_ID = new Map(LADDER.map((c, i) => [c.id, { ...c, order: i + 1, known: true }]));

/** Display names for competency families, used as heatmap sub-headers. */
const FAMILY_NAMES = {
  oral_language: 'Oral language',
  letter_recognition: 'Letters',
  word_reading: 'Word reading',
  sentence_reading: 'Sentence reading',
  oral_reading_fluency: 'Reading fluency',
  reading_comprehension: 'Reading comprehension',
  writing: 'Writing',
  number_sense: 'Number sense',
  number_writing: 'Number writing',
  place_value: 'Place value',
  addition: 'Addition',
  subtraction: 'Subtraction',
  word_problems: 'Word problems',
  multiplication: 'Multiplication',
  pattern: 'Patterns',
  shapes: 'Shapes',
  measurement: 'Measurement',
  data_handling: 'Data handling',
  money: 'Money',
};

/** Competencies seen in the data that are not in LADDER. Warned about once each. */
const warned = new Set();

/**
 * Turn an unknown std_competency into readable text.
 * `word_problem_division` -> `Word problem division`
 */
function humanise(id) {
  const text = String(id).replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Look up a competency. Never returns undefined: unknown IDs get a humanised
 * name and an order that places them after every known competency, so a new
 * competency from the pipeline renders in a sensible place without a code change.
 *
 * @param {string} id std_competency
 * @param {{domain?: string}} [hints] domain read from the data row, used for unknown IDs
 */
export function competency(id, hints = {}) {
  const known = BY_ID.get(id);
  if (known) return known;

  if (!warned.has(id)) {
    warned.add(id);
    console.warn(
      `[competencies] "${id}" is not in the ladder table in competencies.js. ` +
      `Rendering it as "${humanise(id)}" at the end of its domain. ` +
      `Add it to LADDER to give it a display name and a ladder position.`
    );
  }
  return {
    id,
    name: humanise(id),
    domain: hints.domain === 'numeracy' ? 'numeracy' : 'literacy',
    order: 1000 + id.length, // stable, and always after every known competency
    known: false,
  };
}

/** Display name only. */
export function competencyName(id, hints) {
  return competency(id, hints).name;
}

/** Display name for a competency_family, humanised if unrecognised. */
export function familyName(family) {
  return FAMILY_NAMES[family] || humanise(family);
}

/** Ladder position. Unknown competencies sort to the end of their domain. */
export function ladderOrder(id, hints) {
  return competency(id, hints).order;
}

/**
 * Comparator for sorting competency IDs into domain-then-ladder order.
 * Literacy before numeracy, ladder order within each.
 */
export function byLadder(hintsById = {}) {
  const rank = (id) => {
    const c = competency(id, hintsById[id]);
    return [c.domain === 'literacy' ? 0 : 1, c.order];
  };
  return (a, b) => {
    const [da, oa] = rank(a);
    const [db, ob] = rank(b);
    return da - db || oa - ob;
  };
}

/** Every competency in the ladder table, in order. Does not include unknown IDs. */
export function allCompetencies() {
  return LADDER.map((c, i) => ({ ...c, order: i + 1, known: true }));
}

/** True if this ID has an entry in the ladder table. */
export function isKnown(id) {
  return BY_ID.has(id);
}
