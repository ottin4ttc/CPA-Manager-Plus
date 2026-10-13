package sqlite

import "database/sql"

// ensureAPIKeyGroupsSchema creates the reporting group table. Groups are
// stored whole: one row per group with its member hashes as a JSON array.
func ensureAPIKeyGroupsSchema(db *sql.DB) error {
	_, err := db.Exec(`create table if not exists api_key_groups (
		name text primary key,
		api_key_hashes text not null default '[]',
		updated_at_ms integer not null
	)`)
	return err
}
