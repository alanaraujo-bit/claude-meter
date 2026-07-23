export const metadata = {
  title: 'Claude Meter',
  description: 'Uso e reset das contas Claude Pro',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#0b0b0f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
