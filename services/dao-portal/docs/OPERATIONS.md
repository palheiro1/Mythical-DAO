# Operação — Governor atual, sem migração

A arquitetura ativa é `deployments/polygon.json`, `schemaVersion: 2`, `architecture: existing-governor`. Governor e tesouraria continuam em `0x7B9e327748462F1038c9D081c98d189b22C60A27`. Apenas `MythicalRagequitModule` é um contrato novo. Os documentos e contratos V2 permanecem como histórico e não fazem parte desta ativação.

## 1. Publicar o portal com a governação existente

O domínio de teste já está publicado e a ligação real foi confirmada pelo utilizador. Para desbloquear a próxima etapa, usar o [preflight dos RPCs e procedimento de indexação histórica](ARCHIVE_INDEXING.md).

O staging usa agora [Infura Core Free para indexação](INFURA_FREE.md), com Tenderly como segunda fonte, enquanto as leituras atuais permanecem em dRPC/Tenderly. A migration `0002_infura_quota.sql` é aditiva. Os limites e procedimentos de recuperação desse modo estão documentados no guia próprio; não reutilizar a chave da wallet nem publicar a chave Infura no frontend.

Reutilizar `node_modules`. Antes de instalações, builds ou cópias substanciais, aplicar o `disk-guard` conforme as instruções do repositório; reservar 40 GB. Não materializar outra cópia do projeto.

1. Configurar os IDs reais de D1 nos ambientes `staging`/`production` de `wrangler.jsonc`, domínio e duas ligações RPC independentes em secrets `RPC_PRIMARY_URL`/`RPC_SECONDARY_URL`. Ambos devem suportar leituras históricas, logs e `eth_simulateV1` com chamadas sequenciais. Nunca colocar chaves privadas no Worker.
2. Aplicar as migrations de forma aditiva. Reutilizar a D1 existente; não apagar `events`, `cursors`, `checkpoints` ou `snapshot_archive`. A nova versão não exige alterações destrutivas de schema.
3. Verificar manifesto e contratos com `npm run contracts:build` e `node scripts/verify-ragequit.mjs deployments/polygon.json docs/evidence/pre-release.json`. As duas URLs são fornecidas pelo ambiente. O módulo pode estar ausente nesta etapa.
4. Fazer catch-up da indexação e verificar `/api/health`. `signingAllowed` depende do acordo atual dos RPCs e da identidade Governor/MANA; cada operação passa ainda pelas suas leituras de elegibilidade e simulação no bloco atual. `historyComplete` mantém a exigência de cursores Governor/MANA canónicos e recentes para métricas e notificações. Não depende da existência do módulo, dos seus saldos ou das suas autorizações. A primeira sincronização desde os blocos de implantação pode ser demorada; manter a indicação de sincronização até terminar. `INDEX_BATCH_BLOCKS` define o teto 1–5000; o tamanho efetivo é ajustado por fonte segundo a [política adaptativa](ADAPTIVE_INDEXING.md). Não fabricar cursores no head para contornar a sincronização.
5. Executar `npm run check`, os testes de navegador, o ensaio de fork e `npm run deploy:check`. Publicar/validar primeiro staging, depois o portal em produção, mantendo o módulo ausente.

O campo histórico `usdc` conserva USDC.e; novos consumidores usam `usdcNative` e `usdcBridged`. Governor/treasury/legacyGovernor apontam ao mesmo endereço, indexado uma única vez. As fontes de Approval têm chaves próprias `token:approval:module` em `cursors` e `checkpoints`, desde o bloco de implantação do módulo, para recuperar autorizações anteriores à sua configuração no portal. Os eventos continuam a guardar o endereço real do token. Reorgs removem apenas eventos órfãos da fonte afetada e os reprocessam; não são uma limpeza do histórico.

O bot Telegram existente continua a seguir Governor e Snapshot. Não mudar automaticamente o seu modo, não publicar notificações de teste e não executar uma troca de serviço.

## 2. Rever e implantar apenas o módulo

Revisão independente do contrato, dos tokens externos e do relatório de ensaio é uma condição de lançamento do ragequit. Os testes locais não substituem essa revisão.

O [preflight de 1 de outubro](RAGEQUIT_PREFLIGHT.md) inclui a carteira escolhida, fontes completas recompiláveis e o script `npm run preflight:ragequit -- <deployer-address>`. Repetir esse comando antes de assinar: exige correspondência com o pacote revisto, concordância de dois RPCs, ausência de nonce pendente e saldo para o teto de gas. O resultado é apenas uma transação sem assinatura; o endereço previsto nunca deve ser usado no manifesto ou na proposta antes de existir recibo verificado. As taxas/nonce são temporários e o lembrete de atualização não cria expiração on-chain.

```sh
npm run contracts:build
POLYGON_FORK_RPC=<archive-polygon-rpc> npm run rehearse
DEPLOYER_ADDRESS=<deployer> forge script contracts/script/DeployRagequit.s.sol:DeployRagequit --rpc-url <polygon-rpc> --account <encrypted-keystore>
```

O último comando simula, sem `--broadcast`. Depois da revisão, a implantação real usa o mesmo script, explicitamente com `--broadcast`. Ele fixa a rede 137 e os cinco endereços aprovados; implanta apenas o módulo e não autoriza nem move fundos. Não usar o antigo `Deploy.s.sol`, que pertence à arquitetura V2.

Registar o endereço real, transação, bloco, compilador 0.8.30, optimizer 200, EVM Cancun e hash do código revisto. Verificar o código-fonte no explorador com os argumentos de construção na ordem `treasury, MANA, GEM, WETH, USDC nativo`. Acrescentar ao manifesto `contracts.ragequitModule: { address, startBlock }`, usando o bloco real, sem substituir os restantes endereços. O script exige correspondência com o pacote revisto e hashes atuais das fontes, verifica todas as cópias internas de cada imutável e compara o restante runtime. Os getters confirmam a associação de cada endereço. Requer dois hosts HTTPS distintos, heads recentes e hash canónico antes/depois. [Achados e correções da revisão técnica](RAGEQUIT_REVIEW.md).

## 3. Autorizar pela DAO

[Proposta parametrizada para revisão](../deployments/ragequit-authorization.template.json). O endereço de implantação real é a única substituição pendente; nunca usar um endereço fictício para submeter a proposta.

```sh
node scripts/ragequit-proposal.mjs <module-address> deployments/authorize-ragequit.json authorize
node scripts/ragequit-proposal.mjs <module-address> deployments/revoke-ragequit.json revoke
```

Cada ficheiro contém o texto exato, hash da descrição, três ações ERC-20, calldata `propose` e `execute`, e as autorizações esperadas. Conferir todos os destinos: GEM, WETH, USDC nativo, nesta ordem; `value=0`; `approve(module,uint256.max)` na autorização. Os scripts só escrevem ficheiros.

Submeter `propose` ao Governor atual, esperar a votação, votar e executar apenas em `Succeeded`. Não há chamada `queue` nem espera adicional de timelock. Guardar o ID e as transações. O portal também permite construir/rever as ações pelo modo avançado, sem reescrever os bytes dos rascunhos importados.

```sh
node scripts/verify-ragequit.mjs deployments/polygon.json deployments/allowances-authorized.json authorized
```

Este comando deve confirmar as três autorizações **efetivas** iguais a `uint256.max`, no mesmo bloco confirmado, em dois RPCs. A autorização individual do membro é distinta: `MANA.approve(module, amount)` pelo valor exato da saída escolhida.

## 4. Validar uma pequena saída real

Depois da revisão e autorização, validar uma pequena saída consentida por um membro: saldo anterior, oferta, destinatário, mínimos GEM/WETH/USDC, aprovação exata de MANA, evento `RagequitExecuted`, recibo e saldos finais. Guardar evidência da queima e das três diferenças de saldo. Um saldo confirmado de USDC zero é permitido; nunca substituir por USDC.e. Anunciar disponibilidade geral só depois desta etapa. Não foi realizada uma saída real nesta implementação.

## Revogação e incidentes

O procedimento é uma proposta no mesmo Governor com as três chamadas `approve(module,0)`, usando o gerador em modo `revoke`. Após votação e execução, verificar com `node scripts/verify-ragequit.mjs deployments/polygon.json deployments/allowances-revoked.json revoked`. A revogação exige o ciclo normal da DAO; não existe pausa administrativa instantânea. A DAO pode gastar fundos enquanto as autorizações estão ativas. Ocultar a interface não revoga autorizações nem desativa chamadas diretas ao contrato.

Uma pré-visualização vale dois minutos na web. O `deadline` on-chain vale quinze minutos desde a revisão. Alterações de carteira, rede, módulo, cesta, montante, destinatário ou mínimos invalidam a confirmação; saldos e autorizações podem mudar até à inclusão. A simulação final e os mínimos verificam o estado, mas não reservam fundos. Se um pagamento positivo falhar, toda a operação reverte.

Para recuperação de D1, usar o procedimento de backup existente, validar o backup e ensaiar a restauração numa base isolada; preservar cursores, eventos e proveniência Snapshot. `scripts/verify-local-recovery.mjs` continua disponível. Não restaurar dados por cima da produção nem executar resync destrutivo. Backups sensíveis devem permanecer cifrados em armazenamento externo.

Consultar [governação durante o sync e ensaio web em fork](LIVE_GOVERNANCE.md) para a separação entre disponibilidade operacional e histórico.
