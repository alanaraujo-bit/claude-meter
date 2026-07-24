'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Send, Smartphone, TriangleAlert } from 'lucide-react';

/** Chave VAPID vem em base64url e a API do navegador exige Uint8Array. */
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isIos = () =>
  typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

export default function Ajustes() {
  const [state, setState] = useState('checando');
  const [msg, setMsg] = useState(null);
  const [devices, setDevices] = useState(null);
  const [busy, setBusy] = useState(false);

  const supported =
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!supported) return setState('sem-suporte');
    (async () => {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? 'ativo' : Notification.permission === 'denied' ? 'bloqueado' : 'inativo');
    })().catch(() => setState('inativo'));
  }, [supported]);

  async function ativar() {
    setBusy(true);
    setMsg(null);
    try {
      const cfg = await (await fetch('/api/config')).json();
      if (!cfg.vapidPublicKey) throw new Error('Servidor sem chave VAPID configurada.');

      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'bloqueado' : 'inativo');
        throw new Error('Permissão negada no navegador.');
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
      });

      const r = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), label: navigator.userAgent.slice(0, 120) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'falha ao registrar');

      setDevices(j.devices);
      setState('ativo');
      setMsg('Notificações ativadas neste dispositivo.');
    } catch (e) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function desativar() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('inativo');
      setMsg('Notificações desligadas neste dispositivo.');
    } catch (e) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function testar() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/push/test', { method: 'POST' });
      const j = await r.json();
      setMsg(j.sent > 0 ? `Enviado para ${j.sent} dispositivo(s).` : 'Nenhum dispositivo inscrito.');
    } catch (e) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const precisaInstalar = isIos() && !isStandalone();

  return (
    <div className="page">
      <header className="page-head">
        <h1>Ajustes</h1>
        <p>Notificações e como o painel obtém os dados.</p>
      </header>

      <div className="stack">
        <section className="card glass-panel fade-up">
          <div className="between">
            <div className="row">
              {state === 'ativo' ? <Bell size={18} /> : <BellOff size={18} />}
              <strong style={{ fontSize: 14 }}>Notificações</strong>
            </div>
            <span className="pill">{state}</span>
          </div>

          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginTop: 12 }}>
            O alerta chega quando uma conta atravessa <strong>65%</strong> e depois{' '}
            <strong>90%</strong> da sua média histórica de janela — uma vez cada, por janela. A
            mensagem diz para qual conta trocar, não só o número.
          </p>

          {precisaInstalar && (
            <div className="insight warn" style={{ marginTop: 14 }}>
              <TriangleAlert size={18} className="ic" aria-hidden="true" />
              <span>
                No iPhone, push só funciona com o app <strong>instalado na tela de início</strong>.
                Toque em Compartilhar → &quot;Adicionar à Tela de Início&quot;, abra por lá e volte
                aqui.
              </span>
            </div>
          )}

          {state === 'bloqueado' && (
            <div className="insight danger" style={{ marginTop: 14 }}>
              <TriangleAlert size={18} className="ic" aria-hidden="true" />
              <span>
                Permissão bloqueada no navegador. Libere nas configurações do site e recarregue.
              </span>
            </div>
          )}

          {state === 'sem-suporte' && (
            <div className="insight" style={{ marginTop: 14 }}>
              <Smartphone size={18} className="ic" aria-hidden="true" />
              <span>Este navegador não suporta Web Push.</span>
            </div>
          )}

          <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
            {state !== 'ativo' ? (
              <button
                className="btn glass-button-accent"
                onClick={ativar}
                disabled={busy || state === 'sem-suporte' || state === 'bloqueado'}
              >
                <Bell size={16} /> Ativar
              </button>
            ) : (
              <button className="btn glass-button" onClick={desativar} disabled={busy}>
                <BellOff size={16} /> Desativar
              </button>
            )}
            <button className="btn glass-button" onClick={testar} disabled={busy || state !== 'ativo'}>
              <Send size={16} /> Testar
            </button>
          </div>

          {msg && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 12, marginBottom: 0 }}>
              {msg}
              {devices != null && ` (${devices} dispositivo(s) inscrito(s))`}
            </p>
          )}
        </section>

        <section className="card glass-panel">
          <strong style={{ fontSize: 14 }}>Como os dados chegam aqui</strong>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, marginTop: 10 }}>
            Um hook do Claude Code dispara a cada prompt, lê apenas os transcripts modificados desde
            o último envio e manda os metadados de uso. Ele não é um serviço: roda junto com o
            Claude Code e encerra. Nenhum conteúdo de conversa sai da máquina — só tokens, modelo,
            horário e conta.
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, marginTop: 10, marginBottom: 0 }}>
            Como o hook dispara no envio do prompt (antes da resposta), o painel reflete o uso a
            partir do prompt seguinte — há sempre um atraso de uma rodada.
          </p>
        </section>
      </div>
    </div>
  );
}
