-- Separate supplemental cache. Never advances or replaces the independent D1 index.
ALTER TABLE graph_comparison ADD COLUMN history_json TEXT;
