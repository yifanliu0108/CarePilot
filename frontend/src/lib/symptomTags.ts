/**
 * Optional “early signal” tags — subtle symptoms users may tick.
 * Copy stays educational, not diagnostic; encourages care when things persist.
 */

export type SymptomItem = {
  id: string;
  /** Short label (词条-style) */
  label: string;
  /** Why it matters — one line */
  hint?: string;
};

export type SymptomSection = {
  id: string;
  heading: string;
  items: SymptomItem[];
};

export const SYMPTOM_SECTIONS: SymptomSection[] = [
  {
    id: "head-energy-sleep",
    heading: "Head, energy & sleep",
    items: [
      { id: "brain-fog-most-days", label: "Brain fog most days", hint: "Hard to think clearly for weeks." },
      { id: "wake-unrefreshed", label: "Wake unrefreshed often", hint: "Sleep doesn’t feel restorative." },
      { id: "morning-headaches-new", label: "New morning headaches", hint: "Pattern changed recently." },
      { id: "fatigue-worse-weeks", label: "Fatigue clearly worse for weeks", hint: "Not only “busy season” tired." },
    ],
  },
  {
    id: "heart-chest-breath",
    heading: "Heart, chest & breathing",
    items: [
      { id: "palpitations-at-rest", label: "Palpitations at rest", hint: "Heart racing when you’re still." },
      { id: "chest-tightness-exertion", label: "Chest tightness with light effort", hint: "Less activity than before." },
      { id: "breathless-one-flight", label: "Winded climbing one flight (new)", hint: "Change from your baseline." },
      { id: "ankles-puffy-evening", label: "Ankles puffy by evening", hint: "New or getting worse." },
    ],
  },
  {
    id: "digestion-metabolic",
    heading: "Digestion & appetite",
    items: [
      { id: "stool-blood-or-tarry", label: "Blood or black/tarry stools", hint: "Worth prompt medical attention." },
      { id: "heartburn-weeks", label: "Heartburn most days for weeks", hint: "Not just after one heavy meal." },
      { id: "appetite-major-shift", label: "Major appetite change", hint: "Much more or much less than usual." },
      { id: "thirst-urination-up", label: "Much thirstier / peeing more", hint: "New pattern, not just hot days." },
    ],
  },
  {
    id: "neuro-pain-movement",
    heading: "Pain, nerves & movement",
    items: [
      { id: "numbness-tingling-persistent", label: "Numbness or tingling that lingers", hint: "Same spot, doesn’t fully go away." },
      { id: "one-sided-weakness", label: "Weakness on one side", hint: "Sudden or progressive — urgent if sudden." },
      { id: "vision-changes-new", label: "New blur, flashes, or blind spots", hint: "Especially if rapid." },
      { id: "joint-stiffness-mornings", label: "Joint stiffness most mornings", hint: "Lasts longer than ~30 minutes." },
    ],
  },
  {
    id: "skin-weight-general",
    heading: "Skin, weight & general",
    items: [
      { id: "weight-change-unexplained", label: "Weight change without trying", hint: "Up or down, noticeable." },
      { id: "new-lump-growing", label: "A new lump that grows", hint: "Anywhere on the body." },
      { id: "fevers-unexplained", label: "Fevers without a clear cold", hint: "Come back again and again." },
      { id: "cuts-heal-slowly", label: "Cuts heal slower than usual", hint: "New for you." },
    ],
  },
];

/** Max options per screen (matches 3–4 items per category = one screen per topic) */
const SYMPTOM_ITEMS_PER_PAGE = 4;

export type SymptomWizardPage = {
  title: string;
  sectionId: string;
  /** Main topic for this screen (sentence case). */
  topicHeading: string;
  /** When a section is split, e.g. "1 / 2"; otherwise null. */
  topicPart: string | null;
  items: SymptomItem[];
};

/**
 * Flatten sections into pages (≤4 chips); with 4 items per category, each topic is usually one screen.
 * Selections are still keyed by item id across pages.
 */
function buildSymptomWizardPages(): SymptomWizardPage[] {
  const pages: SymptomWizardPage[] = [];

  for (let si = 0; si < SYMPTOM_SECTIONS.length; si++) {
    const sec = SYMPTOM_SECTIONS[si];
    const title = si < 2 ? "Early signals" : "More to notice";
    const nChunks = Math.ceil(sec.items.length / SYMPTOM_ITEMS_PER_PAGE);

    for (let c = 0; c < nChunks; c++) {
      const slice = sec.items.slice(c * SYMPTOM_ITEMS_PER_PAGE, (c + 1) * SYMPTOM_ITEMS_PER_PAGE);
      const topicPart = nChunks > 1 ? `${c + 1} / ${nChunks}` : null;

      pages.push({
        title,
        sectionId: sec.id,
        topicHeading: sec.heading,
        topicPart,
        items: slice,
      });
    }
  }

  return pages;
}

export const SYMPTOM_WIZARD_PAGES: SymptomWizardPage[] = buildSymptomWizardPages();

const itemById = new Map<string, SymptomItem>();
for (const sec of SYMPTOM_SECTIONS) {
  for (const it of sec.items) {
    itemById.set(it.id, it);
  }
}

export function symptomLabelForId(id: string): string {
  return itemById.get(id)?.label ?? id;
}

export function formatSymptomSummary(ids: string[]): string {
  if (ids.length === 0) return "";
  const n = ids.length;
  if (n <= 3) return ids.map(symptomLabelForId).join(" · ");
  return `${n} signals noted (e.g. ${ids.slice(0, 2).map(symptomLabelForId).join(", ")}, …)`;
}
