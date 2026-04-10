import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'RainMap NL — Alle regenmeetlocaties van Nederland',
  description: 'Interactieve kaart met alle regenmeetlocaties in Nederland: KNMI, Rijkswaterstaat, waterschappen, WOW-NL, Netatmo en meer.',
  openGraph: {
    title: 'RainMap NL — Alle regenmeetlocaties van Nederland',
    description: 'Interactieve kaart met alle regenmeetlocaties in Nederland',
    type: 'website',
    locale: 'nl_NL',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body className={`${inter.className} antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
