package apikeygroup

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/app"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/model"
	adminauthsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/adminauth"
	apikeygroupsvc "github.com/seakee/cpa-manager-plus/apps/manager-server/internal/service/apikeygroup"
	"github.com/seakee/cpa-manager-plus/apps/manager-server/internal/testutil"
)

var (
	hashA = strings.Repeat("a", 64)
	hashB = strings.Repeat("b", 64)
)

func newHandler(t *testing.T) (*Handler, func(method, body string) *httptest.ResponseRecorder) {
	t.Helper()
	cfg := testutil.NewConfig(t)
	st := testutil.NewStore(t, cfg)
	handler := &Handler{App: &app.Context{
		Config:             cfg,
		AdminAuthService:   adminauthsvc.New(cfg, st),
		APIKeyGroupService: apikeygroupsvc.New(st),
	}}
	call := func(method, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, Path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+testutil.AdminKey)
		recorder := httptest.NewRecorder()
		handler.Handle(recorder, req)
		return recorder
	}
	return handler, call
}

func decodeItems(t *testing.T, recorder *httptest.ResponseRecorder) []model.APIKeyGroup {
	t.Helper()
	var payload struct {
		Items []model.APIKeyGroup `json:"items"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode %s: %v", recorder.Body.String(), err)
	}
	return payload.Items
}

func TestHandleRequiresPanelAuthorization(t *testing.T) {
	handler, _ := newHandler(t)
	recorder := httptest.NewRecorder()
	handler.Handle(recorder, httptest.NewRequest(http.MethodGet, Path, nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
}

func TestHandleListsAndReplacesGroups(t *testing.T) {
	_, call := newHandler(t)

	recorder := call(http.MethodGet, "")
	if recorder.Code != http.StatusOK {
		t.Fatalf("initial GET status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	if items := decodeItems(t, recorder); len(items) != 0 {
		t.Fatalf("initial items = %#v, want empty", items)
	}

	body := `{"items":[{"name":"业务线/小麦","apiKeyHashes":["` + hashB + `","` + strings.ToUpper(hashA) + `"]},{"name":"研发/线上"}]}`
	recorder = call(http.MethodPut, body)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT status = %d body = %s", recorder.Code, recorder.Body.String())
	}
	saved := decodeItems(t, recorder)
	if len(saved) != 2 || saved[0].Name != "业务线/小麦" || saved[1].Name != "研发/线上" {
		t.Fatalf("saved = %#v", saved)
	}
	if got := saved[0].APIKeyHashes; len(got) != 2 || got[0] != hashA || got[1] != hashB {
		t.Fatalf("saved hashes = %#v, want normalized [a, b]", got)
	}
	if saved[1].APIKeyHashes == nil || len(saved[1].APIKeyHashes) != 0 {
		t.Fatalf("empty group hashes = %#v, want []", saved[1].APIKeyHashes)
	}

	recorder = call(http.MethodGet, "")
	if items := decodeItems(t, recorder); len(items) != 2 {
		t.Fatalf("GET after PUT items = %#v", items)
	}
}

func TestHandleRejectsInvalidSaves(t *testing.T) {
	cases := map[string]string{
		"duplicate name": `{"items":[{"name":"A"},{"name":"a"}]}`,
		"invalid hash":   `{"items":[{"name":"A","apiKeyHashes":["nope"]}]}`,
		"null items":     `{"items":null}`,
		"missing items":  `{}`,
		"malformed json": `{"items":`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			_, call := newHandler(t)
			recorder := call(http.MethodPut, body)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestHandleRejectsOtherMethods(t *testing.T) {
	_, call := newHandler(t)
	if recorder := call(http.MethodDelete, ""); recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d body = %s", recorder.Code, recorder.Body.String())
	}
}
