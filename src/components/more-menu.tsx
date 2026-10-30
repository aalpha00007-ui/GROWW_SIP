'use client';
// The header's More menu on the landing page and the public pages: what the prototype can do, and every item
// works without logging in. Calculators and Learn are public pages; "Try the new feature" starts a fresh demo
// copy and opens the page that shows it. A click opens and closes it; on a desktop with a mouse, so does hover
// (after 150 ms). Esc, a click outside or choosing an item closes it and puts focus back on More. Opening it
// never changes the URL, and it never opens the sign-up modal.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FEATURE_TRIES } from '@/server/demos';
import { Icon } from './icons';
import { startDemo } from './start-demo';

const CALCULATORS = [
  { title: 'SIP calculator', text: 'Estimate what a monthly SIP could grow to', href: '/calculators/sip' },
  { title: 'Goal planner', text: 'Find the monthly SIP for a goal and a date', href: '/calculators/goal' },
  { title: 'SWP calculator', text: 'Plan monthly withdrawals from your savings', href: '/calculators/swp' },
];

const LEARN = [
  { title: 'How the AI works', text: "What it uses, how answers are checked, and when it won't answer", href: '/about/ai' },
  { title: 'About this prototype', text: "What's demo, what we store, and how to delete it", href: '/about' },
  { title: 'SIP basics', text: 'Short facts on SIPs and market falls', href: '/learn/sip-basics' },
];

const HOVER_DELAY_MS = 150;
const ITEM = 'block w-full rounded-lg px-3 py-3 text-left hover:bg-hover-neutral disabled:cursor-wait';
const canHover = () => window.matchMedia('(hover: hover) and (min-width: 768px)').matches;

export function MoreMenu() {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  // Opened by hover, it closes when the pointer leaves; a click pins it open.
  const byHover = useRef(false);
  const isOpen = useRef(open);
  isOpen.current = open;

  const close = useRef<(refocus: boolean) => void>(() => {});
  close.current = (refocus) => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setError(null);
    if (refocus) button.current?.focus();
  };

  useEffect(() => close.current(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current(true);
    // On click, not mousedown: by then focus has moved, so focus only comes back to More when the click landed
    // on nothing focusable.
    const onClick = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      close.current(document.activeElement === document.body || document.activeElement === null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function hover(entering: boolean, e: React.PointerEvent) {
    if (e.pointerType !== 'mouse' || !canHover()) return;
    window.clearTimeout(timer.current);
    if (entering && !isOpen.current) {
      timer.current = window.setTimeout(() => {
        byHover.current = true;
        setOpen(true);
      }, HOVER_DELAY_MS);
    } else if (!entering && isOpen.current && byHover.current) {
      timer.current = window.setTimeout(() => close.current(false), HOVER_DELAY_MS);
    }
  }

  async function tryFeature(persona: string, href: string) {
    setStarting(persona);
    setError(null);
    const failed = await startDemo(persona);
    if (failed) {
      setError(failed);
      setStarting(null);
      return;
    }
    router.push(href);
    router.refresh();
  }

  return (
    <div
      ref={box}
      onPointerEnter={(e) => hover(true, e)}
      onPointerLeave={(e) => hover(false, e)}
      // Tabbing past the last item closes the menu.
      onBlur={(e) => e.relatedTarget && !box.current?.contains(e.relatedTarget as Node) && close.current(false)}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="more-menu"
        onClick={() => {
          window.clearTimeout(timer.current);
          if (open && byHover.current) byHover.current = false;
          else if (open) close.current(false);
          else {
            byHover.current = false;
            setOpen(true);
          }
        }}
        className={`flex min-h-11 items-center gap-1 whitespace-nowrap text-base font-medium hover:text-ink md:text-lg ${open ? 'text-ink' : 'text-muted'}`}
      >
        More
        <Icon name="chevron" size={16} className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      <div
        id="more-menu"
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-10rem)] overflow-y-auto md:max-h-[calc(100dvh-7rem)] border-b border-line bg-surface shadow-[0_12px_24px_-12px_rgba(0,0,0,0.18)]"
      >
        <div className="mx-auto grid max-w-7xl gap-2 px-4 py-3 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line md:py-5">
          <Column id="more-calculators" title="Calculators">
            {CALCULATORS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => close.current(true)} className={ITEM}>
                  <ItemText title={item.title} text={item.text} />
                </Link>
              </li>
            ))}
          </Column>
          <Column id="more-try" title="Try the new feature (no sign-up)">
            {FEATURE_TRIES.map((item) => (
              <li key={item.persona}>
                <button type="button" disabled={starting !== null} onClick={() => tryFeature(item.persona, item.href)} className={ITEM}>
                  <ItemText title={item.title} text={starting === item.persona ? 'Starting the demo…' : item.text} />
                </button>
              </li>
            ))}
            {error && (
              <li role="alert" className="mx-3 mt-1 rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss-strong">
                {error}
              </li>
            )}
          </Column>
          <Column id="more-learn" title="Learn">
            {LEARN.map((item) => (
              <li key={item.href}>
                <Link href={item.href} onClick={() => close.current(true)} className={ITEM}>
                  <ItemText title={item.title} text={item.text} />
                </Link>
              </li>
            ))}
          </Column>
        </div>
      </div>
    </div>
  );
}

/** One column. Its heading shows on phones, where the columns stack; on wider screens only screen readers hear it. */
function Column({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="md:px-3 md:first:pl-0 md:last:pr-0">
      <p id={id} className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted md:sr-only">
        {title}
      </p>
      <ul aria-labelledby={id}>{children}</ul>
    </div>
  );
}

function ItemText({ title, text }: { title: string; text: string }) {
  return (
    <>
      <span className="block text-base font-medium text-strong">{title}</span>
      <span className="mt-0.5 block text-sm text-muted" aria-live="polite">
        {text}
      </span>
    </>
  );
}
