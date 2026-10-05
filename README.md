# Mythical DAO

Portal sobre o Governor e a tesouraria atuais da Polygon, com um módulo opcional de ragequit para **GEM, WETH e USDC nativo**, queimando MANA. Sem migração de tesouraria, token, delegações ou regras; as votações consultivas continuam no Snapshot.

- [Código e execução local](services/dao-portal/README.md)
- [Estado da implementação e resultados](services/dao-portal/docs/IMPLEMENTATION_STATUS.md)
- [Ativação por etapas, implantação e autorizações](services/dao-portal/docs/OPERATIONS.md)
- [Modelo de ameaças](services/dao-portal/docs/THREAT_MODEL.md)
- [Proposta de autorização para revisão](services/dao-portal/deployments/ragequit-authorization.template.json)
- [Manifesto ativo](services/dao-portal/deployments/polygon.json)
- [Recuperação do sync e validação atual](services/dao-portal/docs/SYNC_RECOVERY.md)
- [Piloto The Graph — Governor e MANA](services/dao-subgraph/README.md)
- [Implantação do piloto no Studio e primeiras comparações](services/dao-subgraph/DEPLOYMENT.md)
- [Pacote para revisão independente do ragequit](services/dao-portal/docs/INDEPENDENT_REVIEW_BRIEF.md)
- [Preparação da implantação do ragequit e carteira escolhida](services/dao-portal/docs/RAGEQUIT_PREFLIGHT.md)

O [portal de teste está publicado](https://dao-preview.mythicalbeings.io), com governação verificada por operação e sincronização histórica ainda em curso. O piloto The Graph foi publicado na rede e a leitura suplementar verificada foi [ativada no preview](services/dao-portal/docs/GRAPH_ACTIVATION.md), com a exceção de chave privada no backend explicitamente aceite; o histórico completo continua por demonstrar. A implantação do ragequit está preparada para a carteira escolhida. A revisão independente/implantação do módulo, a autorização pela DAO e a pequena saída real continuam pendentes. Os contratos da DAO e o serviço Telegram mantêm-se como estavam.

[O plano V2 original](PLAN_MYTHICAL_DAO.md), os seus contratos e a [configuração histórica](services/dao-portal/deployments/polygon-v2.historical.json) foram preservados; não são a arquitetura ativa.
