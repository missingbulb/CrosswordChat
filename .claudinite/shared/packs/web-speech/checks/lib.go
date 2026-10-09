// Package checks holds web-speech's coded checks: each reads shipped
// browser source for one Web Speech trap, gated on the API appearing in
// the file rather than on a source root.
package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

const doc = "packs/web-speech/RULES.md"

var (
	sourceExt = regexp.MustCompile(`\.(?:m|c)?[jt]sx?$`)
	notSource = []*regexp.Regexp{
		regexp.MustCompile(`(?:^|\/)(?:node_modules|dist|build|out|coverage|vendor|third_party)\/`),
		regexp.MustCompile(`(?:^|\/)(?:tests?|__tests__|__mocks__|spec|fixtures?|mocks?|e2e)\/`),
		regexp.MustCompile(`(?:^|[./-])(?:test|spec|fixture|mock|stub|fake)s?\.[^/]+$`),
	}
)

func isSource(file string) bool {
	if !sourceExt.MatchString(file) {
		return false
	}
	for _, re := range notSource {
		if re.MatchString(file) {
			return false
		}
	}
	return true
}

func lineOf(text string, index int) int { return strings.Count(text[:index], "\n") + 1 }

// wiresRE is both legal wirings of a speech event: the onfoo = property
// and addEventListener('foo', …).
func wiresRE(event string) *regexp.Regexp {
	return regexp.MustCompile(`\.\s*on` + event + `\s*=|addEventListener\s*\(\s*['"` + "`" + `]` + event + `['"` + "`" + `]`)
}

func wires(src, event string) bool { return wiresRE(event).MatchString(src) }

// quoted reports whether text holds name as a string literal.
func quoted(text, name string) bool {
	return regexp.MustCompile(`['"` + "`" + `]` + regexp.QuoteMeta(name) + `['"` + "`" + `]`).MatchString(text)
}

// balanced is the bracketed run opening at open, both brackets included;
// ok is false for unbalanced source, a bracket in a literal not syntax.
func balanced(src string, open int) (string, bool) {
	depth := 0
	for i := open; i < len(src); i++ {
		c := src[i]
		if c == '"' || c == '\'' || c == '`' {
			for i++; i < len(src); i++ {
				if src[i] == '\\' {
					i++
					continue
				}
				if src[i] == c {
					break
				}
			}
			continue
		}
		switch c {
		case '{', '[', '(':
			depth++
		case '}', ']', ')':
			depth--
			if depth == 0 {
				return src[open : i+1], true
			}
		}
	}
	return "", false
}

// sources calls each with every shipped source keep admits by its raw
// text, comments stripped.
func sources(repo checksdk.Repo, keep func(raw string) bool, each func(file, src string)) {
	for _, file := range repo.Files() {
		if !isSource(file) {
			continue
		}
		raw, ok := repo.Read(file)
		if !ok || !keep(raw) {
			continue
		}
		each(file, checksdk.StripComments(raw))
	}
}

func search(re *regexp.Regexp, text string) int {
	if loc := re.FindStringIndex(text); loc != nil {
		return loc[0]
	}
	return -1
}

func register(id, why string, run func(checksdk.Repo) []checksdk.Finding) {
	checksdk.Register(checksdk.Check{ID: id, Tags: []string{"world"}, OnFail: "block", Doc: doc, Why: why, Run: run})
}
