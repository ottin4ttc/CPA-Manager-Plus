// Package apikeygroup stores the reporting groups that slice usage statistics
// by client API key.
package apikeygroup

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
)

type Repository interface {
	LoadAll(ctx context.Context) ([]model.APIKeyGroup, error)
	// ReplaceAll swaps the whole table in one transaction. Callers pass
	// groups already normalized by model.NormalizeAPIKeyGroups.
	ReplaceAll(ctx context.Context, groups []model.APIKeyGroup) error
}

type repository struct {
	db *sql.DB
}

func New(db *sql.DB) Repository {
	return &repository{db: db}
}

func (r *repository) LoadAll(ctx context.Context) ([]model.APIKeyGroup, error) {
	rows, err := r.db.QueryContext(ctx, `select name, api_key_hashes, updated_at_ms
		from api_key_groups
		order by name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := []model.APIKeyGroup{}
	for rows.Next() {
		var group model.APIKeyGroup
		var hashes string
		if err := rows.Scan(&group.Name, &hashes, &group.UpdatedAtMS); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(hashes), &group.APIKeyHashes); err != nil {
			return nil, fmt.Errorf("decode api key hashes of group %q: %w", group.Name, err)
		}
		if group.APIKeyHashes == nil {
			group.APIKeyHashes = []string{}
		}
		groups = append(groups, group)
	}
	return groups, rows.Err()
}

func (r *repository) ReplaceAll(ctx context.Context, groups []model.APIKeyGroup) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if _, err := tx.ExecContext(ctx, `delete from api_key_groups`); err != nil {
		return err
	}
	stmt, err := tx.PrepareContext(ctx, `insert into api_key_groups (
		name, api_key_hashes, updated_at_ms
	) values (?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, group := range groups {
		hashes := group.APIKeyHashes
		if hashes == nil {
			hashes = []string{}
		}
		encoded, err := json.Marshal(hashes)
		if err != nil {
			return err
		}
		if _, err := stmt.ExecContext(ctx, group.Name, string(encoded), group.UpdatedAtMS); err != nil {
			return fmt.Errorf("insert api key group %q: %w", group.Name, err)
		}
	}
	return tx.Commit()
}
