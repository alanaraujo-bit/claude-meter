# Claude Meter

Painel consolidado de uso das contas Claude Pro: quanto falta para o reset de cada
janela, quanto foi consumido e o custo equivalente em API — visível do computador
e do celular.

## Por que existe

Alternar entre duas contas Pro significa não ter ideia de qual está disponível.
A Anthropic não expõe uma API de uso, e o Claude Code não grava em lugar nenhum
nem a conta ativa nem o horário do reset. Este projeto reconstrói as duas coisas.

## Arquitetura

```
Claude Code (máquina local)
   └─ hook UserPromptSubmit  ──POST──►  Vercel (Next.js)  ──►  Postgres (Railway)
      agent/hook.js                     app/api/ingest              │
                                        app/api/status  ◄───────────┘
                                        app/page.js (painel/PWA)
```

O hook **não é um serviço**. O Claude Code o dispara a cada prompt, ele roda uma
vez e encerra. Está marcado como `async` no `settings.json`, então nunca segura o
prompt. Nada fica rodando em background.

### O que sai da máquina

Apenas metadados de uso, por mensagem:

```json
{
  "message_id": "msg_01ABC…",
  "ts": "2026-07-23T22:49:22.269Z",
  "account": "voce@exemplo.com",
  "model": "claude-opus-4-8",
  "session_id": "238f4a2a-…",
  "project": "c--Users-Alan-Documents-meu-app",
  "input_tokens": 2,
  "output_tokens": 356,
  "cache_write_5m": 10667,
  "cache_write_1h": 0,
  "cache_read": 18046
}
```

Nenhum conteúdo de conversa, nenhum prompt, nenhum caminho absoluto do disco —
`project` é só o nome da pasta.

### Duas restrições que moldam o design

1. **O transcript não registra a conta.** `~/.claude.json → oauthAccount.emailAddress`
   só conhece a conta do momento; ao trocar com `/login`, o histórico anterior fica
   órfão. O hook mantém `~/.claude/meter-ledger.jsonl` e a atribuição usa
   `sessionId` + o timestamp mais recente — o que funciona mesmo trocando de conta
   no meio de uma sessão.

2. **O horário do reset não é gravado em lugar nenhum.** Nem em header, nem em cache
   local. É derivado dos timestamps: a janela de 5h começa na primeira mensagem e
   expira 5h depois.

O custo é **equivalente em API** — quanto o uso custaria pago por token. No Pro você
paga assinatura fixa, então não é gasto real; serve para comparar contas e medir o
valor extraído. Os tokens são exatos; a margem de erro está só na tabela de preços.

## Configuração

### 1. Postgres (Railway)

Provisione um Postgres e copie a connection string. O schema é criado sozinho na
primeira requisição (`lib/schema.sql`).

### 2. Vercel

Conecte este repositório e defina duas variáveis de ambiente:

| Variável       | Valor                                              |
| -------------- | -------------------------------------------------- |
| `DATABASE_URL` | connection string do Postgres do Railway           |
| `INGEST_TOKEN` | segredo aleatório — protege `POST /api/ingest`      |

### 3. Máquina local

`~/.claude/meter-config.json`:

```json
{ "url": "https://SEU-APP.vercel.app/api/ingest", "token": "MESMO_INGEST_TOKEN" }
```

E o hook em `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "node CAMINHO/agent/hook.js", "async": true, "timeout": 10 }
        ]
      }
    ]
  }
}
```

Sem `meter-config.json` o hook só grava o ledger local e não envia nada.

## Rotas

| Rota           | Método | Descrição                                        |
| -------------- | ------ | ------------------------------------------------ |
| `/`            | GET    | Painel                                           |
| `/api/status`  | GET    | Resumo por conta (janela, countdown, custos)     |
| `/api/ingest`  | POST   | Recebe eventos do hook (exige `Bearer` token)    |
| `/api/health`  | GET    | Diz se a app subiu e alcança o banco             |

## Manutenção

Preço de modelo muda em `lib/pricing.js` — commit, e o Vercel publica. Nada muda
na máquina local. O Sonnet 5 já está com a data de virada do preço promocional
(01/09/2026) codificada.
