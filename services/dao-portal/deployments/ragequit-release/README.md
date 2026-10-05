# Ragequit — pacote corrigido após as revisões, 1 de outubro de 2026

Este pacote substitui a versão de 5050 bytes, preservada em `../historical/ragequit-pre-audit-2026-10-01/`. Não assinar transações desse pacote histórico. A implantação pública verificada está em `0xef06E163F65807872e62b4AB186EffcAFca7C8C9`, bloco **94773613**; ver [recibo](deployment-receipt.json). Não voltar a implantar este pacote.

Em 1 de outubro, o utilizador comunicou a aprovação do auditor e autorizou a implantação e a submissão da proposta. A [aceitação registada](review-acceptance.json) associa essa declaração ao init code e runtime abaixo; não atribui identidade ao auditor nem inventa um relatório adicional. A implantação foi assinada pelo utilizador e confirmada; a proposta de autorização foi submetida e confirmada, aguardando o início da votação. [Estado da ativação](../../docs/RAGEQUIT_ACTIVATION_2026_10_01.md).

A correção rejeita destinatários iguais a MANA, GEM, WETH ou USDC, além de zero/tesouraria/módulo. A cesta permanece GEM/WETH/USDC nativo. [Correções e resultados](../../docs/AUDIT_REMEDIATION_2026_10_01.md); [avaliação de USDC.e e USDT0](../../docs/RAGEQUIT_CANDIDATE_ASSETS.md).

- `review-manifest.json`: fontes, compilador/configuração e hashes exatos desta versão.
- `compiler-input.json`: 12 fontes completas em Standard JSON, recompiláveis sem instalar dependências.
- `deployment-unsigned.json`: criação de apenas este contrato, Polygon, valor zero, sem assinatura.
- `deployment-simulation.json`: simulação concordante em dois RPCs, sem envio.
- `deployment-wallet-unsigned.json`: remetente escolhido, nonce e taxas estimadas. Repetir o preflight imediatamente antes de assinar; a validade indicada não é uma expiração on-chain.
- `abi.json`: ABI exata do contrato.

Init code: **5318 bytes**, `0x4180449b7b77b9cad40d742b653aaca16d71f39810a5dd62904d4d2d8abe7324`.
Runtime instanciado: `0x3a4c043fc5bac256e18e0c1f1fe2931cdd506f6c38ea22b00a4c3a41783dd73c`. Frontend e Worker incluem este mesmo hash em `shared/generated/ragequit-trust.json`; o endereço da implantação verificada já está fixado no frontend e no Worker publicados.

## Ativação

1. A aceitação da revisão foi comunicada pelo utilizador e registada como `approved-as-reported-by-user`. Conferir a correspondência do pacote com os hashes aceites; qualquer alteração do contrato exige novo reteste.
2. Implantação concluída; os ficheiros sem assinatura e de simulação foram preservados como evidência da preparação, não devem ser reenviados. O preflight agora recusa duplicar o módulo.
3. Recibo, endereço/bloco e fontes já verificados (Sourcify: criação e runtime exatos). Para repetir a leitura do módulo e autorizações, executar `node --env-file=.dev.vars scripts/verify-ragequit.mjs deployments/polygon.json deployments/ragequit-verification.json inspect`.
4. Executar `node scripts/pin-ragequit-deployment.mjs deployments/polygon.json deployments/ragequit-verification.json`. Rever o endereço agora fixado no código; reconstruir e publicar tanto frontend como Worker. A configuração HTTP, sozinha, não pode habilitar um endereço diferente.
5. As três chamadas de autorização foram geradas e submetidas pelo Governor atual; ver [recibo da proposta](../ragequit-authorization-receipt.json). Aguardar o início da votação e a aprovação/execução pela DAO. Verificar o estado com o modo `authorized`; `VERIFICATION_BLOCK` pode fixar o bloco confirmado da autorização inicial.
6. Para utilização posterior, usar `operational AMOUNT_IN_MANA` como argumentos finais do verificador: por exemplo `node --env-file=.dev.vars scripts/verify-ragequit.mjs deployments/polygon.json deployments/ragequit-verification.json operational 1`. WETH e USDC consomem a autorização máxima. O modo operacional verifica suficiência para a saída escolhida, sem exigir novamente `uint256.max` nem tolerar pagamentos parciais. `revoked` exige as três autorizações zero.
7. Validar uma pequena saída real consentida antes de anunciar disponibilidade geral.

Nenhuma alteração de Governor, tesouraria, MANA, delegações, regras, receitas ou Telegram. O módulo não dispõe de pausa administrativa; a DAO pode revogar autorizações pelo ciclo normal de propostas.
