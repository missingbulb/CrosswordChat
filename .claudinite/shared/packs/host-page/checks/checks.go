package checks

import (
	"fmt"
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

const doc = "packs/host-page/RULES.md"

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "page-observers-disconnected",
		Tags:   []string{"world"},
		OnFail: "block",
		Doc:    doc,
		Why:    `an observer on a host page outlives whatever started it — the single-page app never unloads, so "stopped" work keeps waking on every host mutation and the guest is never really inert`,
		Run:    pageObserversDisconnected,
	})
	checksdk.Register(checksdk.Check{
		ID:     "synthetic-input-events-bubble",
		Tags:   []string{"world"},
		OnFail: "block",
		Doc:    doc,
		Why:    `bubbles defaults to false on every event constructor, and a host page handles input by delegation near its own root — a non-bubbling synthetic event never reaches the handler, silently, and reads as "the app ignores untrusted events"`,
		Run:    syntheticInputEventsBubble,
	})
	checksdk.Register(checksdk.Check{
		ID:     "synthetic-input-events-target-app-node",
		Tags:   []string{"world"},
		OnFail: "block",
		Doc:    doc,
		Why:    `a host page handles input by delegation, one listener near its own root — an event dispatched at document or document.body bubbles past that root and never arrives, silently, and reads exactly like "the app ignores untrusted events"`,
		Run:    syntheticInputEventsTargetAppNode,
	})
}

// sources calls each with every shipped browser source keep admits by its
// raw text, comments stripped.
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

var (
	observer          = regexp.MustCompile(`\b(?:Mutation|Intersection|Resize)Observer\b`)
	observerConstruct = regexp.MustCompile(`\bnew\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)?(?:Mutation|Intersection|Resize)Observer\s*\(`)
	observeCall       = regexp.MustCompile(`\.\s*observe\s*\(`)
	disconnectCall    = regexp.MustCompile(`\.\s*disconnect\s*\(`)
)

// pageObserversDisconnected asks, per file, whether a file that starts an
// observer anywhere disconnects one: proving it per observer needs
// data-flow analysis, and a check that guesses is worse.
func pageObserversDisconnected(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	sources(repo, observer.MatchString, func(file, src string) {
		first := observerConstruct.FindStringIndex(src)
		if first == nil || !observeCall.MatchString(src) || disconnectCall.MatchString(src) {
			return
		}
		out = append(out, checksdk.Finding{
			Path:     file,
			Line:     lineOf(src, first[0]),
			Sentence: "starts a DOM observer on the page but never disconnects one",
			Fix:      "call observer.disconnect() on every path that ends the work it was watching for — the moment a one-shot observer sees what it was waiting for, and in the teardown of anything session-scoped",
		})
	})
	return out
}

var (
	dispatchCall = regexp.MustCompile(`\.\s*dispatchEvent\s*\(`)
	bubblesTrue  = regexp.MustCompile(`\bbubbles\s*:\s*(?:true|!0)\b`)
	bubblesAny   = regexp.MustCompile(`\bbubbles\s*:`)
	bareArg      = regexp.MustCompile(`^\(\s*([A-Za-z_$][\w$]*)\s*\)$`)
	assignTarget = regexp.MustCompile(`([A-Za-z_$][\w$]*)\s*=\s*$`)
)

func mentionsDispatch(raw string) bool { return strings.Contains(raw, "dispatchEvent") }

// syntheticInputEventsBubble judges a real-input event dispatched inline
// or through one local; an init spreading what it cannot see is silent.
func syntheticInputEventsBubble(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	sources(repo, mentionsDispatch, func(file, src string) {
		ctors := inputEventCtors(src)
		var spans [][2]int
		idents := map[string]bool{}
		for _, m := range dispatchCall.FindAllStringIndex(src, -1) {
			open := m[1] - 1
			args, ok := balanced(src, open)
			if !ok {
				continue
			}
			spans = append(spans, [2]int{open, open + len(args)})
			if b := bareArg.FindStringSubmatch(args); b != nil {
				idents[b[1]] = true
			}
		}
		for _, c := range eventConstructions(src, ctors) {
			inline := false
			for _, s := range spans {
				if c.index >= s[0] && c.index < s[1] {
					inline = true
					break
				}
			}
			if !inline {
				name, ok := assignedTo(src, c.index)
				if !ok || !idents[name] {
					continue
				}
			}
			if !c.hasInit {
				out = append(out, checksdk.Finding{
					Path:     file,
					Line:     lineOf(src, c.index),
					Sentence: fmt.Sprintf("dispatches a %s constructed with no init, so it does not bubble", c.name),
					Fix:      fmt.Sprintf("pass { bubbles: true, cancelable: true, composed: true } to the %s constructor — a real user event carries all three, and a page that handles input by delegation only ever sees the ones that bubble", c.name),
				})
				continue
			}
			if bubblesTrue.MatchString(c.init) || hasSpread(c) && !bubblesAny.MatchString(c.init) {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineOf(src, c.index),
				Sentence: fmt.Sprintf("dispatches a %s that does not set bubbles: true", c.name),
				Fix:      fmt.Sprintf("set bubbles: true in the %s init — without it the event stops at the node you dispatched it on and never reaches the delegated handler the host page listens with", c.name),
			})
		}
	})
	return out
}

// assignedTo is the local a construction at index is assigned to, one
// hop, looking back 80 characters; a property target is no local.
func assignedTo(src string, index int) (string, bool) {
	before := src[backUTF16(src, index, 80):index]
	m := assignTarget.FindStringSubmatchIndex(before)
	if m == nil {
		return "", false
	}
	if m[0] > 0 && before[m[0]-1] == '.' {
		return "", false
	}
	return before[m[2]:m[3]], true
}

var (
	receiverDispatch = regexp.MustCompile(`([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\.\s*dispatchEvent\s*\(`)
	docExpr          = regexp.MustCompile(`^(?:window\s*\.\s*|globalThis\s*\.\s*|self\s*\.\s*)?document(?:\s*\.\s*body)?$`)
)

// compile is pattern as a regexp, or nil: the receivers and constructor
// names spliced into one are identifiers, which always compile.
func compile(pattern string) *regexp.Regexp {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil
	}
	return re
}

// resolveDocExpr is the document/body expression a receiver resolves to,
// directly or through one declaration, or "".
func resolveDocExpr(src, receiver string) string {
	if docExpr.MatchString(receiver) {
		return receiver
	}
	decl := compile(`\b(?:const|let|var)\s+` + receiver + `\s*=\s*([^;\n]*)`)
	if decl == nil {
		return ""
	}
	m := decl.FindStringSubmatch(src)
	if m == nil {
		return ""
	}
	if expr := strings.TrimSpace(m[1]); docExpr.MatchString(expr) {
		return expr
	}
	return ""
}

// dispatchedCtor is the real-input constructor a dispatch's argument
// names, inline or through one declared local, or "".
func dispatchedCtor(src, args string, ctors []string) string {
	for _, ctor := range ctors {
		if re := compile(`\bnew\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)?` + ctor + `\s*\(`); re != nil && re.MatchString(args) {
			return ctor
		}
	}
	b := bareArg.FindStringSubmatch(args)
	if b == nil {
		return ""
	}
	for _, ctor := range ctors {
		if re := compile(`\b(?:const|let|var)\s+` + b[1] + `\s*=\s*new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)?` + ctor + `\s*\(`); re != nil && re.MatchString(src) {
			return ctor
		}
	}
	return ""
}

func syntheticInputEventsTargetAppNode(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	sources(repo, mentionsDispatch, func(file, src string) {
		ctors := inputEventCtors(src)
		for _, m := range receiverDispatch.FindAllStringSubmatchIndex(src, -1) {
			expr := resolveDocExpr(src, src[m[2]:m[3]])
			if expr == "" {
				continue
			}
			args, ok := balanced(src, m[1]-1)
			if !ok {
				continue
			}
			ctor := dispatchedCtor(src, args, ctors)
			if ctor == "" {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineOf(src, m[0]),
				Sentence: fmt.Sprintf("dispatches a %s at %s, outside the app's own subtree", ctor, expr),
				Fix:      "dispatch at a node inside the app — the selected/focused element if there is one, otherwise a known node under the app root — never document or document.body: a host page delegates input handling near its own root, and an event dispatched above that root bubbles past it and is never seen",
			})
		}
	})
	return out
}
