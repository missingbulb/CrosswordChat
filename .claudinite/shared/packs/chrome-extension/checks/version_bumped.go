package checks

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"claudinite.com/checksdk"
)

// The version belongs to the change. The release flow ships whatever
// version it finds on main and writes none, so a change altering a shipped
// file (one under the release config's ship_paths) without raising the
// manifest's version is never released, and the store rejects an upload
// that is not strictly higher. Work scope: only the diff says whether the
// version moved with the shipped files beside it.
//
// The release config is read as the vendored read-release-config action
// reads it, and the version as the vendored bump-extension-patch action
// does; stubs/ holds both.

const releaseConfigPath = ".github/release.config"

var (
	versionScheme = regexp.MustCompile(`^(\d+)\.(\d+)\.(\d+)$`)
	versionToken  = regexp.MustCompile(`"version":\s*"([^"]+)"`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "version-bumped",
		Tags: []string{"work"},
		Doc:  "packs/chrome-extension/skills/chrome-store-releases/SKILL.md",
		Why:  "the release flow ships the version it finds on main and never writes one, so a shipped change that does not raise the version is never released — create-package no-ops on a version that is already out, and the store rejects an upload that is not strictly higher",
		Run:  versionBumped,
	})
}

// parseReleaseConfig is the release config's KEY=value pairs: blank and #
// lines skipped, a value's matching outer quotes dropped, the last of a
// repeated key kept.
func parseReleaseConfig(text string) map[string]string {
	cfg := map[string]string{}
	for _, raw := range strings.Split(text, "\n") {
		line := strings.TrimFunc(raw, checksdk.IsJSSpace)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.Index(line, "=")
		if eq < 0 {
			continue
		}
		key := strings.TrimFunc(line[:eq], checksdk.IsJSSpace)
		value := strings.TrimFunc(line[eq+1:], checksdk.IsJSSpace)
		if len(value) >= 2 && (value[0] == '"' && value[len(value)-1] == '"' || value[0] == '\'' && value[len(value)-1] == '\'') {
			value = value[1 : len(value)-1]
		} else if value == `"` || value == "'" {
			value = ""
		}
		cfg[key] = value
	}
	return cfg
}

func shipPaths(cfg map[string]string) []string {
	return strings.FieldsFunc(cfg["ship_paths"], checksdk.IsJSSpace)
}

// touchesShippedFiles are the changed files that are a ship root or sit
// under one.
func touchesShippedFiles(changed, roots []string) []string {
	var out []string
	for _, f := range changed {
		for _, r := range roots {
			if f == r || strings.HasPrefix(f, r+"/") {
				out = append(out, f)
				break
			}
		}
	}
	return out
}

// parseVersion is X.Y.Z's three numbers, ok false off the scheme.
func parseVersion(v string) ([3]float64, bool) {
	var out [3]float64
	m := versionScheme.FindStringSubmatch(v)
	if m == nil {
		return out, false
	}
	for i := range out {
		out[i], _ = strconv.ParseFloat(m[i+1], 64)
	}
	return out, true
}

func compareVersions(a, b [3]float64) int {
	for i := range a {
		if a[i] != b[i] {
			if a[i] < b[i] {
				return -1
			}
			return 1
		}
	}
	return 0
}

func versionBumped(repo checksdk.Repo) []checksdk.Finding {
	if !shipsReleasePipeline(repo) {
		return nil
	}
	configText, ok := repo.Read(releaseConfigPath)
	if !ok {
		return nil
	}
	cfg := parseReleaseConfig(configText)
	roots := shipPaths(cfg)
	if len(roots) == 0 {
		return nil
	}
	touched := touchesShippedFiles(repo.ChangedFiles(), roots)
	if len(touched) == 0 {
		return nil
	}
	manifest := cfg["manifest_path"]
	if manifest == "" {
		return nil
	}
	headText, okHead := repo.Read(manifest)
	baseText, okBase := repo.ReadBase(manifest)
	if !okHead || !okBase {
		return nil
	}
	hm, bm := versionToken.FindStringSubmatch(headText), versionToken.FindStringSubmatch(baseText)
	if hm == nil || bm == nil {
		return nil
	}
	head, base := hm[1], bm[1]
	hv, okH := parseVersion(head)
	bv, okB := parseVersion(base)
	if !okH || !okB || compareVersions(hv, bv) > 0 {
		return nil
	}
	if head == base {
		more := ""
		if len(touched) > 1 {
			more = fmt.Sprintf(", +%d more", len(touched)-1)
		}
		next := fmt.Sprintf("%s.%s.%s", strconv.FormatFloat(hv[0], 'f', -1, 64), strconv.FormatFloat(hv[1], 'f', -1, 64), strconv.FormatFloat(hv[2]+1, 'f', -1, 64))
		return []checksdk.Finding{{
			Path:     manifest,
			Sentence: fmt.Sprintf("this change edits a shipped file (%s%s) but leaves the version at %s", touched[0], more, head),
			Fix:      fmt.Sprintf("raise it to %s in %s and package.json together — a minor or major is the release flow's bump dispatch, not a shipped change", next, manifest),
		}}
	}
	return []checksdk.Finding{{
		Path:     manifest,
		Sentence: fmt.Sprintf("the extension version moves backwards, %s → %s", base, head),
		Fix:      "extension versions only ever increase — the store rejects an upload that is not strictly higher than the live one, so a lowered number can never ship",
	}}
}
