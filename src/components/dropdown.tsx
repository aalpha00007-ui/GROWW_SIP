'use client';
// A button that opens a panel under it; closes on a click outside, on Escape, and on navigation.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function Dropdown({
  label,
  button,
  className = '',
  panelClass = 'w-80',
  onOpen,
  children,
}: {
  label: string;
  button: React.ReactNode;
  className?: string;
  panelClass?: string;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
        className={className}
      >
        {button}
      </button>
      {open && <div className={`absolute right-0 top-full z-30 mt-2 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface shadow-lg ${panelClass}`}>{children}</div>}
    </div>
  );
}
