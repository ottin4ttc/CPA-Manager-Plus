package providerprice_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/providerprice"
	sqliterepo "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/repository/sqlite"
)

func newRepository(t *testing.T) providerprice.Repository {
	t.Helper()
	db, err := sqliterepo.Open(filepath.Join(t.TempDir(), "usage.sqlite"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return providerprice.New(db)
}

func TestReplaceAllKeepsIdsAndRewritesWindows(t *testing.T) {
	ctx := context.Background()
	repo := newRepository(t)
	saved, err := repo.ReplaceAll(ctx, []model.ProviderModelPrice{
		{Provider: "openai-compatible-baidu", Model: "glm-5", Prompt: 1, Completion: 2},
		{
			Provider: "OpenAI_Compatible-DeepSeek", Model: "deepseek-flash", Prompt: 2, Completion: 8,
			CacheRead: 0.2, CacheReadConfigured: true, Note: "v4",
			Windows: []model.ProviderPriceWindow{{StartMinute: 30, EndMinute: 510, Multiplier: 0.5, Label: "off-peak", Weekdays: []int{5, 1}}},
			OffDays: []string{"2026-10-01", "2026-09-25"},
		},
	})
	if err != nil {
		t.Fatalf("replace: %v", err)
	}
	if len(saved) != 2 || saved[1].ID == 0 || len(saved[1].Windows) != 1 || saved[1].Windows[0].ID == 0 {
		t.Fatalf("saved rules = %#v", saved)
	}
	deepseekID := saved[1].ID

	loaded, err := repo.LoadAll(ctx)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(loaded) != 2 || loaded[0].Provider != "openai-compatible-baidu" || loaded[1].Provider != "openai-compatible-deepseek" {
		t.Fatalf("loaded order = %#v", loaded)
	}
	if loaded[1].Note != "v4" || !loaded[1].CacheReadConfigured || loaded[1].CacheRead != 0.2 || loaded[1].Timezone != model.DefaultProviderPriceTimezone {
		t.Fatalf("loaded deepseek = %#v", loaded[1])
	}
	if len(loaded[1].Windows) != 1 || loaded[1].Windows[0].Label != "off-peak" {
		t.Fatalf("loaded windows = %#v", loaded[1].Windows)
	}
	if got := loaded[1].Windows[0].Weekdays; len(got) != 2 || got[0] != 1 || got[1] != 5 {
		t.Fatalf("loaded weekdays = %#v", got)
	}
	if got := loaded[1].OffDays; len(got) != 2 || got[0] != "2026-09-25" || got[1] != "2026-10-01" {
		t.Fatalf("loaded off days = %#v", got)
	}
	if loaded[0].Windows != nil || loaded[0].OffDays != nil {
		t.Fatalf("rule without windows should load empty: %#v", loaded[0])
	}

	saved, err = repo.ReplaceAll(ctx, []model.ProviderModelPrice{{
		Provider: "openai-compatible-deepseek", Model: "deepseek-flash", Prompt: 3, Completion: 9,
		Windows: []model.ProviderPriceWindow{
			{StartMinute: 990, EndMinute: 30, Multiplier: 0.75},
			{StartMinute: 30, EndMinute: 510, Multiplier: 0.5},
		},
	}})
	if err != nil {
		t.Fatalf("second replace: %v", err)
	}
	if len(saved) != 1 || saved[0].ID != deepseekID {
		t.Fatalf("existing provider/model must keep its id: %#v", saved)
	}
	loaded, err = repo.LoadAll(ctx)
	if err != nil {
		t.Fatalf("load after replace: %v", err)
	}
	if len(loaded) != 1 || loaded[0].Prompt != 3 || loaded[0].CacheReadConfigured {
		t.Fatalf("stale rule not removed or update lost: %#v", loaded)
	}
	if len(loaded[0].Windows) != 2 || loaded[0].Windows[0].StartMinute != 30 || loaded[0].Windows[1].StartMinute != 990 {
		t.Fatalf("windows should be rewritten and sorted: %#v", loaded[0].Windows)
	}

	if _, err := repo.ReplaceAll(ctx, nil); err != nil {
		t.Fatalf("clear: %v", err)
	}
	loaded, err = repo.LoadAll(ctx)
	if err != nil || len(loaded) != 0 {
		t.Fatalf("clear result = %#v, %v", loaded, err)
	}
}

func TestReplaceAllRejectsDuplicatesAndInvalidRules(t *testing.T) {
	ctx := context.Background()
	repo := newRepository(t)
	_, err := repo.ReplaceAll(ctx, []model.ProviderModelPrice{
		{Provider: "p", Model: "m", Prompt: 1},
		{Provider: "P", Model: "m", Prompt: 2},
	})
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("duplicate err = %v", err)
	}
	_, err = repo.ReplaceAll(ctx, []model.ProviderModelPrice{
		{Provider: "p", Model: "m", Prompt: 1, Windows: []model.ProviderPriceWindow{
			{StartMinute: 0, EndMinute: 120, Multiplier: 1},
			{StartMinute: 60, EndMinute: 180, Multiplier: 1},
		}},
	})
	if err == nil || !strings.Contains(err.Error(), "overlap") {
		t.Fatalf("overlap err = %v", err)
	}
	loaded, err := repo.LoadAll(ctx)
	if err != nil || len(loaded) != 0 {
		t.Fatalf("failed replace must not persist: %#v, %v", loaded, err)
	}
}

func TestReplaceAllRewritesContextTiers(t *testing.T) {
	ctx := context.Background()
	repo := newRepository(t)
	saved, err := repo.ReplaceAll(ctx, []model.ProviderModelPrice{{
		Provider: "openai-compatible-baidu", Model: "A56S", Prompt: 18.72, Completion: 93.6,
		ContextTiers: []model.ProviderPriceContextTier{
			{ThresholdTokens: 500_000, Prompt: 50, Completion: 150},
			{ThresholdTokens: 272_000, Prompt: 37.44, Completion: 140.4, CacheRead: 3.744, CacheReadConfigured: true},
		},
	}})
	if err != nil {
		t.Fatalf("replace: %v", err)
	}
	priceID := saved[0].ID

	loaded, err := repo.LoadAll(ctx)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	tiers := loaded[0].ContextTiers
	if len(tiers) != 2 || tiers[0].ThresholdTokens != 272_000 || tiers[1].ThresholdTokens != 500_000 {
		t.Fatalf("loaded tiers = %#v", tiers)
	}
	if tiers[0].Prompt != 37.44 || tiers[0].Completion != 140.4 || !tiers[0].CacheReadConfigured || tiers[0].CacheRead != 3.744 || tiers[0].CacheCreationConfigured {
		t.Fatalf("loaded first tier = %#v", tiers[0])
	}

	saved, err = repo.ReplaceAll(ctx, []model.ProviderModelPrice{{
		Provider: "openai-compatible-baidu", Model: "A56S", Prompt: 18.72, Completion: 93.6,
		ContextTiers: []model.ProviderPriceContextTier{{ThresholdTokens: 272_000, Prompt: 40, Completion: 150}},
	}})
	if err != nil {
		t.Fatalf("second replace: %v", err)
	}
	if saved[0].ID != priceID {
		t.Fatalf("existing provider/model must keep its id: %#v", saved)
	}
	loaded, err = repo.LoadAll(ctx)
	if err != nil {
		t.Fatalf("load after replace: %v", err)
	}
	if tiers := loaded[0].ContextTiers; len(tiers) != 1 || tiers[0].Prompt != 40 || tiers[0].CacheReadConfigured {
		t.Fatalf("tiers should be rewritten: %#v", tiers)
	}

	if _, err := repo.ReplaceAll(ctx, []model.ProviderModelPrice{{
		Provider: "openai-compatible-baidu", Model: "A56S", Prompt: 1,
		ContextTiers: []model.ProviderPriceContextTier{{ThresholdTokens: 10, Prompt: 1}, {ThresholdTokens: 10, Prompt: 2}},
	}}); err == nil || !strings.Contains(err.Error(), "duplicate threshold") {
		t.Fatalf("duplicate threshold err = %v", err)
	}
	if _, err := repo.ReplaceAll(ctx, nil); err != nil {
		t.Fatalf("clear: %v", err)
	}
	loaded, err = repo.LoadAll(ctx)
	if err != nil || len(loaded) != 0 {
		t.Fatalf("clear result = %#v, %v", loaded, err)
	}
}
