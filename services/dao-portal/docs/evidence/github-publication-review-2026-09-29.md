# Revisão para commit e push — 29 de setembro de 2026

Âmbito: verificar os ficheiros destinados ao Git e os dois commits anteriores
(`bf23fe9` e `64088da`) antes do primeiro push deste workspace. Esta revisão trata
da exposição de dados no repositório; não substitui a revisão independente do
módulo de ragequit nem autoriza a sua implantação.

- Inventário inicial: 373 ficheiros candidatos, aproximadamente 22,74 MB; sem
  symlinks, bases locais, backups ou dependências entre os ficheiros candidatos.
- Gitleaks 8.30.1, obtido da release oficial e verificado pelo SHA-256 publicado:
  nenhum alerta nos dois commits anteriores. A leitura adicional dos 537 blobs
  históricos e dos ficheiros candidatos não encontrou correspondências com as
  credenciais locais verificadas, incluindo variantes de codificação e segmentos
  de URLs RPC. Os valores das credenciais não foram impressos nem guardados aqui.
- Os 37 alertas iniciais do scanner no workspace eram os seis endereços públicos
  de contratos da Polygon em campos JSON `key`/`source_key` do índice. A
  configuração `.gitleaks.toml` mantém as regras padrão e acrescenta uma exceção
  limitada a esses endereços, campos e ficheiros JSON de evidência. Não há exclusão
  geral de testes, código, histórico ou documentação.
- `.dev.vars`, `.env.local`, `.wrangler`, `.vercel`, resultados de testes,
  `node_modules` e artefactos de compilação ficam fora do commit. Os exemplos de
  ambiente contêm endpoints públicos ou placeholders.
- As 141 imagens foram revistas numa montagem de miniaturas: são capturas do
  portal e recursos de marca, sem ecrãs de exportação de credenciais. Evidências
  incluem endereços/saldos públicos, identificadores de infraestrutura, caminhos
  locais e metadados operacionais; estes não são tokens de autenticação.
- O workflow GitHub existente executa validações e um dry-run do Worker; não
  publica o portal nem implanta contratos automaticamente.

Validação repetida nesta revisão: tipos do portal e do bot, lint do bot, 95 testes
Vitest do portal, 28 testes do bot, 37 testes locais Solidity (256 casos em cada
teste de fuzz) e build do portal passaram. Os dois testes Solidity dependentes de
RPC foram omitidos nesta execução; a evidência de fork anterior permanece no
repositório. Uma invocação redundante de dois ficheiros Vitest com `node --test`
falhou por utilizar o runner errado; ambos já passaram na suite Vitest completa.
O build mantém o aviso conhecido de bundle JavaScript superior a 500 KB.

Disco: preflight cumulativo de 0,25 GB aprovado com 40,643 GB disponíveis,
preservando a reserva de 40 GB. Dependências e compilação existentes reutilizadas;
o scanner e a cópia temporária apenas dos ficheiros candidatos destinam-se a esta
revisão. Nenhuma base, projeto ou histórico foi eliminado.
