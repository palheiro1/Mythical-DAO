# Ragequit — preparação da implantação, 1 de outubro de 2026

**Pacote preparado e simulado para a carteira escolhida pelo utilizador: `0xc4CCC6A11329558582c2dA79C18a9AEaC00f59F9`. A revisão independente continua pendente; nenhuma transação pública foi assinada ou enviada.**

O módulo mantém o código já revisto internamente em setembro: criação de 5050 bytes, hash `0x710a2b7369fd614a83b89366d3cf7bb57150fec3a54161795fe7fa744f99b24c`. Governor, tesouraria, MANA e a cesta GEM/WETH/USDC nativo conservam os endereços aprovados. Não houve alteração do contrato, do manifesto ativo ou da disponibilidade do ragequit no portal.

## Material para revisão e assinatura posterior

- [Manifesto da versão](../deployments/ragequit-release/review-manifest.json): compilador, argumentos, fontes e hashes.
- [Fontes completas em Standard JSON](../deployments/ragequit-release/compiler-input.json): permite recompilar com solc 0.8.30 sem instalar OpenZeppelin ou outras dependências. O ficheiro inclui as 12 fontes e a configuração exata. A recompilação independente da cadeia de build Foundry produziu o mesmo bytecode de criação e runtime template, sem avisos: [evidência](evidence/ragequit-reproducible-build-2026-10-01.json). Isto verifica reprodutibilidade, não constitui uma revisão independente de segurança.
- [Transação sem assinatura para esta carteira](../deployments/ragequit-release/deployment-wallet-unsigned.json): Polygon 137, criação sem campo `to`, valor nativo zero, nonce, limite de gas e taxas EIP-1559. O script não contém percurso de assinatura ou envio.
- [Brief para revisor independente](INDEPENDENT_REVIEW_BRIEF.md), com escopo, invariantes e critérios de reteste.

O preflight confirmou saldo de **9,312486471740127930 POL** e nonce **298**, iguais nos dois fornecedores, sem transações pendentes detetadas. Ambos estimaram **1 017 449 unidades de gas**; o ficheiro aplica margem de 20%, para **1 220 939**. Com as taxas desse momento, o teto de custo era **0,390773815108879585 POL**. É um limite do ficheiro preparado, não uma promessa de custo nem uma taxa reservada.

O endereço previsto para este remetente e nonce é `0xef06E163F65807872e62b4AB186EffcAFca7C8C9`. **É apenas uma previsão: não é um módulo publicamente implantado, não entra no manifesto ativo e não deve ser usado numa proposta da DAO.** Outra transação desta carteira altera o nonce e a previsão.

Antes de assinar, repetir na pasta `services/dao-portal`:

```sh
npm run preflight:ragequit -- 0xc4CCC6A11329558582c2dA79C18a9AEaC00f59F9
```

O comando usa os dois RPCs de `.dev.vars`, compara fontes/ABI/bytecode com o pacote, verifica rede, blocos recentes e canónicos, saldo/nonce, ausência de código no remetente e de implantação prévia no endereço previsto, simula o construtor e calcula gas/taxas. Recusa diferenças entre fornecedores, nonce pendente, saldo insuficiente, fonte alterada ou transação com destinatário/valor/rede diferentes. Confere novamente o nonce e os hashes dos blocos no fim. A recomendação de atualizar após cinco minutos é apenas do processo de revisão; uma transação de criação não tem expiração on-chain.

## Ensaios concluídos

| Verificação | Resultado e evidência |
|---|---|
| Contratos atuais | Dois RPCs concordaram no bloco **94764472**; módulo ainda ausente. [Relatório](evidence/ragequit-preflight-chain-2026-10-01.json). |
| Construtor com a carteira escolhida | Dois RPCs concordaram no bloco **94764663**, incluindo todas as cópias imutáveis; runtime de 4210 bytes, hash `0x038f9c83bd7b3d3eb98c06770652a31e9f38cfa52fd7d79517e1a1c6ff3f1eb7`. [Relatório e transação](../deployments/ragequit-release/deployment-wallet-unsigned.json). |
| Script de implantação | `DeployRagequit.s.sol` passou sem broadcast no fork **94764727**, com a carteira indicada. Exatamente uma criação, mesmo init code, nonce, endereço previsto e valor zero. [Conferência do artefacto](evidence/ragequit-deployer-script-2026-10-01.json), [saída sanitizada](evidence/ragequit-deployer-script-2026-10-01.txt). A estimativa própria do Foundry foi 0,7500 POL, com margem/taxas diferentes; também coberta pelo saldo. |
| Módulo e Governor real | **16 testes passaram, zero falhas e zero skips**, incluindo 2048 casos de fuzz. Fork **94764463**: proposta/voto/execução de autorização e revogação no Governor real, cancelamento, saídas GEM/WETH/USDC, receita USDC posterior e reversão da queima/pagamentos com USDC pausado. [Evidência](evidence/ragequit-preflight-tests-2026-10-01.txt). |
| Scripts e portal | **140 testes passaram**, dos quais 18 cobrem preparação/identidade/propostas do módulo. Tipos e build passaram. O bundle mantém o aviso anterior de tamanho superior a 500 KB; não houve alterações visuais nesta entrega. |
| Compilação reproduzível | Criação e runtime template exatamente iguais a partir do Standard JSON, com solc 0.8.30 e zero avisos. |

O fork cria os saldos/votos necessários apenas no ambiente simulado. A autorização é sempre obtida pelo ciclo real de governação, nunca substituída por uma chamada isolada privilegiada a `approve`.

## Análise estática e triagem técnica

Reutilizado **Slither 0.11.6**, com solc 0.8.30, optimizer 200 e Cancun, sem excluir detetores ou dependências. A análise terminou com sucesso e emitiu **51 alertas: 3 High, 12 Medium, 6 Low e 30 Informational**. A saída não é apresentada como uma análise sem alertas. O [relatório compacto](evidence/ragequit-slither-2026-10-01.json) preserva todos os IDs, gravidades, confiança e descrições; o hash do relatório bruto permite conferir a cópia local preservada em `.task-ragequit-review/slither-raw-2026-10-01.json` na raiz do repositório.

| Detetor | Triagem interna e evidência |
|---|---|
| `arbitrary-send-erc20` — High | O `from` é a tesouraria imutável, e o pagamento depende da queima de MANA do próprio chamador e da fórmula proporcional. É a autorização contínua decidida pela DAO; não permite escolher outra origem ou montante arbitrário. Testes de limite do saldo próprio, autorização insuficiente e conservação passaram. Este limite económico deve continuar a ser revisto externamente. |
| `reentrancy-balance` — High | A leitura anterior é deliberadamente usada para conferir a diferença após a queima. `nonReentrant` é aplicado antes das chamadas; os testes de reentrada, queima incompatível e alteração de outro ativo após pagamento revertem integralmente. Não foi demonstrada exploração por este alerta; a triagem não substitui a revisão externa. |
| `incorrect-exp` — High | Refere-se ao XOR intencional `(3 * denominator) ^ 2` que inicializa o inverso modular em `Math.mulDiv` da OpenZeppelin. Não é uma potência omitida. Os comentários da dependência documentam o algoritmo; fuzz e o teste de overflow intermédio passaram. |
| `divide-before-multiply` — 9 Medium | São operações do algoritmo de divisão exata/inverso modular em `Math.mulDiv` e do algoritmo euclidiano em `Math.invMod` da dependência. `invMod` não é chamado pelo módulo. Não alterar a biblioteca por causa destes padrões sem demonstração de erro. |
| `uninitialized-local` — 3 Medium | `positive` começa com o valor padrão `false`; os dois arrays fixos de memória têm todos os três elementos escritos antes da utilização. Os percursos de quota zero e saída positiva são exercitados. |
| `missing-zero-check` — 1 Low | O construtor exige `code.length != 0` para cada um dos cinco endereços, incluindo a tesouraria. Um endereço nulo não satisfaz a condição. A configuração de implantação também fixa os cinco contratos aprovados. |
| `calls-loop` — 4 Low | Laços limitados aos três ativos fixos, sem coleção expansível controlada pelo utilizador. A falha de qualquer ativo bloqueia a saída integralmente, conforme o desenho. |
| `timestamp` — 1 Low | O timestamp implementa o prazo fornecido pelo membro; não é fonte de aleatoriedade nem cálculo de preço. Não promete precisão de inclusão da transação. |
| 30 Informational | Assembly e literais das dependências, pragmas com intervalos diferentes, avisos sobre versões antigas admitidas pelos pragmas e complexidade de `redeem`. A versão efetivamente compilada é 0.8.30. As fontes e a configuração exatas estão no pacote, para apreciação externa. |

A revisão interna não identificou uma alteração necessária ao contrato a partir destes alertas. **Não atribui aprovação independente nem certificação de segurança.** Os pressupostos sobre administradores dos tokens, ausência de pausa imediata, possibilidade de despesa/revogação pela DAO e ausência de reservas de saída permanecem no [modelo de ameaças](THREAT_MODEL.md).

## Próxima decisão e ativação

O trabalho técnico está preparado para entregar ao revisor independente. Falta designar esse revisor e obter o relatório sobre os hashes exatos. Depois da revisão aceite: atualizar o preflight, assinar a implantação na carteira indicada, verificar recibo/runtime/imutáveis, só então preencher o endereço real e gerar a proposta da DAO. Autorização, votação/execução e pequena saída real consentida continuam etapas separadas.

## Recursos locais

Preflight de disco com pico adicional estimado de 3 GB aprovado: 357 689 757 696 bytes livres antes e 357 679 407 104 na medição após ensaios/build. Diferença global de cerca de 10 MB, sem crescimento inesperado. Dependências, Foundry, solc e Slither existentes reutilizados; nenhum download ou nova instalação. Evidência anterior e caches de outras tarefas preservados.
