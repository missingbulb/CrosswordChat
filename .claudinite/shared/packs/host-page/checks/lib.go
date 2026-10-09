// Package checks holds host-page's checks: each reads shipped browser
// source for one host-page trap, gated on the DOM API it judges appearing
// in the file, so the scan is repo-shaped rather than tied to one layout.
package checks

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// sourceExt is shipped browser source; notSource is test scaffolding and
// vendored trees, which do something purpose-built rather than adapt to a
// host page.
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

// lineOf is the 1-based line of byte offset index in text.
func lineOf(text string, index int) int { return strings.Count(text[:index], "\n") + 1 }

// balanced is the bracketed run opening at open, both brackets included,
// or ok false when the source is unbalanced; a bracket inside a string or
// template literal is not syntax.
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

// inputEventClasses are the UI event interfaces modelling real user
// input; CustomEvent is absent, having no fidelity contract.
var (
	inputEventClasses = []string{"KeyboardEvent", "MouseEvent", "PointerEvent", "TouchEvent", "WheelEvent", "InputEvent", "DragEvent", "CompositionEvent"}
	inputEventRE      = regexp.MustCompile(`\b(?:` + strings.Join(inputEventClasses, "|") + `)\b`)
	aliasDecl         = regexp.MustCompile(`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)`)
	newCall           = regexp.MustCompile(`\bnew\s+(?:(?:window|globalThis|self|view|win)\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\(`)
)

// inputEventCtors are the constructor names in src standing for a
// real-input event, in order: the classes, then a local assigned from one.
func inputEventCtors(src string) []string {
	names := append([]string{}, inputEventClasses...)
	for _, m := range aliasDecl.FindAllStringSubmatch(src, -1) {
		if inputEventRE.MatchString(m[2]) && !has(names, m[1]) {
			names = append(names, m[1])
		}
	}
	return names
}

func has(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

// construction is one new <ctor>(…): init is the init object literal,
// hasInit false when the call passes none.
type construction struct {
	name    string
	index   int
	args    string
	init    string
	hasInit bool
}

// eventConstructions are the constructions in src of one of names, an
// optional window-like receiver allowed; an unbalanced one is skipped.
func eventConstructions(src string, names []string) []construction {
	var out []construction
	for _, m := range newCall.FindAllStringSubmatchIndex(src, -1) {
		name := src[m[2]:m[3]]
		if !has(names, name) {
			continue
		}
		args, ok := balanced(src, m[1]-1)
		if !ok {
			continue
		}
		c := construction{name: name, index: m[0], args: args}
		if brace := strings.Index(args, "{"); brace >= 0 {
			c.init, c.hasInit = balanced(args, brace)
		}
		out = append(out, c)
	}
	return out
}

// hasSpread reports whether an init literal spreads something the check
// cannot see into.
func hasSpread(c construction) bool { return c.hasInit && strings.Contains(c.init, "...") }

// backUTF16 is the byte offset n UTF-16 code units before index, or 0,
// so a window measured in JavaScript's units reads the same text here.
func backUTF16(s string, index, n int) int {
	i := index
	for n > 0 && i > 0 {
		r, size := utf8.DecodeLastRuneInString(s[:i])
		units := 1
		if r >= 0x10000 {
			units = 2
		}
		if units > n {
			break
		}
		n -= units
		i -= size
	}
	return i
}
