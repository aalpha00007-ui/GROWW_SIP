// Signed numbers on screen: green with ▲ and + when up, red with ▼ and − when down, muted when zero.
// Never colour alone: the sign and the arrow always show too (build spec §3). Only the display changes;
// the numbers come formatted from the server as they are, so the facts the AI is checked against stay the same.

/** A hyphen before a number becomes a real minus sign: '-Rs 1,914 (-13.7%)' -> '−Rs 1,914 (−13.7%)'. */
export function minusSign(text: string): string {
  return text.replace(/(^|[\s(])-(?=Rs|\d)/g, '$1−');
}

const STYLE = {
  up: { text: 'text-gain', arrow: '▲', word: 'Up' },
  down: { text: 'text-loss', arrow: '▼', word: 'Down' },
  flat: { text: 'text-muted', arrow: '', word: '' },
} as const;

/** One signed value, such as '-19.9%' or '+Rs 47 (+1.2%)'. */
export function Signed({ value }: { value: string }) {
  const style = STYLE[value.startsWith('-') ? 'down' : value.startsWith('+') ? 'up' : 'flat'];
  return (
    <span className={`tabular whitespace-nowrap font-semibold ${style.text}`}>
      {style.arrow && (
        <span aria-hidden="true" className="mr-0.5 text-[10px]">
          {style.arrow}
        </span>
      )}
      {style.word && <span className="sr-only">{style.word} </span>}
      {minusSign(value)}
    </span>
  );
}

// A sign right before a number (or "Rs 12"), at the start or after a space or "(".
const SIGNED_NUMBER = /((?:^|(?<=[\s(]))[+-](?:Rs )?\d[\d,]*(?:\.\d+)?%?)/;

/** A sentence with signed numbers in it: only the numbers take the colour, the rest stays neutral. */
export function SignedText({ text }: { text: string }) {
  return (
    <>
      {text.split(SIGNED_NUMBER).map((part, i) => (i % 2 === 1 ? <Signed key={i} value={part} /> : part))}
    </>
  );
}
