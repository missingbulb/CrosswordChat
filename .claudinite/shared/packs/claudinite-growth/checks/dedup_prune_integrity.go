package checks

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"unicode/utf16"

	"claudinite.com/checksdk"
)

// The backstop for the dedup task's rule that a dedup edit only removes
// portable text. Two signals: an added local-pack prose line restating a
// canon rule is a corruption on any branch; and a dedup run, one whose
// commits announce a dedup and whose change stays inside the local packs
// (a change fixing the routine says dedup too, and reaches outside), must
// shrink each prose file it modifies, in lines or, past a re-wrap, in
// characters. A pack's provenance files always grow on a prune, so they
// are exempt from the shrink measure, never from the fingerprint.
//
// dedupRun matches a commit announcing a dedup; restatesCanon an added
// line re-importing a canon rule: one saying a rule is portable (canon),
// that a pack or the canon owns it.
var (
	dedupRun      = regexp.MustCompile(`(?i)\bdedup\b|\bcanon now (?:covers|owns)\b`)
	restatesCanon = regexp.MustCompile(`(?i)\b(?:is|are) portable\s*\(canon\)|\bpack owns\b|\bcanon (?:now )?owns\b|\bowned by (?:the )?canon\b`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "dedup-prune-integrity",
		Tags: []string{"work"},
		Doc:  "packs/claudinite-growth/skills/growth-dedup/SKILL.md",
		Why:  "the growth-dedup routine has reworded partially-covered items instead of stripping them — restating the canon rule inside the local pack, the inverse of dedup — and every dedup edit must shrink the pack, not grow it",
		Run:  dedupPruneIntegrity,
	})
}

func isLocalPackProse(f string) bool {
	return strings.HasSuffix(f, ".md") && strings.HasPrefix(f, localPacks)
}

func isProvenance(f string) bool {
	parts := strings.Split(strings.TrimPrefix(f, localPacks), "/")
	return len(parts) > 1 && parts[1] == "provenance"
}

// jsLength is a string's length as JavaScript counts it, in UTF-16 code
// units, which the Node rule compared.
func jsLength(s string) int { return len(utf16.Encode([]rune(s))) }

// jsSlice80 is JavaScript's s.slice(0, 80).
func jsSlice80(s string) string {
	u := utf16.Encode([]rune(s))
	if len(u) > 80 {
		u = u[:80]
	}
	return string(utf16.Decode(u))
}

func dedupPruneIntegrity(repo checksdk.Repo) []checksdk.Finding {
	if repo.OnDefaultBranch() {
		return nil
	}
	var prose []string
	for _, f := range repo.ChangedFiles() {
		if isLocalPackProse(f) {
			prose = append(prose, f)
		}
	}
	if len(prose) == 0 {
		return nil
	}
	var out []checksdk.Finding
	for _, f := range prose {
		for _, l := range repo.AddedLines([]string{f}) {
			if restatesCanon.MatchString(l.Text) {
				out = append(out, checksdk.Finding{
					Path:     f,
					Line:     l.Line,
					Sentence: fmt.Sprintf(`local-pack prose re-imports a canon rule: "%s"`, jsSlice80(strings.TrimSpace(l.Text))),
					Fix:      `delegate the portable rule to the canon and keep only this project's residue — never restate the canon rule, its fix, or which pack owns it (use the pack's "(canon): here …" convention)`,
				})
			}
		}
	}
	confined := true
	for _, f := range repo.ChangedFiles() {
		confined = confined && strings.HasPrefix(f, localPacks)
	}
	if !confined || !slices.ContainsFunc(repo.CommitMessages(), dedupRun.MatchString) {
		return out
	}
	for _, f := range prose {
		if isProvenance(f) {
			continue
		}
		base, okBase := repo.ReadBase(f)
		head, okHead := repo.Read(f)
		if !okBase || !okHead {
			continue
		}
		bl, hl := strings.Count(base, "\n")+1, strings.Count(head, "\n")+1
		grew := ""
		switch {
		case hl > bl:
			grew = fmt.Sprintf("from %d to %d lines", bl, hl)
		case jsLength(head) > jsLength(base):
			grew = fmt.Sprintf("from %d to %d characters", jsLength(base), jsLength(head))
		}
		if grew != "" {
			out = append(out, checksdk.Finding{
				Path:     f,
				Sentence: fmt.Sprintf("a dedup run grew %s %s — a prune/strip removes duplicated text, it never grows the pack", f, grew),
				Fix:      "strip each covered item down to its project residue (a deletion that shrinks the entry); if you are keeping an item, leave it unchanged rather than rewording it",
			})
		}
	}
	return out
}
