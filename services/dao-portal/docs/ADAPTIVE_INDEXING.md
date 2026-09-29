# Indexação com lotes adaptativos — 29 de setembro de 2026

O Worker de staging aprende um tamanho de intervalo por fonte, sem alterar os endereços consultados ou saltar blocos pendentes. Worker final: `72f71cdc-5af2-43fd-b85d-13b8c9732cbf` (publicação inicial observada: `abc0ecb4-a68c-4492-ab95-da9d3888bd0f`). O frontend permanece no mesmo bundle `index-C9tIGjEp.js`.

## Política

- `INDEX_BATCH_BLOCKS` continua a ser o máximo, limitado a 5000. Cada fonte começa nesse tamanho, com mínimo de um bloco.
- Timeout de **eth_getLogs**, limite de intervalo/resposta ou mais de 500 logs: reduz para metade e faz no máximo uma repetição menor por fonte e ciclo. O bloco inicial não muda. Se voltar a falhar, guarda o tamanho menor para o ciclo seguinte e permite que outras fontes avancem, dentro do orçamento temporal.
- Leitura de logs bem-sucedida mas com duração de pelo menos 15 segundos: grava os dados normalmente e reduz para metade o próximo lote.
- Três leituras completas consecutivas de até oito segundos: cresce 25%, sem ultrapassar o máximo. Uma consulta curta no head não serve como prova de capacidade para aumentar o intervalo.
- Erros de quota/frequência/cooldown, divergência RPC, reorg e perda de lease não causam tentativas com lotes menores. Os limites e a contabilização persistente do Infura Free permanecem ativos, incluindo pedidos falhados. O caminho de chamadas RPC diretas também passa agora pela mesma contabilização.
- Falhas em consultas de **hash de bloco** não reduzem o intervalo: essas consultas pedem um só bloco, pelo que reduzir getLogs não resolveria a causa. Erros de arquivo ou indisponibilidade geral continuam visíveis e não são contornados.

## Integridade

A migration `0003_index_adaptive.sql` acrescenta apenas a tabela `index_adaptive`; não altera eventos, checkpoints, cursores ou Snapshot. A chave inclui chainId e a fonte completa; as autorizações conservam fontes próprias de proprietário/módulo.

Cada lote continua a exigir concordância dos dois RPCs, hash final antes/depois e o lease válido. Eventos, checkpoint, cursor e estado de sucesso do ajuste são gravados no mesmo `D1.batch`. Uma falha não avança o cursor. O tratamento de reorg existente mantém os filtros e as fontes históricas. As respostas dos dois RPCs terminam antes de uma repetição ou da libertação do lease.

O ciclo deixa de iniciar novas fases de rede após 160 segundos; as chamadas têm os limites existentes de transporte e o lease continua a ter 240 segundos. Não há ciclos ilimitados de repetição nem aumento da quota gratuita.

Referências consultadas: [transações de D1.batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) e [práticas de Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). Tipos atuais 5.20260929.1 consultados sem substituir as dependências instaladas.

## Observação e rollback

Logs estruturados: `index_batch_reduced` inclui fonte, intervalo, causa e próximo tamanho; `index_batch_committed` inclui intervalo confirmado, quantidade de logs, duração e tentativas. Não contêm chaves, URLs RPC nem corpos de pedidos.

Consulta operacional, apenas leitura:

```sh
node_modules/.bin/wrangler d1 execute DAO_DB --env staging --remote --command 'SELECT source_key,span,successes,failures,last_duration_ms,last_reason,updated_at FROM index_adaptive ORDER BY source_key'
```

O painel público continua a mostrar percentagem e estado de sync. Os parâmetros internos do ajuste ficam nos logs/D1, sem alterar o significado da percentagem. Um rollback do Worker pode ignorar a nova tabela; não apagar a tabela nem repor cursores antigos. O Worker anterior `35d075fa-1eb1-4e03-bd13-1d3deb06271d` não depende dela.

## Verificação

95 testes distintos de dados/scripts passaram: suite completa de 94, seguida da repetição dos 28 testes afetados que inclui um novo caso de resposta demasiado grande. Tipos e build passaram. Casos novos exercitam repetição do mesmo início, persistência entre ciclos, aumento gradual, fim do histórico, ausência de duplicação, fontes independentes, quota esgotada e rollback atómico quando o lease expira. Testes existentes de reorg e de Approval continuaram a passar.

Na primeira observação pública, a leitura de logs do Governor durou **34395 ms** e foi confirmada. O próximo tamanho foi reduzido de **5000 para 2500**. Os 18 eventos e oito registos Snapshot anteriores permaneceram presentes. O sync público estava a **0,36%**, com `signingAllowed=true` e histórico incompleto. A adaptação está ativa; não significa que os timeouts do fornecedor tenham desaparecido ou que a sincronização esteja concluída.

[Estado anterior](evidence/adaptive-index-before-2026-09-29.json), [estado posterior](evidence/adaptive-index-after-2026-09-29.json) e [API pública](evidence/adaptive-index-health-2026-09-29.json).

Na observação posterior, as seis fontes avançaram: Governor e MANA e USDC nativo com próximo tamanho de 2500; GEM, WETH e USDC.e com 5000. [D1 após os ciclos](evidence/adaptive-index-final-2026-09-29.json). O contador de eventos continuava em 18 e o arquivo Snapshot em oito. A captura limitada de logs não incluiu um ciclo completo com logs de commit; a comprovação do ajuste remoto é a tabela D1 e a evolução dos cursores.

A última publicação inclui ainda a classificação do limite de resposta Infura e impede que um executor com lease expirado substitua o estado de saúde de outro ciclo. A [verificação HTTP final](evidence/adaptive-index-final-health-2026-09-29.json) mantém `signingAllowed=true`, com histórico incompleto. [Resumo verificável dos testes e cursores](evidence/review-adaptive-validation-2026-09-29.json).

## Disco

Preflight de 0,25 GB passou com 40,747 GB disponíveis; preflight final de publicação passou com 40,725 GB. Dependências e compilador existentes reutilizados, sem clones, instalações ou cópias de bases. O artefacto `out` mede 4,7 MB, `dist` 1,4 MB e o pacote de revisão 80 KB. A reserva de 40 GB foi mantida.
