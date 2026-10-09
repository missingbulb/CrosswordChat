package checks

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

const writer = "node .claudinite/shared/packs/claude-code-web-users-support/write_store_codeowners.mjs"

func init() {
	register := func(id, doc, why string, run func(checksdk.Repo) []checksdk.Finding) {
		checksdk.Register(checksdk.Check{ID: id, Tags: []string{"world"}, OnFail: "advise", Doc: doc, Why: why, Run: run})
	}
	register("preferences-store-configured", "packs/claude-code-web-users-support/RULES.md",
		"a declared pack with no store injects nobody's preferences and says so only in a fail-soft note nobody reads twice", storeConfigured)
	register("preferences-store-file-names", "packs/claude-code-web-users-support/RULES.md",
		"the reader copies a person's pack from <path>/<login>/ and fails soft on a miss, so a differently-named directory is never opened and nothing ever reports it", storeFileNames)
	register("preferences-store-codeowners", "packs/claude-code-web-users-support/README.md",
		"a person trusts that nobody but them or the admin edited their pack only while their directory has its code-owner line", storeCodeowners)
	register("preferences-provenance", "packs/claude-code-web-users-support/RULES.md",
		"a rule with no file has no record of when it was set or what prompted it, and the session that changes it next is the only reader who could have written that down", preferencesProvenance)
}

func storeConfigured(repo checksdk.Repo) []checksdk.Finding {
	raw := repo.PackConfig(pack)
	if _, ok := resolveStore(raw); ok {
		return nil
	}
	sentence := "the claude-code-web-users-support pack is declared but names no store"
	if string(raw) != "null" {
		var compact bytes.Buffer
		if json.Compact(&compact, raw) != nil {
			compact.Reset()
			compact.Write(raw)
		}
		sentence = fmt.Sprintf("the claude-code-web-users-support pack's store does not resolve (%s)", compact.String())
	}
	return []checksdk.Finding{{
		Path:     settingsFile(repo),
		Sentence: sentence,
		Fix:      `give the pack entry a "config": { "repo": "owner/name" } naming the repo that holds this project's users' preferences — "path" is optional and defaults to preferences/`,
	}}
}

// held is the files under the store's directory, and the store; ok is
// false when no store resolves or this repo holds none of it.
func held(repo checksdk.Repo) (store, []string, []string, bool) {
	s, ok := resolveStore(repo.PackConfig(pack))
	if !ok {
		return s, nil, nil, false
	}
	files := repo.Files()
	var under []string
	for _, f := range files {
		if strings.HasPrefix(f, s.path+"/") {
			under = append(under, f)
		}
	}
	return s, files, under, len(under) > 0
}

// storeFileNames reports one finding per misnamed top-level entry, never
// per file inside it.
func storeFileNames(repo checksdk.Repo) []checksdk.Finding {
	s, _, under, ok := held(repo)
	if !ok {
		return nil
	}
	prefix := s.path + "/"
	seen := map[string]bool{}
	var out []checksdk.Finding
	for _, f := range under {
		rest := f[len(prefix):]
		top, _, nested := strings.Cut(rest, "/")
		if seen[top] {
			continue
		}
		seen[top] = true
		switch {
		case !nested && top == "README.md":
		case !nested:
			out = append(out, checksdk.Finding{
				Path:     f,
				Sentence: "sits loose in " + prefix + " - a person's pack is only ever addressed as " + prefix + "<login>/",
				Fix:      "move it into " + prefix + "<login>/, as that pack's RULES.md or one of its files, or out of the store entirely if it is not one person's pack",
			})
		case !usableIdentity(top):
			out = append(out, checksdk.Finding{
				Path:     prefix + top,
				Sentence: "is not an identity the reader can address - it copies " + prefix + "<login>/ for the session's GitHub login in lower case",
				Fix:      "rename it to that person's GitHub login in lower case, or move it out of " + prefix,
			})
		}
	}
	return out
}

func storeCodeowners(repo checksdk.Repo) []checksdk.Finding {
	s, files, _, ok := held(repo)
	if !ok {
		return nil
	}
	fix := "run `" + writer + "` and commit " + codeownersFile
	text := ""
	if has(files, codeownersFile) {
		text, _ = repo.Read(codeownersFile)
	}
	block, after, found := readBlock(text)
	if !found {
		return []checksdk.Finding{{Path: codeownersFile, Sentence: "carries no generated block for " + s.path + "/", Fix: fix}}
	}
	var out []checksdk.Finding
	if expected := codeownersBlock(s, files); block != expected {
		have := map[string]bool{}
		for _, l := range strings.Split(block, "\n") {
			have[l] = true
		}
		var missing []string
		for _, l := range strings.Split(expected, "\n") {
			if !have[l] && !strings.HasPrefix(l, "#") {
				missing = append(missing, l)
			}
		}
		tail := ""
		if len(missing) > 0 {
			tail = " - missing " + strings.Join(missing, ", ")
		}
		out = append(out, checksdk.Finding{Path: codeownersFile, Sentence: "its generated block is out of step with " + s.path + "/" + tail, Fix: fix})
	}
	if len(after) > 0 {
		out = append(out, checksdk.Finding{
			Path:     codeownersFile,
			Sentence: "has owner lines after the generated block (" + strings.Join(after, ", ") + "), and GitHub's last matching line wins",
			Fix:      "move those lines above the block, or remove them if they re-own " + s.path + "/",
		})
	}
	return out
}

var (
	slugBreak = regexp.MustCompile(`[^a-z0-9]+`)
	slugEdge  = regexp.MustCompile(`^-|-$`)
)

// slugHint is the marker a rule's trigger suggests: its first three words,
// hyphenated.
func slugHint(trigger string) string {
	s := slugEdge.ReplaceAllString(slugBreak.ReplaceAllString(strings.ToLower(trigger), "-"), "")
	words := strings.Split(s, "-")
	if len(words) > 3 {
		words = words[:3]
	}
	return strings.Join(words, "-")
}

// preferencesProvenance judges each person's RULES.md, the one prose file
// of a personal pack.
func preferencesProvenance(repo checksdk.Repo) []checksdk.Finding {
	s, files, _, ok := held(repo)
	if !ok {
		return nil
	}
	prefix := s.path + "/"
	var out []checksdk.Finding
	for _, file := range files {
		rest, ok := strings.CutPrefix(file, prefix)
		if !ok || !strings.HasSuffix(rest, "/RULES.md") || strings.Count(rest, "/") != 1 {
			continue
		}
		login := strings.TrimSuffix(rest, "/RULES.md")
		if !usableIdentity(login) {
			continue
		}
		dir := prefix + login + "/provenance"
		text, _ := repo.Read(file)
		for _, b := range checksdk.RuleBlocks(text) {
			switch {
			case b.Slug == "":
				out = append(out, checksdk.Finding{
					Path:     file,
					Line:     b.Start + 1,
					Sentence: fmt.Sprintf(`the rule "%s" ends with no marker naming its provenance file`, b.Trigger),
					Fix:      fmt.Sprintf("end it with a slug marker, e.g. (%s), and write that file under %s/ with a born entry saying when the rule was set and what prompted it", slugHint(b.Trigger), dir),
				})
			case !repo.Exists(dir + "/" + b.Slug + ".md"):
				out = append(out, checksdk.Finding{
					Path:     file,
					Line:     b.LastLine + 1,
					Sentence: fmt.Sprintf(`the rule "%s" names %s/%s.md, which does not exist`, b.Trigger, dir, b.Slug),
					Fix:      fmt.Sprintf("create %s/%s.md with a born entry, or fix the marker to the file it meant", dir, b.Slug),
				})
			}
		}
	}
	return out
}
