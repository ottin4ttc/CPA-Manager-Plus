package model

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"
)

// APIKeyGroupNameMaxRunes bounds a reporting group name.
const APIKeyGroupNameMaxRunes = 64

// ErrInvalidAPIKeyGroups marks a group list the client must fix.
var ErrInvalidAPIKeyGroups = errors.New("invalid api key groups")

// APIKeyGroup is a named set of client API keys used only to slice usage
// statistics. CPA never reads it and it does not affect routing. A key may
// belong to any number of groups, and name prefixes carry no meaning.
type APIKeyGroup struct {
	Name         string   `json:"name"`
	APIKeyHashes []string `json:"apiKeyHashes"`
	UpdatedAtMS  int64    `json:"updatedAtMs"`
}

// NormalizeAPIKeyGroups trims names, lowercases and dedupes member hashes,
// sorts both, and stamps every group with nowMS. It rejects empty or too long
// names, names that collide ignoring case, and hashes that are not lowercase
// SHA-256 hex. Errors wrap ErrInvalidAPIKeyGroups.
func NormalizeAPIKeyGroups(groups []APIKeyGroup, nowMS int64) ([]APIKeyGroup, error) {
	normalized := make([]APIKeyGroup, 0, len(groups))
	seenNames := make(map[string]string, len(groups))
	for _, group := range groups {
		name := strings.TrimSpace(group.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: group name is required", ErrInvalidAPIKeyGroups)
		}
		if utf8.RuneCountInString(name) > APIKeyGroupNameMaxRunes {
			return nil, fmt.Errorf("%w: group name %q exceeds %d characters", ErrInvalidAPIKeyGroups, name, APIKeyGroupNameMaxRunes)
		}
		nameKey := strings.ToLower(name)
		if existing, ok := seenNames[nameKey]; ok {
			return nil, fmt.Errorf("%w: group name %q duplicates %q", ErrInvalidAPIKeyGroups, name, existing)
		}
		seenNames[nameKey] = name

		seenHashes := make(map[string]struct{}, len(group.APIKeyHashes))
		hashes := make([]string, 0, len(group.APIKeyHashes))
		for _, rawHash := range group.APIKeyHashes {
			hash := strings.ToLower(strings.TrimSpace(rawHash))
			if !isSHA256Hex(hash) {
				return nil, fmt.Errorf("%w: group %q has invalid api key hash %q", ErrInvalidAPIKeyGroups, name, rawHash)
			}
			if _, ok := seenHashes[hash]; ok {
				continue
			}
			seenHashes[hash] = struct{}{}
			hashes = append(hashes, hash)
		}
		sort.Strings(hashes)
		normalized = append(normalized, APIKeyGroup{Name: name, APIKeyHashes: hashes, UpdatedAtMS: nowMS})
	}
	sort.Slice(normalized, func(i, j int) bool { return normalized[i].Name < normalized[j].Name })
	return normalized, nil
}

func isSHA256Hex(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, char := range value {
		if (char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') {
			continue
		}
		return false
	}
	return true
}
