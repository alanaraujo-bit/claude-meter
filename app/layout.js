import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import AppShell from './components/AppShell.js';

const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: 'Claude Meter',
  description: 'Uso, custo e reset das contas Claude Pro',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Meter' },
};

export const viewport = {
  themeColor: '#0a0a0c',
  width: 'device-width',
  initialScale: 1,
  // Trava o zoom: o app precisa se comportar como nativo, não como página web.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#conteudo" className="sr-only skip">Pular para o conteúdo</a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
