import { ComingNext } from '@/components/coming-next';

// Stands in for /sips/[id], its goal page and "What does this dip mean for my goal?" until build step 3,
// so the links on Home never lead to a 404.
export default function SipPage() {
  return (
    <ComingNext
      title="Your SIP"
      what="The SIP page, with its goal, controls, “What does this dip mean for my goal?” and Before you stop, arrives in the next build step."
    />
  );
}
