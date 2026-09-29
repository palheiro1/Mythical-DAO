# Módulo pronto para revisão — 29 de setembro de 2026

Este pacote é material de revisão e simulação. Não existe implantação pública registada e nenhuma transação foi assinada ou enviada.

[Revisão técnica de 29 de setembro](../../docs/RAGEQUIT_REVIEW.md) concluída: verificador de imutáveis reforçado, endereços aprovados fixados nos scripts e 15 testes do módulo aprovados, com 2048 casos de fuzz. O init code permanece igual. A [nova simulação no bloco 94662614](../../docs/evidence/ragequit-review-creation-2026-09-29.json) verificou também todas as cópias imutáveis. A revisão independente continua pendente.

- `review-manifest.json`: compilador, configuração, cinco endereços imutáveis, argumentos do construtor e hashes dos 12 ficheiros Solidity compilados. O gerador verifica os hashes dos ficheiros atuais contra os metadados do compilador.
- `deployment-unsigned.json`: transação de criação para a Polygon, com valor nativo zero. A carteira de implantação terá de definir remetente, nonce e taxas atuais. A ausência de `to` é intencional: cria apenas o módulo.
- `deployment-simulation.json`: dois RPCs executaram o mesmo código de criação em `eth_call`, no mesmo bloco, e devolveram o mesmo runtime. É uma simulação, sem publicação.
- `abi.json`: ABI exata do artefacto compilado.

Init code: 5050 bytes; hash `0x710a2b7369fd614a83b89366d3cf7bb57150fec3a54161795fe7fa744f99b24c`.

O [ensaio atualizado em fork](../../docs/evidence/existing-governor-fork-2026-09-29.txt) passou no bloco 94644170, usando o Governor, MANA, GEM, WETH e USDC nativo reais. Incluiu o ciclo completo de proposta/voto/execução para autorizar e revogar, saída com USDC inicialmente zero, receita posterior de USDC e reversão integral quando o USDC foi pausado no fork. Os endereços e transações de teste só existem nesse fork.

## Revisão antes de implantação

Conferir a fórmula proporcional com a oferta antes da queima, a inclusão dos MANA da tesouraria, a queima apenas do chamador, a ordem GEM/WETH/USDC nativo, mínimos/prazo, atomicidade, proteção de reentrância e diferenças efetivas de saldos. Confirmar a ausência de proprietário operacional, upgrade, pausa e execução arbitrária. Rever também as capacidades administrativas e de bloqueio dos tokens externos.

As autorizações contínuas permitem pagamentos diretos da tesouraria; a DAO mantém o poder de gastar ativos e de revogar autorizações pelo seu ciclo normal de propostas. Não existe pausa instantânea nem período reservado de saída. Os testes e esta revisão técnica não constituem uma auditoria independente; essa revisão continua pendente.

## Ativação

1. Registar a revisão dos hashes exatos deste pacote e escolher a carteira de implantação.
2. Simular novamente `DeployRagequit.s.sol` com esse remetente e conferir o custo apresentado pela carteira.
3. Assinar a implantação de apenas este contrato; guardar endereço, recibo, bloco e verificar o código-fonte e os imutáveis.
4. Inserir o endereço/bloco reais em `deployments/polygon.json` e gerar as propostas de autorização e revogação com `scripts/ragequit-proposal.mjs`.
5. Submeter, votar e executar a autorização pela DAO; verificar as três allowances efetivas.
6. Validar uma saída real pequena e consentida antes de anunciar disponibilidade geral.

A [proposta parametrizada](../ragequit-authorization.template.json) está pronta para revisão. As calldata finais dependem do endereço efetivamente implantado; não usar o endereço do fork.

Para regenerar: `npm run prepare:ragequit-release`. A simulação deve ser refeita depois de qualquer alteração de fontes, parâmetros ou tokens.
