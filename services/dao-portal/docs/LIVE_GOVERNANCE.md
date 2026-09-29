# Governação durante a sincronização histórica

Implementação de 29 de setembro de 2026, sem migração e sem alteração das regras do Governor.

## Disponibilidade e verificações

- `/api/health.signingAllowed`: rede correta, head recente e concordante nos dois fornecedores, e `Governor.token()` igual ao MANA configurado. Não usa o progresso do indexador como autorização.
- `/api/health.historyComplete`: arquivo Governor/MANA completo, recente e com âncoras canónicas. Continua a determinar a completude das métricas e a disponibilidade do feed de notificações. As restantes fontes mantêm as suas percentagens individuais.
- `/api/preflight`: aceita apenas as operações usadas pelo portal: propor, votar, executar, cancelar, delegar, autorizar MANA ao módulo e sair. Lê os requisitos atuais da operação e simula a chamada do membro nos dois RPCs no mesmo bloco; confirma o hash novamente no fim. A UI repete o preflight imediatamente antes de pedir assinatura.
- A autoridade para cancelamento é verificada pela chamada real do próprio Governor, que exige o proponente e estado Pending. Não há timelock.
- Carteira, rede ou configuração alteradas invalidam a revisão, mesmo que se regresse à seleção anterior. Uma assinatura pode ainda ser rejeitada, e uma transação pode reverter se o estado mudar depois da simulação.
- O módulo de ragequit continua ausente. A sua ausência ou falta de autorizações não bloqueia a governação.

## Simulação das ações propostas

As ações futuras são simuladas a partir do Governor. O RPC secundário Tenderly não suporta `eth_simulateV1` e responde com HTTP 503 e código JSON-RPC -32601. A biblioteca perdia esse código quando o pedido era enviado em lote; este método é agora enviado individualmente, mantendo isolamento por pedido e prazo de rede. Existe um teste de regressão para esta resposta específica.

Uma ação única pode ser confirmada por `eth_call` nos dois fornecedores, no mesmo bloco, comparando o resultado com a simulação disponível. Para várias ações, o portal apresenta `complete=false` e exige reconhecimento explícito de que o efeito conjunto não foi verificado. Isso permite publicar para votação, mas não garante a execução. A chamada real `propose()` continua a exigir simulação concordante nos dois RPCs antes de cada assinatura; a execução posterior exige a sua própria simulação integral. Falhas reais de rede ou divergência entre fornecedores continuam a bloquear a revisão.

## Propostas recentes e recuperação

Após confirmar uma publicação, o portal verifica o seu recibo e apresenta a ligação direta. Em Governance, **Find a proposal missing from the history** permite recuperar outra proposta pelo hash da transação de criação.

`POST /api/proposals/resolve` exige um recibo bem-sucedido dirigido ao Governor, evento ProposalCreated emitido pelo Governor, confirmação do bloco pelos dois RPCs e identificador consistente com descrição e ações. Respeita a janela de confirmações configurada. Insere apenas esse evento de forma idempotente; não avança cursores, não limpa D1 e não declara o arquivo completo. A página de detalhe volta a confirmar a âncora do evento e lê o estado no head atual.

## Reproduzir o ensaio web

Com as dependências já instaladas, Chromium e Foundry disponíveis:

```sh
npm run build
POLYGON_FORK_RPC=https://tenderly.rpc.polygon.community node scripts/rehearse-portal.mjs
```

Noutra consola:

```sh
FORK_PORTAL_TESTS=1 PORTAL_TEST_URL=http://127.0.0.1:5175 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser -- tests/browser/portal-fork.spec.ts --project desktop
```

O script faz preflight de disco e usa `POLYGON_FORK_RPC` ou a chave Infura local através de um proxy que só aceita leituras. Anvil escuta apenas em localhost, com chainId 137, fork fixado em 94644170, sem cache de armazenamento e com retenção limitada a 64 estados. A carteira de teste e as leituras de recibos do browser são encaminhadas exclusivamente para esse Anvil. D1 é descartável e não existe cron local.

A fixture move 50 000 MANA da tesouraria **apenas no fork** para um membro de teste. A publicação, voto, execução e cancelamento são transações reais contra o Governor clonado. Mantêm-se os prazos on-chain. No Anvil 1.3.5, o teste salta as esperas alterando apenas o número de bloco num checkpoint vazio local e minerando dois blocos seguintes; compara todos os estados serializados das contas antes/depois para garantir que nenhum saldo, voto ou storage foi alterado. Não simula consenso Polygon nem reorgs neste ensaio web. Os dois clientes RPC locais usam o mesmo Anvil: o ensaio não representa independência de fornecedores, que é verificada separadamente no preview publicado.

Parar o script com SIGINT/SIGTERM encerra os serviços e remove apenas o bundle temporário criado pelo ensaio. Nenhuma transação deste ensaio é enviada à Polygon pública.

## Validação

- 81 testes de dados passaram na execução final, incluindo separação de saúde, identidade errada, reorg de arquivo, recuperação de recibos sem alterar cursores e respostas de simulação não suportada. Typecheck e build passaram.
- 50 casos distintos de browser passaram: 44 de fluxos existentes (42 na execução ampla e os dois casos de recuperação de RPC após corrigir a sequência do teste para atualizar também a saúde), mais 6 de recuperação, visual e reconhecimento de simulação incompleta em desktop e móvel. Os 10 casos de carteira foram novamente executados após a alteração da revisão de lotes.
- Ensaio integral web no fork passou em 27,2 segundos: delegação, recusa de assinatura, mudança de conta/rede, publicação com texto preservado, recuperação de recibo, voto, bloqueio do voto duplicado, execução direta com transferência efetiva de 1 GEM, cancelamento Pending e uma transação real revertida após mudança de estado. [Recibos e verificações](evidence/portal-fork-2026-09-29.json).
- Capturas atualizadas nos dois temas, 390/768/1440 px; reflow 320 px e texto a 200%; axe sem violações no âmbito testado. Os snapshots desativam animações para não capturar a transição entre temas.
- O ensaio final usou o RPC público Tenderly apenas como fonte do fork. Tentativas anteriores tiveram timeouts de rede e sondagens `eth_getAccountInfo` mal classificadas como HTTP 502; o proxy agora responde com o erro JSON-RPC adequado para métodos não suportados e mantém a origem fora dos argumentos dos processos. A fonte Infura do indexador publicado não foi alterada.
- Uma primeira execução da suite de dados teve um timeout durante a mineração maciça; a suite completa passou após limitar recursos. As falhas intermédias do ambiente de ensaio não são apresentadas como resultados aprovados.

## Preview publicado

[Abrir o portal](https://dao-preview.mythicalbeings.io). Vercel: `dpl_EWr14SWLDvAr5uFeNe5bjPXknWPg`, bundle `index-C9tIGjEp.js`. Worker: `35d075fa-1eb1-4e03-bd13-1d3deb06271d`.

Na verificação final, o histórico estava a 0,30%, `historyComplete=false` e `signingAllowed=true`. O preflight de delegação e publicação respondeu 200 para a carteira existente; a ação única respondeu 200 com `ok=true, complete=true`; o lote respondeu 200 com `ok=false, complete=false` e aviso explícito. Foram apenas leituras e simulações: nenhuma transação foi assinada ou enviada na Polygon pública. O navegador carregou o bundle publicado sem erros de JavaScript. [Resultados da API](evidence/live-operations-public-2026-09-29.json) e [captura pública](evidence/visual/live-governance-public-2026-09-29.png).

A sincronização histórica continua incompleta e apresentou timeouts na leitura histórica do RPC secundário. As métricas e listas mantêm essa indicação; o feed de notificações permanece indisponível enquanto o arquivo não for verificado. O cron remoto e a fonte Infura permanecem ativos. Este trabalho não declara o problema histórico resolvido.

## Orçamento de disco

Preflight inicial: 40,871 GB livres, previsão de 0,6 GB. Durante a primeira execução sem limite de estados do Anvil, a memória excedeu 6 GB e o espaço livre global desceu para 39,358 GB. A execução foi interrompida. Não foi possível atribuir toda a descida de disco ao Anvil; os diretórios do projeto e o cache Foundry medidos eram pequenos. `disk-guard maintain` recuperou aproximadamente 0,92 GB em caches npm/pnpm e arquivos de extensões, sem erros ou remoção de projetos. Novo preflight de 0,25 GB passou com 40,429 GB livres. A repetição usa `--prune-history 64`, sem persistência de estados em disco.

Após publicação e encerramento dos serviços locais do ensaio: 40,464 GB livres, acima da reserva de 40 GB. Dependências existentes reutilizadas; nenhuma instalação ou cópia integral do projeto. O bundle e a base temporários do ensaio foram removidos pelo próprio script, preservando relatórios e capturas.
