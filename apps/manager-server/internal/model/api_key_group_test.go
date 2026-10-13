package model

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

var (
	groupHashA = strings.Repeat("a", 64)
	groupHashB = strings.Repeat("b", 64)
)

func TestNormalizeAPIKeyGroupsNormalizesAndSorts(t *testing.T) {
	groups, err := NormalizeAPIKeyGroups([]APIKeyGroup{
		{Name: "  业务线/小麦 ", APIKeyHashes: []string{groupHashB, " " + strings.ToUpper(groupHashA) + " ", groupHashB}},
		{Name: "业务线/clawd"},
	}, 42)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	want := []APIKeyGroup{
		{Name: "业务线/clawd", APIKeyHashes: []string{}, UpdatedAtMS: 42},
		{Name: "业务线/小麦", APIKeyHashes: []string{groupHashA, groupHashB}, UpdatedAtMS: 42},
	}
	if !reflect.DeepEqual(groups, want) {
		t.Fatalf("groups = %#v, want %#v", groups, want)
	}
}

func TestNormalizeAPIKeyGroupsAcceptsEmptyList(t *testing.T) {
	groups, err := NormalizeAPIKeyGroups([]APIKeyGroup{}, 1)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if len(groups) != 0 {
		t.Fatalf("groups = %#v, want empty", groups)
	}
}

func TestNormalizeAPIKeyGroupsRejectsInvalidInput(t *testing.T) {
	cases := map[string][]APIKeyGroup{
		"empty name":         {{Name: "   "}},
		"too long name":      {{Name: strings.Repeat("名", APIKeyGroupNameMaxRunes+1)}},
		"duplicate any case": {{Name: "Team/A"}, {Name: "team/a"}},
		"short hash":         {{Name: "g", APIKeyHashes: []string{"abc"}}},
		"non hex hash":       {{Name: "g", APIKeyHashes: []string{strings.Repeat("z", 64)}}},
	}
	for name, groups := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := NormalizeAPIKeyGroups(groups, 1)
			if !errors.Is(err, ErrInvalidAPIKeyGroups) {
				t.Fatalf("err = %v, want ErrInvalidAPIKeyGroups", err)
			}
		})
	}
}

func TestNormalizeAPIKeyGroupsAllowsMaxLengthName(t *testing.T) {
	name := strings.Repeat("名", APIKeyGroupNameMaxRunes)
	if _, err := NormalizeAPIKeyGroups([]APIKeyGroup{{Name: name}}, 1); err != nil {
		t.Fatalf("normalize: %v", err)
	}
}
