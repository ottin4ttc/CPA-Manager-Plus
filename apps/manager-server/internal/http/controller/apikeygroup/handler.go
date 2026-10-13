package apikeygroup

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/app"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/http/middleware"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/http/response"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	apikeygroupsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/apikeygroup"
)

// Path serves the whole reporting group list: GET reads it, PUT replaces it.
const Path = "/v0/management/api-key-groups"

type Handler struct {
	App *app.Context
}

func (h *Handler) Handle(w http.ResponseWriter, r *http.Request) {
	if !middleware.AuthorizePanel(w, r, h.App.AdminAuthService) {
		return
	}
	if strings.TrimRight(r.URL.Path, "/") != Path {
		response.Error(w, http.StatusNotFound, errors.New("not found"))
		return
	}

	switch r.Method {
	case http.MethodGet:
		groups, err := h.App.APIKeyGroupService.List(r.Context())
		if err != nil {
			response.Error(w, http.StatusInternalServerError, err)
			return
		}
		response.JSON(w, http.StatusOK, map[string]any{"items": groups})
	case http.MethodPut:
		var req apikeygroupsvc.SaveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, err)
			return
		}
		groups, err := h.App.APIKeyGroupService.Save(r.Context(), req.Items)
		if err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, model.ErrInvalidAPIKeyGroups) {
				status = http.StatusBadRequest
			}
			response.Error(w, status, err)
			return
		}
		response.JSON(w, http.StatusOK, map[string]any{"items": groups})
	default:
		response.MethodNotAllowed(w)
	}
}
