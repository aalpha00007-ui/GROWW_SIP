// The three demos on the landing page (and behind "Switch demo persona"). The other personas keep their seed
// data for tests and evals; they are just not offered here. Each start is a fresh private copy.
import type { PersonaKey } from '../pipeline/loading/raw';

export interface Demo {
  key: PersonaKey;
  name: string;
  about: string;
}

export const DEMOS: readonly Demo[] = [
  { key: 'kabir', name: 'Kabir, 23, first job', about: 'New investor. Start your first SIP and set a goal.' },
  { key: 'riya', name: 'Riya, 27, salaried', about: 'Her SIP is in the red after a market fall. See the dip next to her goal.' },
  {
    key: 'arjun',
    name: 'Arjun, 31, freelancer',
    about: "Income varies and he's already skipped a month. Try stopping a SIP and see the check-in.",
  },
];

/**
 * "Try the new feature" in the header's More menu: each item starts a fresh copy of one demo and opens the page
 * that shows the feature. Fund 2 is Kestrel Nifty 50 Index Fund, the first of Explore's popular funds (ids are
 * fixed in data/raw/market/funds.json); its order card has the goal row.
 */
export const FEATURE_TRIES = [
  { title: 'Set a goal for a SIP', text: 'Start a SIP as Kabir and add a goal', persona: 'kabir', href: '/fund/2' },
  { title: 'See the dip in context', text: "Open Riya's SIP after a market fall", persona: 'riya', href: '/dashboard' },
  { title: 'Check in before you stop', text: "Try stopping Arjun's SIP", persona: 'arjun', href: '/sips' },
] as const satisfies readonly { title: string; text: string; persona: PersonaKey; href: string }[];
