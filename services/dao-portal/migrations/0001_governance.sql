PRAGMA foreign_keys=ON;
CREATE TABLE index_lock (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE lease_guard (owner TEXT NOT NULL);
CREATE TRIGGER validate_index_lease BEFORE INSERT ON lease_guard BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM index_lock WHERE id=1 AND owner=NEW.owner AND expires_at>unixepoch()) THEN RAISE(ABORT,'index lease expired') END;
END;
CREATE TRIGGER clear_lease_guard AFTER INSERT ON lease_guard BEGIN DELETE FROM lease_guard WHERE owner=NEW.owner; END;
CREATE TABLE cursors(chain_id INTEGER NOT NULL,contract TEXT NOT NULL,block_number INTEGER NOT NULL,block_hash TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(chain_id,contract));
CREATE TABLE checkpoints(chain_id INTEGER NOT NULL,contract TEXT NOT NULL,block_number INTEGER NOT NULL,block_hash TEXT NOT NULL,PRIMARY KEY(chain_id,contract,block_number));
CREATE TABLE events(
 chain_id INTEGER NOT NULL,contract TEXT NOT NULL,block_number INTEGER NOT NULL,block_hash TEXT NOT NULL,
 tx_hash TEXT NOT NULL,log_index INTEGER NOT NULL,event_name TEXT NOT NULL,args_json TEXT NOT NULL,
 PRIMARY KEY(chain_id,contract,tx_hash,log_index)
);
CREATE INDEX events_kind ON events(event_name,block_number DESC);
CREATE INDEX events_contract ON events(chain_id,contract,block_number);
CREATE TABLE index_health(id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL,checked_at INTEGER NOT NULL,reason TEXT);
CREATE TABLE snapshot_archive(id TEXT PRIMARY KEY,space TEXT NOT NULL,created_at INTEGER NOT NULL,source_url TEXT NOT NULL,imported_at TEXT NOT NULL,verification TEXT NOT NULL,payload_json TEXT NOT NULL);
