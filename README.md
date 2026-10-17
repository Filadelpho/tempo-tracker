# Tempo Tracker

Extensão para Chrome que mostra quanto tempo você passa em cada site e ajuda a fechar o dia com mais produtividade. É feita só com HTML, CSS e JavaScript, sem build e sem dependências.

## O que ela faz

- **Rastreio por site:** conta o tempo na aba ativa, só quando você está usando o Chrome. Para de contar depois de 60s sem mexer.
- **Modos (Trabalho, Estudo, Lazer):** cada modo tem seus sites produtivos, distrações, meta diária e favoritos. O mesmo site pode ser produtivo num modo e distração em outro.
- **Agenda automática:** de segunda a sexta é Trabalho e no fim de semana é Lazer. Se você abrir um site de trabalho num dia de lazer, o tempo conta como Trabalho. O Estudo é opcional e você liga no popup.
- **Visão geral ao vivo:** mostra o tempo produtivo, neutro, de distração e de lazer do dia, atualizado a cada segundo.
- **Pomodoro:** ciclos de foco e pausa, com som, notificação e badge no ícone. Cada sessão guarda os sites usados nela.
- **Cronômetro flutuante:** fica no canto das páginas enquanto o foco roda. Dá para arrastar, pausar e destacar numa janela Picture-in-Picture, que fica por cima de tudo.
- **Mascote:** um gatinho que reage à sua produtividade do dia.
- **Prazos:** metas do dia (post-it), contador de copos de água e contagem regressiva para entregas e provas.
- **Relatório semanal:** % produtivo comparado com a semana anterior, gráfico por dia, destaques, sites mais usados e metas. Chega uma notificação toda segunda às 9h (ou domingo às 20h, se você preferir).

## Como instalar

1. Baixe ou clone este repositório.
2. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta do projeto.
4. Fixe o ícone da extensão na barra do Chrome.

Funciona no Chrome 116 ou mais novo, e também no Edge, Brave e Opera.

> **Depois de atualizar os arquivos**, clique em ↻ na extensão em `chrome://extensions`. O popup lê os arquivos novos sozinho, mas o background e o manifest só mudam quando a extensão é recarregada.

## Estrutura

| Pasta / arquivo | O que tem |
|---|---|
| `manifest.json` | Configuração da extensão (Manifest V3) |
| `background.js` | Service worker: rastreio, Pomodoro, notificações e relatório semanal |
| `utils.js` | Funções e configuração padrão, compartilhadas por todas as partes |
| `popup/` | Popup com as abas Hoje, Foco, Prazos e Relatório |
| `options/` | Página de ajustes: modos, agenda, nome, expediente e Pomodoro |
| `widget/` | Cronômetro flutuante (script das páginas) e mini janela |
| `offscreen/` | Página invisível que toca o som de aviso |
| `icons/` | Ícones da extensão |

## Privacidade

Todos os dados ficam no seu computador, em `chrome.storage.local`. Nada é enviado para servidores. A única coisa externa é a fonte Inter, carregada do Google Fonts. Sem internet, a extensão usa a fonte do sistema.
