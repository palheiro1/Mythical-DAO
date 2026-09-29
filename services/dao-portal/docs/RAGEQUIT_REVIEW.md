# Revisão técnica do ragequit — 29 de setembro de 2026

Revisão do módulo e do pacote de implantação/autorização, sem implantação pública. O código Solidity do módulo não mudou: init code de 5050 bytes, hash `0x710a2b7369fd614a83b89366d3cf7bb57150fec3a54161795fe7fa744f99b24c`. Os 12 ficheiros de produção continuam a corresponder aos hashes do pacote preparado. Esta é uma revisão técnica do trabalho de implementação, não uma auditoria independente.

## Achados corrigidos

| ID | Gravidade | Achado e correção |
|---|---|---|
| RQ-01 | Alta, no verificador de implantação | A comparação do runtime apagava todas as posições imutáveis e conferia apenas os getters. Um runtime adulterado podia manter os getters corretos e alterar outra cópia interna do mesmo endereço. Agora cada referência do compilador deve conter exatamente o mesmo endereço dentro do seu grupo; os cinco grupos devem corresponder aos cinco endereços aprovados, sem duplicação. O resto do runtime continua a exigir igualdade exata, e os getters confirmam a associação de cada grupo. Teste reproduz a adulteração de uma cópia diferente. Não foi encontrada uma implantação pública afetada; o módulo permanece por implantar. |
| RQ-02 | Média, no material de autorização | Os geradores aceitavam identidades apenas a partir de um manifesto editável, e o endereço do módulo podia ser o de um token existente. Gerador, preparação e verificador passam a exigir Polygon 137, arquitetura e endereços aprovados, USDC nativo separado de USDC.e, módulo não nulo e distinto dos contratos existentes. Os ficheiros gerados dizem explicitamente que são propostas não assinadas e exigem verificação da implantação. |
| RQ-03 | Média, na evidência de verificação | Duas URLs diferentes do mesmo host eram aceites como fornecedores independentes; não havia nova confirmação do hash no fim. Agora os hosts HTTPS devem ser distintos, os heads próximos e recentes, e o hash do bloco é novamente comparado após as leituras. O token do Governor e os decimais MANA também são conferidos. Com módulo configurado, o artefacto deve corresponder ao pacote revisto e aos hashes das fontes atuais. |

O runtime realmente obtido na simulação do construtor passou a nova verificação de todas as cópias imutáveis nos dois RPCs. O relatório completo com `module: null` verifica os contratos atuais; não constitui verificação de um módulo já implantado.

## Contrato revisto

- `Math.mulDiv` calcula a quota com arredondamento para baixo e oferta anterior à queima, incluindo MANA da tesouraria. Teste adicional cobre multiplicação intermédia superior a uint256.
- `burnFrom(msg.sender, amount)` limita a queima ao chamador e à sua autorização. Delegação não concede autorização de gasto. Testado também um delegado com autorização própria e tentativa de queimar mais do que o seu saldo.
- Os três pagamentos usam `transferFrom` da tesouraria; autorizações insuficientes não reduzem a quota. Cesta fixa por imutáveis, na ordem GEM/WETH/USDC nativo. Não há depósito da cesta, proprietário, upgrade, execução arbitrária ou pausa administrativa.
- Destinatário nulo, tesouraria e módulo são rejeitados. Prazo, mínimos de cada ativo, quotas zero individuais e saída totalmente zero foram exercitados.
- A verificação final cobre oferta, saldo MANA do chamador e os seis saldos da cesta. Testes novos exercitam queima sem efeito, redução do saldo sem redução da oferta, queima excessiva e um hook do último ativo que altera um pagamento anterior. Todos revertem integralmente, incluindo autorizações consumidas na transação.
- `nonReentrant` protege a saída; a revisão inclui os controlos da dependência OpenZeppelin já instalada. O cálculo de preview não reserva saldos nem autorizações.

A DAO conserva capacidade para gastar e revogar pelo seu ciclo normal; não existe janela garantida de saída nem revogação instantânea. Tokens externos continuam sujeitos ao seu próprio comportamento e administração. O ensaio anterior de pausa do USDC real demonstrou reversão integral; a implementação do módulo e o seu hash não mudaram desde esse ensaio.

## Validação

- **15 testes Solidity passaram**, incluindo **2048 casos de fuzz**. [Resultado](evidence/ragequit-review-tests-2026-09-29.txt).
- **5 testes dos scripts passaram**: identidades/cesta, fornecedores, adulteração de runtime, autorização e revogação. As três chamadas geradas são `approve(module, maxUint256)` ou `approve(module, 0)`, com valor nativo zero; os arrays em `propose` e `execute` coincidem.
- **95 testes de dados/scripts**, verificação de tipos e build passaram no conjunto desta entrega. O teste inicial dos mínimos foi ajustado para comparar o erro completo `BelowMinimum(index)` exigido pelo Foundry; não houve alteração do contrato para fazer passar o teste.
- Contratos atuais verificados nos dois RPCs no bloco **94662557**: [relatório](evidence/ragequit-review-chain-2026-09-29.json).
- Criação simulada novamente nos dois RPCs no bloco **94662614**, com todas as cópias imutáveis verificadas. Runtime de 4210 bytes, hash `0x038f9c83bd7b3d3eb98c06770652a31e9f38cfa52fd7d79517e1a1c6ff3f1eb7`: [resultado](evidence/ragequit-review-creation-2026-09-29.json).
- Evidência do ciclo completo de autorização/revogação no Governor real, já executado para o mesmo módulo no fork: [ensaio anterior](evidence/existing-governor-fork-2026-09-29.txt). Não foi repetido nesta revisão, pois as fontes e o init code permaneceram iguais.

## Entrega e próximos passos

[Pacote de implantação](../deployments/ragequit-release/README.md), [proposta parametrizada](../deployments/ragequit-authorization.template.json) e [operação](OPERATIONS.md). A calldata de autorização final depende do endereço efetivamente implantado. Nenhuma autorização foi submetida, nenhum fundo foi movido e nenhuma saída real foi feita nesta revisão.

Revisão independente do pacote exato, implantação/verificação do módulo, votação/execução pela DAO e pequena saída real consentida continuam a ser as etapas de ativação. A revisão atual não preenche artificialmente os campos de ativação no manifesto.
