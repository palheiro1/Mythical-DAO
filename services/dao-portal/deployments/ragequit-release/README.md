# Ragequit — pacote corrigido após as revisões, 1 de outubro de 2026

Este pacote substitui a versão de 5050 bytes, preservada em `../historical/ragequit-pre-audit-2026-10-01/`. Não assinar transações desse pacote histórico. Não existe implantação pública registada.

A correção rejeita destinatários iguais a MANA, GEM, WETH ou USDC, além de zero/tesouraria/módulo. A cesta permanece GEM/WETH/USDC nativo. [Correções e resultados](../../docs/AUDIT_REMEDIATION_2026_10_01.md); [avaliação de USDC.e e USDT0](../../docs/RAGEQUIT_CANDIDATE_ASSETS.md).

- `review-manifest.json`: fontes, compilador/configuração e hashes exatos desta versão.
- `compiler-input.json`: 12 fontes completas em Standard JSON, recompiláveis sem instalar dependências.
- `deployment-unsigned.json`: criação de apenas este contrato, Polygon, valor zero, sem assinatura.
- `deployment-simulation.json`: simulação concordante em dois RPCs, sem envio.
- `deployment-wallet-unsigned.json`: remetente escolhido, nonce e taxas estimadas. Repetir o preflight imediatamente antes de assinar; a validade indicada não é uma expiração on-chain.
- `abi.json`: ABI exata do contrato.

Init code: **5318 bytes**, `0x4180449b7b77b9cad40d742b653aaca16d71f39810a5dd62904d4d2d8abe7324`.
Runtime instanciado: `0x3a4c043fc5bac256e18e0c1f1fe2931cdd506f6c38ea22b00a4c3a41783dd73c`. Frontend e Worker incluem este mesmo hash em `shared/generated/ragequit-trust.json`; o endereço do módulo permanece nulo até existir uma implantação verificada.

## Ativação

1. Retestar estas alterações e aceitar a revisão do código exato, seguindo o [brief atualizado](../../docs/INDEPENDENT_REVIEW_BRIEF.md). As análises Claude/Grok são contributos técnicos; `independentReview` continua `pending`.
2. Repetir `npm run preflight:ragequit -- 0xc4CCC6A11329558582c2dA79C18a9AEaC00f59F9`. Conferir pacote/nonce/gas e assinar apenas após a revisão.
3. Guardar recibo, endereço e bloco reais; verificar as fontes. Inserir endereço/bloco em `deployments/polygon.json` e executar `node --env-file=.dev.vars scripts/verify-ragequit.mjs deployments/polygon.json deployments/ragequit-verification.json inspect`.
4. Executar `node scripts/pin-ragequit-deployment.mjs deployments/polygon.json deployments/ragequit-verification.json`. Rever o endereço agora fixado no código; reconstruir e publicar tanto frontend como Worker. A configuração HTTP, sozinha, não pode habilitar um endereço diferente.
5. Gerar as três chamadas de autorização com `scripts/ragequit-proposal.mjs`, submeter/votar/executar pelo Governor atual. Verificar o estado com o modo `authorized`; `VERIFICATION_BLOCK` pode fixar o bloco confirmado da autorização inicial.
6. Para utilização posterior, usar `operational AMOUNT_IN_MANA` como argumentos finais do verificador: por exemplo `node --env-file=.dev.vars scripts/verify-ragequit.mjs deployments/polygon.json deployments/ragequit-verification.json operational 1`. WETH e USDC consomem a autorização máxima. O modo operacional verifica suficiência para a saída escolhida, sem exigir novamente `uint256.max` nem tolerar pagamentos parciais. `revoked` exige as três autorizações zero.
7. Validar uma pequena saída real consentida antes de anunciar disponibilidade geral.

Nenhuma alteração de Governor, tesouraria, MANA, delegações, regras, receitas ou Telegram. O módulo não dispõe de pausa administrativa; a DAO pode revogar autorizações pelo ciclo normal de propostas.
