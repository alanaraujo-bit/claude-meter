'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gauge, ChartColumn, Layers, Settings } from 'lucide-react';

const NAV = [
  { href: '/', label: 'Visão', Icon: Gauge },
  { href: '/estatisticas', label: 'Estatísticas', Icon: ChartColumn },
  { href: '/modelos', label: 'Modelos', Icon: Layers },
  { href: '/ajustes', label: 'Ajustes', Icon: Settings },
];

/**
 * A navegação MUDA DE FORMA entre breakpoints, não só de tamanho:
 * pill flutuante embaixo no mobile, sidebar fixa no desktop. A ordem no DOM
 * coloca o conteúdo antes da nav para leitores de tela.
 */
export default function AppShell({ children }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <main className="main" id="conteudo">
        {children}
      </main>

      <nav className="nav glass-panel" aria-label="Navegação principal">
        <div className="brand">
          <span aria-hidden="true" style={{ fontSize: 18 }}>◵</span>
          Claude Meter
        </div>
        {NAV.map(({ href, label, Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="nav-item"
              aria-current={active ? 'page' : undefined}
            >
              {/* Ativo engrossa o traço em vez de trocar o desenho do ícone. */}
              <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
