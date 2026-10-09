package checks

import (
	"regexp"
	"slices"
	"sort"
	"strings"

	"claudinite.com/checksdk"
)

// The write-surface gate for the growth runs whose surface is the repo's
// own local packs (extract, dedup, the two sweeps): extract's pull
// request merges with no review, so the boundary is a machine guarantee.
// A run marks itself by its pinned commit subject, so the check gates
// itself and runs wherever the pack is declared; with no merge base there
// is no branch to read, and it says nothing.
//
// growthRun matches a commit subject one of those runs stamped: the whole
// pinned title (the tasks' task.md), never the "Claudinite growth:" prefix
// the lifecycle shares. "conversation extract" is the pre-merge title of
// extract's conversation half, still accepted.
var growthRun = regexp.MustCompile(`^Claudinite growth: (?:extract lessons|conversation extract|dedup\b|prose to checks|rule revalidation)`)

// localPacks is the write surface of every run growthRun matches.
const localPacks = ".claudinite/local/packs/"

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "growth-write-scope",
		Tags: []string{"work"},
		Doc:  "packs/claudinite-growth/README.md",
		Why:  "extract auto-merges its PR with no human review and the rest run unattended; every one of them improves the repo's own packs, so a write outside .claudinite/local/packs/ — the canon it reads against, or the project's own code — escapes the review-by-blast-radius boundary the growth lifecycle is built on",
		Run:  growthWriteScope,
	})
}

func growthWriteScope(repo checksdk.Repo) []checksdk.Finding {
	if repo.OnDefaultBranch() || !slices.ContainsFunc(repo.CommitMessages(), growthRun.MatchString) {
		return nil
	}
	var out []checksdk.Finding
	for _, p := range unique(repo.ChangedFiles(), repo.Deleted()) {
		if strings.HasPrefix(p, localPacks) {
			continue
		}
		out = append(out, checksdk.Finding{
			Path:     p,
			Sentence: "a growth run touched " + p + ", outside " + localPacks,
			Fix:      "a growth run improves the repo's own packs, never the canon or the project's code — keep the whole write surface inside the local packs; a site-tied lesson lands as the owning pack's entry naming the site, and the same action over a canon's packs/ shelf is a claudinite-canon-curation task's",
		})
	}
	return out
}

// unique is xs deduplicated and sorted.
func unique(xs ...[]string) []string {
	seen := map[string]bool{}
	var out []string
	for _, l := range xs {
		for _, x := range l {
			if !seen[x] {
				seen[x] = true
				out = append(out, x)
			}
		}
	}
	sort.Strings(out)
	return out
}
