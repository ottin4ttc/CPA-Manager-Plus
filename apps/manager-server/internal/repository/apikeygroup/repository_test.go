package apikeygroup_test

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/apikeygroup"
	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
)

var (
	hashA = strings.Repeat("a", 64)
	hashB = strings.Repeat("b", 64)
	hashC = strings.Repeat("c", 64)
)

func newRepository(t *testing.T) apikeygroup.Repository {
	t.Helper()
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return apikeygroup.New(db)
}

func TestLoadAllReturnsEmptySliceForEmptyTable(t *testing.T) {
	groups, err := newRepository(t).LoadAll(context.Background())
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if groups == nil || len(groups) != 0 {
		t.Fatalf("groups = %#v, want empty non-nil slice", groups)
	}
}

func TestReplaceAllRoundTripsAndOverwrites(t *testing.T) {
	ctx := context.Background()
	repo := newRepository(t)
	first := []model.APIKeyGroup{
		{Name: "业务线/clawd", APIKeyHashes: []string{hashC}, UpdatedAtMS: 1},
		{Name: "业务线/小麦", APIKeyHashes: []string{hashA, hashB}, UpdatedAtMS: 1},
		{Name: "研发/线上", APIKeyHashes: []string{}, UpdatedAtMS: 1},
	}
	if err := repo.ReplaceAll(ctx, first); err != nil {
		t.Fatalf("first replace: %v", err)
	}
	loaded, err := repo.LoadAll(ctx)
	if err != nil {
		t.Fatalf("first load: %v", err)
	}
	if !reflect.DeepEqual(loaded, first) {
		t.Fatalf("loaded = %#v, want %#v", loaded, first)
	}

	second := []model.APIKeyGroup{
		{Name: "业务线/小麦-新", APIKeyHashes: []string{hashB}, UpdatedAtMS: 2},
	}
	if err := repo.ReplaceAll(ctx, second); err != nil {
		t.Fatalf("second replace: %v", err)
	}
	loaded, err = repo.LoadAll(ctx)
	if err != nil {
		t.Fatalf("second load: %v", err)
	}
	if !reflect.DeepEqual(loaded, second) {
		t.Fatalf("loaded = %#v, want %#v", loaded, second)
	}

	if err := repo.ReplaceAll(ctx, []model.APIKeyGroup{}); err != nil {
		t.Fatalf("clear: %v", err)
	}
	loaded, err = repo.LoadAll(ctx)
	if err != nil {
		t.Fatalf("load after clear: %v", err)
	}
	if len(loaded) != 0 {
		t.Fatalf("loaded = %#v, want empty", loaded)
	}
}

func TestReplaceAllRollsBackOnDuplicateName(t *testing.T) {
	ctx := context.Background()
	repo := newRepository(t)
	kept := []model.APIKeyGroup{{Name: "keep", APIKeyHashes: []string{hashA}, UpdatedAtMS: 1}}
	if err := repo.ReplaceAll(ctx, kept); err != nil {
		t.Fatalf("seed: %v", err)
	}
	err := repo.ReplaceAll(ctx, []model.APIKeyGroup{
		{Name: "dup", APIKeyHashes: []string{}, UpdatedAtMS: 2},
		{Name: "dup", APIKeyHashes: []string{}, UpdatedAtMS: 2},
	})
	if err == nil {
		t.Fatal("replace with duplicate names succeeded, want error")
	}
	loaded, err := repo.LoadAll(ctx)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if !reflect.DeepEqual(loaded, kept) {
		t.Fatalf("loaded = %#v, want previous groups %#v", loaded, kept)
	}
}
