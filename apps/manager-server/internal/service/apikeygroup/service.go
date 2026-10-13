// Package apikeygroup manages the reporting groups that slice usage statistics
// by client API key. Groups never reach CPA and do not affect routing.
package apikeygroup

import (
	"context"
	"fmt"
	"time"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/store"
)

type SaveRequest struct {
	Items []store.APIKeyGroup `json:"items"`
}

type Service struct {
	store *store.Store
}

func New(store *store.Store) *Service {
	return &Service{store: store}
}

func (s *Service) List(ctx context.Context) ([]store.APIKeyGroup, error) {
	return s.store.LoadAPIKeyGroups(ctx)
}

// Save replaces every group and returns the stored list. A nil list is
// rejected so a malformed request cannot wipe the table; clearing it takes an
// explicit empty list. Validation errors wrap model.ErrInvalidAPIKeyGroups.
func (s *Service) Save(ctx context.Context, items []store.APIKeyGroup) ([]store.APIKeyGroup, error) {
	if items == nil {
		return nil, fmt.Errorf("%w: items are required", model.ErrInvalidAPIKeyGroups)
	}
	groups, err := model.NormalizeAPIKeyGroups(items, time.Now().UnixMilli())
	if err != nil {
		return nil, err
	}
	if err := s.store.ReplaceAPIKeyGroups(ctx, groups); err != nil {
		return nil, err
	}
	return s.store.LoadAPIKeyGroups(ctx)
}
