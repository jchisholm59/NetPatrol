import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NetPatrol | Network Scanner',
  description: 'Modern network monitor and AI analyzer',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NetPatrol',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto border-x border-border shadow-2xl bg-background">
          {children}
        </main>
      </body>
    </html>
  );
}
