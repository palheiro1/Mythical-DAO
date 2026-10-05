# Avaliação de USDC.e e USDT na cesta de saída

1 de outubro de 2026. Escopo confirmado pelo utilizador: avaliar apenas USDC.e e USDT. A inclusão foi condicionada a não acrescentar risco relevante. **Decisão desta entrega: conservar GEM, WETH e USDC nativo; não acrescentar os dois candidatos.**

## Verificação

Dois RPCs concordaram no bloco **94768142**, hash `0x6bf8d8e37d24d5260e9cafb0b43d565e7d62ba2c9c85663661be38a617f96572`. [Resultados por endereço](evidence/audit-remediation-2026-10-01/candidate-assets.json).

| Ativo | Endereço Polygon | Identidade lida | Saldo da tesouraria |
|---|---|---|---|
| USDC.e | `0x2791bca1f2de4661ed88a30c99a7a9449aa84174` | USD Coin (PoS), símbolo USDC, 6 decimais | 0 |
| USDT, atualmente USDT0 | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | USDT0, 6 decimais | 0 |

USDC.e continua identificado pelo endereço histórico; o símbolo on-chain USDC não o transforma em USDC nativo. A [Circle distingue os dois endereços](https://help.circle.com/support/en/usdc-supported-blockchains-minting-redemption-faqs?id=kb_article_view&sysparm_article=KB0010590) e não suporta USDC.e da Polygon na sua plataforma de emissão/resgate. O [modelo de USDC bridged](https://www.circle.com/bridged-usdc) depende de um contrato de ponte e de terceiros, ao contrário da emissão nativa.

O endereço anteriormente chamado USDT foi atualizado para USDT0 sem mudança de endereço, conforme o [anúncio da Polygon](https://polygon.technology/blog/native-usdt0-comes-to-polygon-for-lower-fees-and-deeper-liquidity) e o [registo oficial USDT0 para Polygon](https://usdt0.to/ecosystem/polygon). A [documentação técnica de USDT0](https://docs.usdt0.to/technical-documentation/token-features/additional-behavior) descreve blocklist e proxy atualizável; existem ainda dependências de comunicação entre redes. Uma chamada a `paused()` ou `owner()` não reconhecida não prova ausência de controlos administrativos.

## Consequência para este módulo

O contrato exige pagamentos integrais e atómicos. Se uma quota positiva não puder ser transferida, toda a saída reverte, incluindo a queima e os pagamentos anteriores. Acrescentar outro ativo acrescenta outro contrato/controlo externo capaz de impedir a saída. Quota zero permite omitir `transferFrom`, mas o cálculo continua dependente de `balanceOf` de todos os ativos.

Isto é um risco incremental de disponibilidade, não uma demonstração de incompatibilidade ERC-20 nem uma afirmação de que os candidatos são intrinsecamente inseguros. O USDC nativo da cesta atual também tem controlos externos; acrescentar emissores, proxies e pontes aumenta as dependências. Com ambos os saldos a zero neste bloco, não há benefício patrimonial imediato que justifique assumir automaticamente esse risco adicional.

Não foram feitas conversões, transferências, autorizações ou alterações de tesouraria. USDC.e mantém a identificação e visualização histórica. Não foi criado um módulo de cinco ativos nem declarado um ensaio completo de saídas com estes candidatos. Se a DAO quiser incluí-los posteriormente, deve aceitar explicitamente esses riscos, rever a cesta/ABI/evento e repetir os testes e a revisão do novo código antes da implantação; o módulo é imutável.
