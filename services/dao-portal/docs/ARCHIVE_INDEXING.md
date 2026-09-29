# Indexação histórica — pré-requisito operacional

O utilizador confirmou em 29 de setembro de 2026 que a ligação real da MetaMask e o portal no domínio próprio funcionam. O próximo bloqueio é a recuperação completa do histórico, não a ligação da carteira. O Governor e o MANA continuam nos endereços existentes.

## Atualização: Infura Free implementado

O utilizador escolheu Infura Core Free e forneceu a chave localmente. As três amostras de 5000 blocos passaram com Infura/Tenderly, incluindo hashes e logs iguais: [evidência](evidence/infura-free-preflight-2026-09-29.json). A integração tem quota persistente de 2,4 milhões de créditos/dia, espaçamento de chamadas, cooldown após limites, prioridade de governação e retoma por cursores. [Configuração e operação](INFURA_FREE.md). Não é necessário contratar um plano pago para esta configuração; o histórico completo continua dependente da recuperação em curso.

As secções seguintes conservam as sondagens e o procedimento genérico anteriores à escolha do Infura.

## Capacidade verificada em 29 de setembro

Sondagens de leitura de 5000 blocos incluíram o evento real da proposta no bloco 58427770 e a implantação do MANA no bloco 45785116.

| Serviço público | Resultado observado |
|---|---|
| dRPC | Rejeitou consultas históricas de 5000 blocos com código 35. A mensagem diz que intervalos acima de 10000 blocos não são suportados, embora a sondagem fosse menor; não interpretar essa mensagem como capacidade comprovada. |
| Tenderly | Devolveu nove logs na janela inicial do MANA e a proposta antiga. Uma consulta antiga demorou cerca de 10 segundos; outra excedeu 15 segundos. |
| Tatum | Rejeitou a janela, indicando limite de 100 blocos. |
| OnFinality | HTTP 429, solicitando chave própria para maior capacidade. |
| Nodies | Resposta não JSON; não utilizável nesta sondagem. |

As leituras atuais do portal continuam em dRPC/Tenderly. Os fornecedores foram localizados na [lista oficial da Polygon](https://docs.polygon.technology/pos/reference/rpc-endpoints). Não foram criadas contas pagas nem alterados os serviços do bot.

O [preflight reproduzível do par público](evidence/archive-preflight-public-2026-09-29.json) falhou nos três intervalos por rejeição do dRPC (código 35). O head e hash confirmado concordaram; conseguir ler o estado atual não prova capacidade de arquivo.

## Validar dois endpoints de arquivo

### Fornecedor existente no projeto wallet

A pedido do utilizador, foi inspecionado `/home/usuario/Documentos/GitHub/wallet`. O `.env` contém `POLYGON_RPC_URL` e `VITE_POLYGON_RPC_URL` com o mesmo endpoint Alchemy. A chave responde na rede 137; as consultas de 5000 blocos foram rejeitadas explicitamente por a conta estar no plano Free, limitado a dez blocos por chamada `eth_getLogs`. Em janelas de dez blocos, os eventos da implantação MANA (dois logs) e da proposta antiga (um log) coincidiram com a Tenderly, incluindo o hash canónico do bloco. Assim, há acesso histórico, mas não capacidade adequada para o backfill completo com a configuração atual.

Não foi encontrado um segundo fornecedor privado configurado; o código e `.env.example` usam PublicNode como fallback. Não foram alterados o wallet, o plano Alchemy ou as configurações publicadas da DAO. As URLs com chave não foram copiadas para relatórios. [Evidência sem credenciais](evidence/wallet-rpc-discovery-2026-09-29.json). Os limites de plano são também descritos na [documentação Alchemy de Polygon](https://www.alchemy.com/docs/chains/polygon-pos/polygon-po-s-api-endpoints/eth-get-logs).

### Executar o preflight

Criar ou reutilizar um ficheiro local privado com estas duas variáveis; não colocar credenciais em comandos, relatórios, Git ou mensagens:

```dotenv
INDEX_RPC_PRIMARY_URL=https://primeiro-fornecedor/credencial
INDEX_RPC_SECONDARY_URL=https://segundo-fornecedor/credencial
```

Na pasta do portal, com Node já instalado:

```sh
node --env-file=/caminho/privado/rpcs.env scripts/probe-archive-rpcs.mjs docs/evidence/archive-preflight-novo.json
```

O relatório deve usar um nome novo: o comando não substitui evidência existente. Só são guardados hostnames, classes/códigos de erro, blocos, hashes e resultados, sem as URLs privadas. O comando exige HTTPS e hostnames diferentes; o operador deve também confirmar que são fornecedores realmente independentes.

O preflight verifica a rede 137, head recente e próximo nos dois serviços, bloco confirmado, três intervalos de 5000 blocos com eventos históricos conhecidos, igualdade dos logs normalizados e hashes canónicos antes/depois. Uma resposta histórica vazia, mesmo igual nos dois fornecedores, falha quando falta o evento conhecido. O retorno zero significa apenas que estas amostras passaram; não declara o histórico completo, não altera D1 e não habilita assinaturas.

## Retomar o histórico depois do preflight

1. Configurar `INDEX_RPC_PRIMARY_URL` e `INDEX_RPC_SECONDARY_URL` como secrets de staging, retirando os valores públicos homónimos de `vars`. Preservar os RPCs de leitura atuais e o Worker do bot.
2. Configurar `INDEX_BATCH_BLOCKS` segundo o limite comprovado (até 5000) e voltar a ativar o cron do Worker de staging. A implementação atual processa um lote por fonte por execução; a recuperação inicial não é instantânea. Para cerca de 49 milhões de blocos do MANA, 5000 por minuto representam aproximadamente sete dias, sem falhas. Dimensionar uma execução de backfill mais rápida apenas depois de conhecer a capacidade e a quota dos fornecedores.
3. Acompanhar cursores, checkpoints e saúde. Não posicionar cursores artificialmente no head, não apagar o arquivo e não importar logs de uma só origem como se fossem completos.
4. Confirmar recuperação após interrupção/reorg e concordância dos anchors. A governação só pode ser habilitada depois de Governor e MANA estarem canónicos e atualizados. A ausência do módulo de ragequit permanece independente desta verificação.
5. Testar os fluxos de proposta, voto, execução e cancelamento nas condições reais do Governor, com confirmação manual das transações pelo utilizador.

A revisão e implantação do módulo seguem o [pacote para revisão](../deployments/ragequit-release/README.md). A ligação da carteira não constitui revisão independente do contrato nem assinatura da implantação.

Validação local: TypeScript e 53 testes de dados/operacionais passaram. O preflight de disco de 0,3 GB passou com 41,660 GB disponíveis; medição posterior 42,296 GB. Sem instalações, novas cópias do projeto ou alterações a D1 nesta etapa.
