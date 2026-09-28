#!/usr/bin/env bash
set -euo pipefail
# Destination should be approved external storage for operational backups.
if [[ $# -ne 2 ]]; then echo "Usage: $0 <staging|production> <existing-export-directory>" >&2; exit 2; fi
environment="$1"
destination="$2"
[[ "$environment" == staging || "$environment" == production ]] || exit 2
[[ -d "$destination" ]] || exit 2
/home/usuario/.local/bin/disk-guard preflight --estimated-gb 1 --path "$destination"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
npx wrangler d1 export DAO_DB --remote --env "$environment" --output "$destination/dao-$environment-$stamp.sql"
sha256sum "$destination/dao-$environment-$stamp.sql" > "$destination/dao-$environment-$stamp.sql.sha256"
echo "Exported public governance index. Verify restore in an isolated database before declaring recovery complete."
