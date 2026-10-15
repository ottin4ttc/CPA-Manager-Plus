package usageevent

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
)

func explainQueryPlan(t *testing.T, db *sql.DB, query string, args ...any) []string {
	t.Helper()
	rows, err := db.Query(`explain query plan `+query, args...)
	if err != nil {
		t.Fatalf("explain query: %v", err)
	}
	defer rows.Close()
	details := make([]string, 0, 8)
	for rows.Next() {
		var id, parent, notUsed int
		var detail string
		if err := rows.Scan(&id, &parent, &notUsed, &detail); err != nil {
			t.Fatalf("scan query plan: %v", err)
		}
		details = append(details, detail)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("query plan rows: %v", err)
	}
	return details
}

// Key-scoped reads used to walk the time-led latency scope index over every
// key's events in the window: 3.5s (p95) for 3 keys over 30 days on the 30GB
// production database. They must seek the API-key-led index instead.
func TestAPIKeyScopedLatencyReadsSeekAPIKeyIndex(t *testing.T) {
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := sqliterepo.RunDerivedStartupMaintenance(context.Background(), db); err != nil {
		t.Fatalf("prepare post-listen indexes: %v", err)
	}
	repo := New(db).(*repository)
	ctx := context.Background()

	filter := businessOutcomeTimeFilter(1_000, 2_000)
	filter.APIKeyHashes = []string{"key-a", "key-b"}
	index, err := repo.latencyScopeIndex(ctx, filter)
	if err != nil {
		t.Fatalf("resolve latency scope index: %v", err)
	}
	if index != apiKeyLatencyScopeIndexName {
		t.Fatalf("key-scoped latency index = %q, want %q", index, apiKeyLatencyScopeIndexName)
	}
	if index, err := repo.latencyScopeIndex(ctx, businessOutcomeTimeFilter(1_000, 2_000)); err != nil || index != latencyScopeIndexName {
		t.Fatalf("unscoped latency index = %q, %v, want %q", index, err, latencyScopeIndexName)
	}

	seek := "SEARCH usage_events USING COVERING INDEX " + apiKeyLatencyScopeIndexName + " (api_key_hash=? AND timestamp_ms>? AND timestamp_ms<?)"
	latencyQuery, latencyArgs := latencyBreakdownQuery(filter, index)
	where, whereArgs := analyticsWhere(filter)
	probeArgs := append(whereArgs, filter.FromMS, filter.ToMS)
	for name, details := range map[string][]string{
		"latency breakdown": explainQueryPlan(t, db, latencyQuery, latencyArgs...),
		"business outcome probe": explainQueryPlan(t, db,
			fmt.Sprintf(businessOutcomeScopedTimelineSQL, businessOutcomeInScopeExpr, where, index), probeArgs...),
	} {
		if !strings.Contains(strings.Join(details, "\n"), seek) {
			t.Fatalf("%s does not seek the API key index: %v", name, details)
		}
	}

	// Until the offline cleanup builds it, key-scoped reads keep the time-led index.
	if _, err := db.Exec(`drop index ` + apiKeyLatencyScopeIndexName); err != nil {
		t.Fatalf("drop API key latency index: %v", err)
	}
	if index, err := repo.latencyScopeIndex(ctx, filter); err != nil || index != latencyScopeIndexName {
		t.Fatalf("key-scoped latency index without the API key index = %q, %v, want %q", index, err, latencyScopeIndexName)
	}
}
