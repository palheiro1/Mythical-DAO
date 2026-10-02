# The Seekers’ Camp — implementação e preview

Data: 2026-10-02. Âmbito: apresentação e experiência do portal existente.

## Entrega

Preview publicado: **https://dao-preview.mythicalbeings.io**.

- Mapa original diurno/noturno, com seis ligações HTML para as rotas existentes. Em ecrãs pequenos, marcadores numerados e diretório de destinos; alvos de toque de 44 px.
- Navegação interior com Back to camp, nomes narrativos acompanhados da função, ícones por local e acesso ao guia. Propostas mantêm os seus endereços e descrições.
- Papel creme e turquesa no tema claro; floresta noturna e luz quente no escuro. Preferência System/Light/Dark existente preservada. Cinzel Decorative servida localmente; formulários, números e texto corrido em fonte de sistema.
- Tesouraria organizada por ativo, cartões de propostas mais comparáveis, diálogos e formulários coerentes; disponibilidade e sincronização em faixas compactas com detalhes expansíveis.
- Formatação central por identidade do ativo configurado: GEM/MANA inteiros; USDC e USDC.e com duas casas; WETH com 4/6/8; POL/WPOL com até seis e taxas até oito. Agrupamento inglês, aproximação explícita, limiares para frações mínimas, zero distinto de indisponibilidade.
- Valores apresentados permitem revelar o montante exato com botão acessível. Autorizações máximas mantêm Unlimited (revocable). Nas revisões, os montantes de pagamentos, queima, mínimos e autorizações continuam exatos; a taxa estimada mostra também o valor exato diretamente.
- `amount()` não foi arredondado: Max, introdução de montantes, rascunhos, cálculos e calldata mantêm inteiros e strings decimais exatos.

O Worker, as APIs, os contratos, as delegações, o manifesto ativo e o bot não foram modificados por este redesenho. Não foram enviadas transações reais de governação ou de saída durante a validação. A narrativa não acrescenta missões, recompensas nem atividade fictícia. A referência narrativa é o plano aprovado; não se atribuem ao artigo do Medium detalhes que não foram lidos.

## Validação

| Verificação | Resultado |
| --- | --- |
| Tipos e build (`npm run build`) | Aprovados |
| Testes unitários/API/scripts (`npm test`) | 162 aprovados, 24 ficheiros |
| Browser local, desktop e mobile | 81 aprovados, 13 omitidos intencionalmente |
| Browser no domínio público, sem fixtures de API | 6 aprovados |
| 390 / 768 / 1440 px, temas claro e escuro | Aprovados |
| Reflow 320 px e ampliação CSS 200% | Aprovados |
| Axe WCAG A/AA nas páginas, formulários e estados testados | Sem violações detetadas |
| Teclado, foco, Escape, alterações de tema e movimento reduzido | Aprovados |
| Falha da imagem do mapa | Ligações e diretório continuam operacionais |
| Valores grandes, arredondamento, frações mínimas, zero, indisponibilidade, máximo uint256 | Aprovados |
| Max com 18 casas e pedido de saída com inteiro original | Aprovados |
| Rascunhos antigos, revisão e calldata enviada à carteira simulada | Preservados |
| Voto, execução, cancelamento, delegação, carteira/rede, assinatura rejeitada e recibos revertidos | Testes de regressão aprovados |
| Verificação de segredos nos artefactos estáticos, Gitleaks | Nenhuma ocorrência |
| HTML, quatro imagens e fonte publicados | HTTP 200 e hashes iguais ao build local |

Os 13 testes omitidos são os dois ensaios de fork que exigem um ambiente Polygon preparado e onze repetições mobile da matriz visual que já percorre explicitamente as larguras no runner desktop. Esta entrega não reexecutou transações reais num fork. A acessibilidade foi avaliada por semântica, teclado, foco e Axe; não equivale a uma sessão manual com todos os leitores de ecrã.

Foi corrigida uma espera insuficiente no teste de imagens: agora aguarda que terminem de carregar. Após reconstruir `dist`, foi necessário reiniciar o servidor local Wrangler para renovar o índice dos artefactos; uma execução interrompida que encontrava 404 foi substituída pela execução completa aprovada.

O build mantém o aviso de bundle JavaScript superior a 500 kB (718.85 kB / 210.30 kB gzip). Não foram acrescentadas dependências. As imagens responsivas têm aproximadamente 130/99 kB no telemóvel e 458/309 kB no desktop; apenas a variante do tema ativo é pedida.

### Evidência

- [Resultados unitários](evidence/seekers-camp-2026-10-02/unit-tests.txt)
- [Resultados de browser](evidence/seekers-camp-2026-10-02/browser-tests.txt)
- [Build](evidence/seekers-camp-2026-10-02/build.txt)
- [Browser público](evidence/seekers-camp-2026-10-02/public-browser-tests.txt)
- [Verificação pública de artefactos e API](evidence/seekers-camp-2026-10-02/public-verification.json)
- [Verificação de segredos](evidence/seekers-camp-2026-10-02/static-secret-scan.txt)

## Capturas comparativas

As capturas antigas permanecem intactas em `evidence/visual/`. As matrizes novas usam dados de teste controlados, para permitir comparação visual estável; propostas e números dessas capturas não representam atividade real. Os ficheiros `public-overview-*` foram obtidos no preview público, com a API existente.

| Vista | Antes | Depois |
| --- | --- | --- |
| Entrada clara, 1440 px | [Anterior](evidence/visual/overview-light-1440.png) | [Acampamento](evidence/seekers-camp-2026-10-02/overview-light-1440.png) |
| Entrada escura, 390 px | [Anterior](evidence/visual/overview-dark-390.png) | [Acampamento](evidence/seekers-camp-2026-10-02/overview-dark-390.png) |
| Saída escura, 390 px | [Anterior](evidence/visual/controlled-exit-preview-dark-390.png) | [Nova](evidence/seekers-camp-2026-10-02/controlled-exit-preview-dark-390.png) |

[Preview público claro, 1440 px](evidence/seekers-camp-2026-10-02/public-overview-light-1440.png) · [Preview público escuro, 390 px](evidence/seekers-camp-2026-10-02/public-overview-dark-390.png).

Todos os percursos e temas têm capturas adicionais na [pasta da entrega](evidence/seekers-camp-2026-10-02/). Ilustrações, prompts de geração, variantes, licença da fonte e hashes estão documentados em [CAMP_ASSETS.md](CAMP_ASSETS.md). Assets finais: [dia](../public/camp/day.webp), [noite](../public/camp/night.webp), [dia mobile](../public/camp/day-small.webp), [noite mobile](../public/camp/night-small.webp).

## Publicação e reversão

Projeto Vercel: `mythical-dao-preview` (`prj_0vM52DURDanudxowbZKwzWMcIdnd`). O target production deste projeto corresponde ao ambiente de preview já existente.

- Novo deploy: `dpl_B3bGjqjkX6EAUsqvLHJtBXjaNf1z`.
- URL imutável: https://mythical-dao-preview-i5cvptzis-palheiro1s-projects.vercel.app
- Deploy anterior preservado: `dpl_Fce86AymFL1UhLPmPbjvnuJbqVtw`.
- URL anterior: https://mythical-dao-preview-2nkjyjkh5-palheiro1s-projects.vercel.app
- Base Git anterior ao redesenho: `782d4de5e04dc15320f33830edea936d0e7ba8ca`.

Foram enviados apenas os artefactos estáticos prebuilt. A versão foi criada com `--skip-domain`, verificada e depois promovida para o alias de preview. A proteção das URLs imutáveis da Vercel não foi desativada. `/api/*` continua a encaminhar para o Worker staging existente.

Reversão a partir de `services/dao-portal`, com a CLI autenticada e o projeto ligado:

```sh
vercel rollback mythical-dao-preview-2nkjyjkh5-palheiro1s-projects.vercel.app
```

Na verificação pública de 2026-10-02T08:20Z, a API respondeu e o histórico estava em `syncing`, 2.27% global e 2.91% para governação. Estes números são uma fotografia da verificação, não uma previsão de conclusão. O redesenho preserva a distinção entre saldos disponíveis e cobertura histórica incompleta.

## Orçamento de disco

Preflight aprovado antes da geração e builds, com pico adicional estimado de 1.5 GB. Espaço disponível inicial: 350,605,352,960 bytes; na medição final após geração, testes, publicação e encerramento do servidor de teste: 350,458,863,616 bytes. Variação observada de cerca de 146 MB, incluindo outros processos do sistema, abaixo do orçamento previsto. A reserva mínima de 40 GB foi preservada. Foram reutilizadas as dependências existentes; capturas antigas e fontes originais das ilustrações foram mantidas.
