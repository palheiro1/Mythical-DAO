# Deploy de teste — 28 de setembro de 2026

Portal atual: https://dao-preview.mythicalbeings.io

## Infura Free — 29 de setembro

Worker `f6e02799-ffe0-4164-b318-26ffa0587df5` publicado com Infura Core Free como RPC primário do indexador e Tenderly pública como secundário. A migration aditiva de quota foi aplicada na D1 de staging e o cron de um minuto reativado. A chave está em secret do Worker. TypeScript/build, 67 testes e dry-run passaram; as três sondagens históricas de 5000 blocos concordaram. O frontend Vercel e os RPCs das leituras atuais permanecem iguais. [Configuração, quotas e acompanhamento](INFURA_FREE.md).

A primeira execução automática completou as seis fontes; o avanço posterior de Governor/MANA foi confirmado. `/api/health` passou a `syncing`, com assinaturas ainda bloqueadas por o histórico estar incompleto. Os oito registos Snapshot e o arquivo de propostas foram preservados, sem duplicar o cursor Governor/tesouraria. [Evidência de ativação](evidence/infura-free-activation-2026-09-29.json) e [progresso](evidence/infura-free-progress-2026-09-29.json).

O utilizador confirmou entretanto que a ligação real da MetaMask funciona. As referências a desbloqueio pendente abaixo descrevem a verificação anterior. Nenhuma transação on-chain foi assinada nesta integração.

## Atualização — 29 de setembro

Subdomínio próprio verificado na Vercel, com HTTPS válido. Acrescentados apenas o CNAME `dao-preview` e o TXT `_vercel`, preservando registos anteriores. O Worker aceita a nova origem para POST e rejeita origens alheias. A consulta MetaMask devolveu `NONE`; o alias anterior continua existente, mas a sua classificação `BLOCK` não foi resolvida.

Publicadas as correções de dados reais e de mensagens. Os logs identificaram HTTP 429 do PublicNode. O RPC secundário de staging foi substituído por `https://tenderly.rpc.polygon.community`, depois de verificar concordância com dRPC no bloco 94644888. Não houve mudança dos RPCs históricos ou do bot. Os lotes têm no máximo três leituras, conforme a documentação do dRPC. As 15 consultas públicas posteriores passaram; estes serviços públicos continuam sujeitos a limites, sem SLA dedicado.

Dados confirmados: carteira `0xc4CCC6A11329558582c2dA79C18a9AEaC00f59F9` com 33670.936971428589697113 MANA e igual poder de voto, delegada em si própria; tesouraria com 657100.44 GEM, 0.00008 WETH e zero USDC nativo; duas propostas executadas e oito registos Snapshot. Os indicadores dependentes do histórico continuam incompletos.

Tipos/build e 48 testes de dados passaram. O teste de estados indisponível/sincronização/vazio/desatualizado passou em desktop e móvel com `/usr/bin/chromium`; a tentativa inicial não encontrou o executável Playwright esperado e foi repetida com o navegador existente. A extensão MetaMask abriu o pedido de desbloqueio; a conclusão da ligação pelo utilizador e qualquer assinatura real permanecem pendentes.

Evidências: `evidence/custom-domain-2026-09-29.json` conserva a verificação inicial que revelou intermitência; `evidence/public-rpc-concurrency-2026-09-29.json` contém as consultas após a troca; `evidence/custom-domain-final-2026-09-29.json` contém a validação final.

As secções seguintes preservam o contexto da publicação inicial de 28 de setembro; a configuração atual de leitura é dRPC/Tenderly.

Referências dos fornecedores: [limites do dRPC](https://drpc.org/docs/howitworks/ratelimiting) e [endpoint público Polygon da Tenderly](https://tenderly.co/blog/changelog/tenderly-is-a-polygon-public-rpc-provider/). Vercel final: `dpl_FU6HT3mFkj9F6n4tqbX9hBZ5FsMK`; Worker final: `d737e74d-ced3-45dc-96ff-e5f92842840a`.

Projeto Vercel isolado: `mythical-dao-preview`, equipa `palheiro1s-projects`. O alias permanente usa o target production **deste projeto de teste**. O domínio oficial da DAO não foi alterado. Não foi necessário desativar proteção de deployments. O portal tem `noindex` e preserva os headers de segurança.

A API mantém o Worker `mythical-dao-portal-staging` e uma D1 nova e separada (`21fdc00b-6e28-4b64-ab73-5a1117c7d463`). A Vercel encaminha `/api/*` para o Worker. As origens permitidas para POST são a própria API e o URL exato do portal configurado; origens alheias são rejeitadas.

## O que testar

- **Connect wallet**: extensão compatível com Ethereum/Polygon, por exemplo MetaMask, ou navegador incorporado da carteira. É uma ligação de carteira, independente do login do jogo. WalletConnect por QR não está configurado.
- **Treasury**: saldos reais da Polygon, consultados em dois RPCs, com GEM, WETH e USDC nativo distinguidos de POL e USDC.e.
- **Governance**: duas propostas existentes, respetivas ações e estados atuais lidos no Governor.
- **History**: oito propostas do arquivo Snapshot.
- **Delegation**: saldo MANA, votos e representante da carteira ligada, lidos diretamente on-chain.
- Temas claro/escuro e visualização móvel.

## Limitação intencional desta fase

O histórico completo de eventos e delegados ainda não está sincronizado. Os indicadores dependentes desse índice não são apresentados como completos e as ações on-chain permanecem bloqueadas. O módulo de ragequit não está implantado nem configurado.

Os dois eventos `ProposalCreated` foram localizados pela consulta, apenas de leitura, à D1 do bot existente, e confirmados por logs e hashes canónicos de dois RPCs antes da importação idempotente. Não foram inventados eventos, nem avançados cursores para simular completude. O bot e a sua base não foram modificados e não foram enviadas notificações.

Os RPCs públicos impõem limites diferentes: PublicNode serve as leituras recentes, mas poda logs antigos; 1RPC permite os logs históricos verificados, mas limita a pesquisa a 50 blocos. A tentativa agendada no Worker também recebeu uma resposta de limite de utilização do plano, deixando `INDEX_READ_FAILED` na saúde do índice. A indexação tem RPCs próprios e lotes de 50 blocos; o cron de staging ficou desativado para não repetir esse erro. As consultas de saldos continuam a ser feitas em tempo real por dRPC/PublicNode. Antes da ativação de assinaturas, configurar dois serviços de arquivo com capacidade apropriada, reativar o cron de staging, executar o backfill e verificar a saúde do índice.

## Verificação

Build, tipos e os 44 testes de dados passaram, incluindo o novo caso de origem HTTP. A migração D1 foi aplicada na base remota; a proteção da lease foi reescrita com `WHEN`, conservando o comportamento, porque o parser remoto rejeitava o `CASE` interno. Os pagamentos históricos em MANA passaram a mostrar unidades legíveis; MANA continua excluído da cesta de ragequit.

O site publicado foi aberto no Chromium, com navegação, saldos reais, propostas e ausência de erros JavaScript nas verificações efetuadas. A ligação e desconexão foram testadas com um fornecedor EIP-1193 controlado, que rejeita pedidos de assinatura; os dados da conta foram obtidos da API real. Isto não substitui o teste da extensão/carteira do utilizador. Nenhuma transação pública foi enviada.

Evidências: `evidence/vercel-deployment.json`, `evidence/staging-proposals.json` e capturas `evidence/visual/vercel-*.png`.

## Repetir a publicação

Na pasta `services/dao-portal`, reutilizar as dependências existentes e fazer o preflight de disco antes do build:

```sh
npm run build
node scripts/build-vercel-preview.mjs
vercel deploy --prebuilt --prod --scope palheiro1s-projects
```

O projeto deve estar ligado a `mythical-dao-preview` em `.vercel/project.json`. O script usa apenas os assets de `dist` e a rota da API; não publica contratos, ficheiros de ambiente, bases locais ou evidência operacional. Para a API, usar `wrangler deploy --env staging` após validar tipos/testes. Não utilizar `--env production` para este ensaio.

Disco: preflight de 0,3 GB passou com 43,046 GB livres; dependências e CLIs existentes reutilizados, sem instalações. Medição final: 43,014 GB livres, acima da reserva de 40 GB. O output Vercel ocupa menos de 2 MB.
