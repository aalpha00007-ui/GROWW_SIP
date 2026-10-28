'use client';
// The header's search (Ctrl+K), notifications and avatar menu. Every suggestion and notification is demo data.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ShellData } from '@/server/shell';
import { LogOutButton } from './account-actions';
import { Avatar } from './avatar';
import { Dropdown } from './dropdown';
import { Icon, type IconName } from './icons';

export function SearchBox({ suggestions }: { suggestions: ShellData['suggestions'] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Before typing: a mix of funds and stocks; then whatever matches.
    const list = q ? suggestions.filter((s) => s.label.toLowerCase().includes(q)) : [...suggestions.filter((s) => s.kind === 'Fund').slice(0, 5), ...suggestions.filter((s) => s.kind === 'Stock').slice(0, 3)];
    return list.slice(0, 8);
  }, [query, suggestions]);

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  return (
    <div ref={box} className="relative hidden lg:block">
      <label className="flex min-h-11 w-72 items-center gap-2 rounded-full border border-line px-4 text-sm text-muted focus-within:border-primary">
        <Icon name="search" size={18} />
        <span className="sr-only">Search funds and stocks</span>
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) go(results[0].href);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Search mutual funds"
          className="min-w-0 flex-1 bg-transparent text-ink placeholder:text-muted focus:outline-none"
        />
        <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Ctrl K</kbd>
      </label>
      {open && (
        <ul className="absolute right-0 top-full z-30 mt-2 w-96 overflow-hidden rounded-xl border border-line bg-surface py-2 shadow-lg">
          {results.length ? (
            results.map((r) => (
              <li key={`${r.kind}-${r.label}`}>
                <button type="button" onClick={() => go(r.href)} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-sm hover:bg-hover-neutral">
                  <span className="text-ink">{r.label}</span>
                  <span className="text-xs text-muted">{r.kind}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-muted">No demo fund or stock matches.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function Bell({ notifications }: { notifications: ShellData['notifications'] }) {
  const [read, setRead] = useState(false);
  const unread = read ? 0 : 3;
  return (
    <Dropdown
      label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      onOpen={() => setRead(true)}
      className="relative grid size-11 place-items-center rounded-full text-strong hover:bg-hover-neutral"
      button={
        <>
          <Icon name="bell" />
          {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-loss" aria-hidden="true" />}
        </>
      }
    >
      <p className="border-b border-line px-4 py-3 font-semibold text-strong">Notifications · demo</p>
      <ul className="max-h-96 overflow-y-auto">
        {notifications.map((n, i) => (
          <li key={n.id} className="border-b border-line last:border-0">
            <Link href={n.href} className="flex gap-3 px-4 py-3 hover:bg-hover-neutral">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${i < 3 && !read ? 'bg-primary' : 'bg-transparent'}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-strong">{n.title}</span>
                <span className="block text-sm text-ink">{n.text}</span>
                <span className="block text-xs text-muted">{n.when}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Dropdown>
  );
}

export function AvatarMenu({ name, handle, balance }: { name: string; handle: string; balance: string }) {
  const rows: { label: string; href: string; icon: IconName; value?: string }[] = [
    { label: 'Demo balance', href: '/settings', icon: 'wallet', value: balance },
    { label: 'My goals', href: '/dashboard#your-goals', icon: 'goals' },
    { label: 'All orders', href: '/orders', icon: 'orders' },
    { label: 'SIPs', href: '/sips', icon: 'sips' },
    { label: 'Reports (demo statement)', href: '/reports', icon: 'report' },
    { label: 'Help & about this prototype', href: '/help', icon: 'help' },
    { label: 'Switch demo persona', href: '/#personas', icon: 'switch' },
  ];
  return (
    <Dropdown
      label="Account menu"
      panelClass="w-80"
      className="flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold text-strong hover:bg-hover-neutral"
      button={
        <>
          <Avatar name={name} />
          <span className="hidden sm:inline">{name}</span>
        </>
      }
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-strong">{name}</p>
          <p className="truncate text-sm text-muted">{handle}</p>
        </div>
        <Link href="/settings" aria-label="Settings" className="grid size-11 place-items-center rounded-full text-strong hover:bg-hover-neutral">
          <Icon name="settings" />
        </Link>
      </div>
      <ul className="py-1">
        {rows.map((r) => (
          <li key={r.label}>
            <Link href={r.href} className="flex min-h-11 items-center gap-3 px-4 text-sm text-ink hover:bg-hover-neutral">
              <Icon name={r.icon} size={20} className="text-primary" />
              <span className="flex-1">{r.label}</span>
              {r.value && <span className="tabular font-medium text-strong">{r.value}</span>}
              <Icon name="chevron" size={16} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-line p-2">
        <LogOutButton className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-sm font-semibold text-loss hover:bg-loss-soft hover:text-loss-strong" />
      </div>
    </Dropdown>
  );
}
