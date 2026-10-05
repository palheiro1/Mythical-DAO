# Ativação do ragequit — 1 de outubro de 2026

O utilizador comunicou a aprovação do auditor e autorizou a implantação do módulo e a submissão da proposta de autorização. A [declaração de aceitação](../deployments/ragequit-release/review-acceptance.json) está associada ao pacote corrigido de 5318 bytes. A cesta permanece **GEM, WETH e USDC nativo**; USDC.e e USDT0 não foram incluídos.

## Estado atual

- Código, compilador, Standard JSON, ABI, criação sem assinatura e hash fixado na aplicação correspondem ao pacote revisto.
- **Implantação concluída:** [transação](https://polygonscan.com/tx/0xeac0c3add4896dc6a5580273136cbcdc8d6463b41bb725624d3356aac420cba3), módulo `0xef06E163F65807872e62b4AB186EffcAFca7C8C9`, bloco **94773613**. Carteira `0xc4CCC6A11329558582c2dA79C18a9AEaC00f59F9`, nonce 298, valor 0 POL, gas pago **0,286765745324434560 POL**. O [recibo](../deployments/ragequit-release/deployment-receipt.json) foi confirmado por dRPC e Tenderly com 69 confirmações. Campos e logs concordam; apenas a ordem das chaves e o campo opcional `blobGasUsed: 0` diferem na apresentação dos fornecedores.
- **Fontes verificadas:** [Sourcify](https://repo.sourcify.dev/137/0xef06E163F65807872e62b4AB186EffcAFca7C8C9), correspondência exata da criação e runtime. [Resultado](../deployments/ragequit-release/source-verification.json). O serviço também encaminhou a verificação para Etherscan/Blockscout; esses encaminhamentos não são apresentados como confirmação independente da respetiva conclusão.
- Endereço, bloco e hash fixados no manifesto e na aplicação. Os getters e as três autorizações foram [verificados em dois RPCs](../deployments/ragequit-verification.json): **0 / 0 / 0**. Governance permanece disponível; ragequit indisponível por falta de autorização.
- Preview atualizado em `https://dao-preview.mythicalbeings.io`; Vercel `dpl_Fce86AymFL1UhLPmPbjvnuJbqVtw`, Worker `f1259842-669b-4ab8-af57-1e1b0d8ed1b6`. D1, cursores anteriores, chaves e bot Telegram preservados.
- **155 testes / 23 ficheiros**, tipos, build e dry-run Worker passaram. Os testes que modelam ausência de módulo usam agora explicitamente esse estado histórico; acrescentou-se a verificação do endereço efetivamente fixado. O contrato Solidity não sofreu alterações. [Validação](evidence/ragequit-activation-2026-10-01/validation.json).
- [Proposta de autorização](../deployments/ragequit-authorization.json) e [revogação](../deployments/ragequit-revocation.json) materializadas. A [simulação da submissão](../deployments/ragequit-authorization-simulation.json) concordou em dois fornecedores: threshold 0, atraso 41143 blocos, votação 288000 blocos.
- **Proposta submetida e confirmada:** [transação](https://polygonscan.com/tx/0x2eed86cf4eee92383d0e5b6a86bdc2a46e0b097fadef64fc73d98622d3cd8480), bloco **94773983**, nonce 299, gas pago **0,046346287445605440 POL**. O utilizador assinou no Firefox. O ID real é `28380386844107398034034691570755427638127941114420426233333446520814279739334`; descrição, proponente, ações e evento `ProposalCreated` conferidos em dois fornecedores com 253 confirmações. [Recibo verificado](../deployments/ragequit-authorization-receipt.json).
- **[Proposta no portal](https://dao-preview.mythicalbeings.io/#proposal/0x7b9e327748462f1038c9d081c98d189b22c60a27/28380386844107398034034691570755427638127941114420426233333446520814279739334): Pending.** Snapshot/início: **94815126**; fim: **95103126**. Recuperada pelo recibo na API, sem avanço artificial de cursores. Não houve voto, execução ou ragequit real nesta entrega.
- A página local foi concluída e deixou de oferecer assinatura. A conexão pendente observada pelo agente era na extensão do Chrome; o utilizador estava a operar no Firefox e já tinha enviado a transação. O estado on-chain e o registo local de envio impediram nova submissão.

## Continuação

1. Aguardar a passagem do bloco de snapshot **94815126**, depois votar pelo Governor atual. A interface consulta o estado diretamente na Polygon.
2. Após terminar a votação, se aprovada, executar a proposta pelo Governor, sem etapa de timelock. A submissão por si só não concede as autorizações.
3. Verificar as três autorizações efetivas no bloco confirmado da execução. O verificador `authorized` exige os três valores máximos; `operational AMOUNT` verifica suficiência para uma saída posterior.
4. Realizar uma pequena saída real expressamente consentida antes de anunciar disponibilidade geral. O módulo continua sem migração, pausa administrativa ou reserva de fundos. A DAO pode revogar autorizações através da proposta de revogação preparada.

O trabalho local desta etapa teve preflight para 1 GB adicional, com cerca de 355 GB disponíveis. As dependências existentes foram reutilizadas.

## Verificação final

[GitHub CI 36880699410](https://github.com/palheiro1/Mythical-DAO/actions/runs/36880699410) aprovado para `ff5886a`: portal, subgraph e Telegram. No portal: 155 testes de dados/scripts; 44 testes Solidity aprovados e dois ensaios de fork omitidos sem RPC; 71 casos de browser aprovados e 13 omitidos pela matriz de testes. Tipos, compilação, recuperação local e dry-run Worker aprovados. Cinco verificações de browser esperavam ainda o aviso anterior à implantação; foram atualizadas para exigir o aviso de configuração diferente do módulo agora fixado, mantendo o bloqueio da assinatura. O [bundle público](evidence/ragequit-activation-2026-10-01/published-bundle.json) contém o endereço/hash aprovados e nenhuma das chaves dos fornecedores. Código e evidências foram enviados ao GitHub.
