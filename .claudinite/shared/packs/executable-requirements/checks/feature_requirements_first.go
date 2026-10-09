// Package checks holds the executable-requirements pack's coded checks.
package checks

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"claudinite.com/checksdk"
)

// After the owner's latest feature-classified comment, an independent
// commit updating the spec (no code alongside) must precede the first
// code commit. Scoped by the comment's time, so earlier work on the branch
// is never re-litigated.

// The executable spec's canonical home; a project whose spec lives
// elsewhere names it on its pack entry (config.spec).
const defaultSpec = "dev/requirements/requirements.md"

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "feature-requirements-first",
		Tags: []string{"work"},
		Doc:  "packs/executable-requirements/RULES.md",
		Why:  "the feature run is doc-first: the spec change is the requirement's durable home and must precede the code that satisfies it",
		Run:  featureRequirementsFirst,
	})
}

// isCode is product work rather than specification: neither Markdown nor
// part of the requirements tree, whose goldens and harness code are the
// spec's own machinery.
func isCode(f string) bool {
	return !strings.HasSuffix(f, ".md") && !strings.HasPrefix(f, "dev/requirements/")
}

func specPath(repo checksdk.Repo) string {
	var cfg struct {
		Spec any `json:"spec"`
	}
	_ = json.Unmarshal(repo.PackConfig("executable-requirements"), &cfg)
	if s, ok := cfg.Spec.(string); ok && s != "" {
		return s
	}
	return defaultSpec
}

func featureRequirementsFirst(repo checksdk.Repo) []checksdk.Finding {
	var feature *checksdk.Turn
	for _, t := range repo.Session().OwnerTurns() {
		if t.Has("feature") {
			t := t
			feature = &t
		}
	}
	if feature == nil {
		return nil
	}
	// With no spec in the repo no commit could satisfy the ordering, and
	// firing would force the wrong remedy.
	spec := specPath(repo)
	if !repo.Exists(spec) {
		return nil
	}
	specSeen := false
	for _, c := range repo.BranchCommits() {
		if c.Time().Before(feature.Time()) {
			continue
		}
		var code []string
		for _, f := range c.Files {
			if isCode(f) {
				code = append(code, f)
			}
		}
		if len(code) == 0 {
			specSeen = specSeen || slices.Contains(c.Files, spec)
			continue
		}
		if specSeen {
			return nil
		}
		return []checksdk.Finding{{
			Path:     "(branch)",
			Sentence: fmt.Sprintf("commit %s (%q) changes code (%s) before any independent commit updating %s", short(c.Sha), c.Subject, code[0], spec),
			Fix:      fmt.Sprintf("record the requirement first: land a commit updating %s with no code alongside, then the tests and implementation — rebase to reorder if the code is already committed", spec),
		}}
	}
	return nil
}

func short(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}
