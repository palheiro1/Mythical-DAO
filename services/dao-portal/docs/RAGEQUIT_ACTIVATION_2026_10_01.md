# Ativação do ragequit — 1 de outubro de 2026

O utilizador comunicou a aprovação do auditor e autorizou a implantação do módulo e a submissão da proposta de autorização. A [declaração de aceitação](../deployments/ragequit-release/review-acceptance.json) está associada ao pacote corrigido de 5318 bytes. A cesta permanece **GEM, WETH e USDC nativo**; USDC.e e USDT0 não foram incluídos.

## Estado atual

- Código, compilador, Standard JSON, ABI, criação sem assinatura e hash fixado na aplicação correspondem ao pacote revisto.
- **Implantação concluída:** [transação](https://polygonscan.com/tx/0xeac0c3add4896dc6a5580273136cbcdc8d6463b41bb725624d3356aac420cba3), módulo `0xef06E163F65807872e62b4AB186EffcAFca7C8C9`, bloco **94773613**. Carteira `0xc4CCC6A11329558582c2dA79C18a9AEaC00f59F9`, nonce 298, valor 0 POL, gas pago **0,286765745324434560 POL**. O [recibo](../deployments/ragequit-release/deployment-receipt.json) foi confirmado por dRPC e Tenderly com 69 confirmações. Campos e logs concordam; apenas a ordem das chaves e o campo opcional `blobGasUsed: 0` diferem na apresentação dos fornecedores.
- **Fontes verificadas:** [Sourcify](https://repo.sourcify.dev/137/0xef06E163F65807872e62b4AB186EffcAFca7C8C9), correspondência exata da criação e runtime. [Resultado](../deployments/ragequit-release/source-verification.json). O serviço também encaminhou a verificação para Etherscan/Blockscout; esses encaminhamentos não são apresentados como confirmação independente da respetiva conclusão.
- Endereço, bloco e hash fixados no manifesto e na aplicação. Os getters e as três autorizações foram [verificados em dois RPCs](../deployments/ragequit-verification.json): **0 / 0 / 0**. Governance permanece disponível; ragequit indisponível por falta de autorização.
- Preview atualizado em `https://dao-preview.mythicalbeings.io`; Vercel `dpl_Fce86AymFL1UhLPmPbjvnuJbqVtw`, Worker `f1259842-669b-4ab8-af57-1e1b0d8ed1b6`. D1, cursores anteriores, chaves e bot Telegram preservados.
- **155 testes / 23 ficheiros**, tipos, build e dry-run Worker passaram. Os testes que modelam ausência de módulo usam agora explicitamente esse estado histórico; acrescentou-se a verificação do endereço efetivamente fixado. O contrato Solidity não sofreu alterações. [Validação](evidence/ragequit-activation-2026-10-01/validation.json).
- [Proposta de autorização](../deployments/ragequit-authorization.json) e [revogação](../deployments/ragequit-revocation.json) materializadas. A [simulação da submissão](../deployments/ragequit-authorization-simulation.json) concordou em dois fornecedores: ID previsto `28380386844107398034034691570755427638127941114420426233333446520814279739334`, threshold 0, atraso 41143 blocos, votação 288000 blocos. Este ID previsto **não demonstra publicação**.
- **Proposta ainda não enviada.** A página local `http://127.0.0.1:18891/` apresenta apenas esta proposta e aguarda conclusão de um pedido de ligação pendente na MetaMask. O servidor só escuta em loopback, rejeita origens/hosts diferentes e não recebe chaves privadas. O browser não pode abrir a página interna da extensão; o titular deve abrir a MetaMask manualmente.

## Continuação

1. Concluir a ligação da carteira escolhida, repetir a simulação e rever a chamada `propose` na MetaMask: Polygon 137, Governor `0x7B9e327748462F1038c9D081c98d189b22C60A27`, valor 0 POL, três autorizações da tesouraria para o módulo verificado. A assinatura cabe ao titular da carteira.
2. Guardar o hash retornado e conferir recibo/evento `ProposalCreated`, ID, proponente, descrição e ações nos dois RPCs. Se o resultado for incerto, consultar carteira, nonce e rede antes de repetir qualquer envio; a página bloqueia repetições pendentes ou de resultado desconhecido.
3. Recuperar a proposta no portal pelo recibo, sem reiniciar a indexação histórica; fornecer a ligação direta para votação quando abrir.
4. A votação, execução pela DAO e pequena saída real permanecem etapas posteriores. A autorização atual permite implantar e propor; não implica votar, executar ou queimar MANA automaticamente.

O trabalho local desta etapa teve preflight para 1 GB adicional, com cerca de 355 GB disponíveis. As dependências existentes foram reutilizadas.
