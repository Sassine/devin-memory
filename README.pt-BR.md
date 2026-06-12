[English](README.md) · **Português** · [Español](README.es.md)

<p align="center">
  <img src="https://raw.githubusercontent.com/Sassine/devin-memory/main/banner.png" alt="devin-memory — Memória + contexto para o Devin CLI" />
</p>

Nunca mais perca uma sessão do Devin CLI. O **devin-memory** monitora o uso do seu
contexto, avisa *antes* da janela encher e permite salvar e retomar a sessão —
pra que `/clear` deixe de significar "começar do zero".

> Projeto comunitário não-oficial, **sem afiliação com a Cognition AI**.
> "Devin" é marca da Cognition AI.

## Instalação

Na raiz do seu projeto:

```sh
npx devin-memory@latest setup
```

Só isso. Tudo é instalado em `.devin/` — sem dependências, sem servidores, nada
rodando em background. O npm é só o instalador; em runtime tudo é local e offline.

<sub>Sem npm? Clone o repo e rode `node scripts/install.js`.</sub>

## Como funciona

1. **Trabalhe normalmente.** A cada prompt, um hook estima o quão cheio está o contexto.
2. **Acima de ~75% você é avisado** — o agente te lembra, no seu idioma, de salvar.
3. **`/memory-save`** (ou só diga *"salva memória"*) → o estado da sessão vira um
   snapshot em markdown: objetivo, progresso, decisões, arquivos, próximos passos.
4. **`/clear`** — sem ansiedade nenhuma.
5. **`/memory-resume`** (ou *"continua de onde paramos"*) → o agente recarrega o
   snapshot, relê os arquivos relevantes e continua exatamente de onde você parou.

<p align="center">
  <img src="https://raw.githubusercontent.com/Sassine/devin-memory/main/docs/alert-screenshot.png" alt="O aviso do devin-memory no Devin CLI com ~84% de uso de contexto" />
  <br>
  <sub>O aviso em ação — o agente te lembra no idioma em que você estiver escrevendo.</sub>
</p>

Os snapshots são markdown puro em `.devin/memory/snapshots/` — legíveis por você, por
qualquer agente, e committáveis pro seu time (ou pra sandbox da nuvem) receber também.

Funciona em português, inglês e espanhol — o agente sempre responde no idioma em que
você está escrevendo.

## Opções

| Flag | O que faz |
|---|---|
| `--scope user` | Instala o motor uma vez, global, em vez de por projeto |
| `--memory user` | Mantém os dados de memória fora do repo (em `~/.devin-memory/`) |
| `--lang en\|pt-BR\|es` | Fixa o idioma das mensagens de terminal |

Exemplo: `npx devin-memory@latest setup --scope user --lang pt-BR`

## Desinstalação

```sh
npx devin-memory@latest uninstall          # remove o sistema, PRESERVA seus snapshots
npx devin-memory@latest uninstall --purge  # remove tudo, incluindo snapshots
```

## Bom saber

- A estimativa de uso é heurística (caracteres, não tokens reais) — `/context` continua
  sendo o número oficial.
- O `/clear` continua sendo seu; o sistema não consegue limpar por você.
- Rode o `setup` em cada máquina — o registro do hook é local da máquina.

Curioso sobre os detalhes internos (schema do hook, escopos de instalação, i18n,
pegadinhas do CLI)? Veja a [referência técnica](docs/TECHNICAL.md) (em inglês).

## Licença

MIT — veja [LICENSE](LICENSE).
