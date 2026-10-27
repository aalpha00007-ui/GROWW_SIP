import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Banner } from '@/components/banner';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' });

export const metadata: Metadata = {
  title: 'GROWW_SIP · Case-study prototype',
  description: 'A goal anchor and an AI check-in for first-year SIP investors. Not affiliated with Groww. Demo data. Not investment advice.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#3f3d9e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <Banner />
        {children}
      </body>
    </html>
  );
}
