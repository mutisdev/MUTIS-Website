// Shared EDI / widening-participation option lists for the membership
// sign-up form and its admin view — one source of truth for both the
// <select> options and the human-readable labels shown in the admin panel.

export const ETHNICITY_GROUPS: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: "White",
    options: [
      { value: "white_british", label: "English / Welsh / Scottish / Northern Irish / British" },
      { value: "white_irish", label: "Irish" },
      { value: "white_gypsy_traveller", label: "Gypsy or Irish Traveller" },
      { value: "white_other", label: "Any other White background" },
    ],
  },
  {
    group: "Mixed / Multiple ethnic groups",
    options: [
      { value: "mixed_white_black_caribbean", label: "White and Black Caribbean" },
      { value: "mixed_white_black_african", label: "White and Black African" },
      { value: "mixed_white_asian", label: "White and Asian" },
      { value: "mixed_other", label: "Any other Mixed / Multiple ethnic background" },
    ],
  },
  {
    group: "Asian / Asian British",
    options: [
      { value: "asian_indian", label: "Indian" },
      { value: "asian_pakistani", label: "Pakistani" },
      { value: "asian_bangladeshi", label: "Bangladeshi" },
      { value: "asian_chinese", label: "Chinese" },
      { value: "asian_other", label: "Any other Asian background" },
    ],
  },
  {
    group: "Black / African / Caribbean / Black British",
    options: [
      { value: "black_african", label: "African" },
      { value: "black_caribbean", label: "Caribbean" },
      { value: "black_other", label: "Any other Black / African / Caribbean background" },
    ],
  },
  {
    group: "Other ethnic group",
    options: [
      { value: "other_arab", label: "Arab" },
      { value: "other_ethnic_group", label: "Any other ethnic group" },
    ],
  },
];

export const ETHNICITY_PREFER_NOT_TO_SAY = { value: "prefer_not_to_say", label: "Prefer not to say" };

const YES_NO_NOT_SURE_PREFER: { value: string; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_sure", label: "Not sure" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const CONTEXTUAL_OFFER_OPTIONS = YES_NO_NOT_SURE_PREFER;
export const FIRST_GENERATION_OPTIONS = YES_NO_NOT_SURE_PREFER;
export const FREE_SCHOOL_MEALS_OPTIONS = YES_NO_NOT_SURE_PREFER;

export const SCHOOL_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "state_non_selective", label: "State school (non-selective)" },
  { value: "state_grammar_selective", label: "State school (grammar/selective)" },
  { value: "independent_private", label: "Independent/private school" },
  { value: "sixth_form_fe", label: "Sixth form or FE college" },
  { value: "international", label: "International school" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
