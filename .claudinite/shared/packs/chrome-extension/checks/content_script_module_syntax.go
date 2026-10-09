// Package checks holds the chrome-extension pack's coded checks.
package checks

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"claudinite.com/checksdk"
)

// A content script is injected as a classic script: there is no module
// mode for a static content_scripts entry or for
// chrome.scripting.registerContentScripts, so a top-level import or export
// throws in the host page's console and the script never runs.
//
// The judged files come from the manifest (each content_scripts entry's js,
// resolved against the manifest's directory) and from the js literals of a
// registerContentScripts call, never from a grep of every source. Comments
// are stripped and literal contents blanked before the statement match, and
// a dynamic import( never matches.

var (
	manifestFile   = regexp.MustCompile(`(^|/)manifest\.json$`)
	sourceFile     = regexp.MustCompile(`\.(?:mjs|cjs|js|jsx|ts|tsx)$`)
	registerCall   = regexp.MustCompile(`\bregisterContentScripts\s*\(`)
	staticImport   = regexp.MustCompile(`(?m)^[ \t]*import\s+(?:[^\n;()]*?\bfrom\s*)?['"]`)
	staticExport   = regexp.MustCompile(`(?m)^[ \t]*export\s*(?:\{|\*|default\b|(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\b)`)
	registeredJS   = regexp.MustCompile(`\bjs\s*:\s*\[([^\]]*)\]`)
	quotedLiteral  = regexp.MustCompile(`['"]([^'"]+)['"]`)
	leadingDotRoot = regexp.MustCompile(`^\.?/`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "content-script-module-syntax",
		Tags: []string{"world"},
		Doc:  "packs/chrome-extension/RULES.md",
		Why:  "static `content_scripts` and `chrome.scripting.registerContentScripts` inject their files as CLASSIC scripts — there is no module mode — so a top-level import throws \"Cannot use import statement outside a module\" and the script never runs, and the error lands in the host page's console rather than the extension's, so nothing in your own devtools says why",
		Run:  contentScriptModuleSyntax,
	})
}

// blankLiterals replaces the contents of every string and template literal
// with spaces, newlines kept, the quotes left in place.
func blankLiterals(source string) string {
	var b strings.Builder
	var quote rune
	rs := []rune(source)
	for i := 0; i < len(rs); i++ {
		c := rs[i]
		if quote == 0 {
			b.WriteRune(c)
			if c == '\'' || c == '"' || c == '`' {
				quote = c
			}
			continue
		}
		switch {
		case c == '\\':
			b.WriteString("  ")
			i++
		case c == quote:
			b.WriteRune(c)
			quote = 0
		case c == '\n':
			b.WriteByte('\n')
		default:
			b.WriteByte(' ')
		}
	}
	return b.String()
}

func lineAt(src string, index int) int { return strings.Count(src[:index], "\n") + 1 }

// moduleSyntax is the first module-syntax statement in text: its keyword
// and line, ok false when there is none.
func moduleSyntax(text string) (kind string, line int, ok bool) {
	src := blankLiterals(checksdk.StripComments(text))
	for _, k := range []struct {
		kind string
		re   *regexp.Regexp
	}{{"import", staticImport}, {"export", staticExport}} {
		m := k.re.FindStringIndex(src)
		if m == nil {
			continue
		}
		start := m[0] + strings.IndexFunc(src[m[0]:m[1]], func(r rune) bool { return !checksdk.IsJSSpace(r) })
		l := lineAt(src, start)
		if !ok || l < line {
			kind, line, ok = k.kind, l, true
		}
	}
	return kind, line, ok
}

// resolveFromRoot is the repo path an extension-root-relative entry names,
// "" for one that is not a string or climbs out of the root.
func resolveFromRoot(root string, entry any) string {
	s, isString := entry.(string)
	if !isString || s == "" {
		return ""
	}
	rel := leadingDotRoot.ReplaceAllString(s, "")
	if rel == "" || strings.Contains(rel, "..") {
		return ""
	}
	return root + rel
}

func dirOf(p string) string {
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[:i+1]
	}
	return ""
}

// registeredScriptPaths are the js string literals on every
// registerContentScripts call's argument.
func registeredScriptPaths(src string) []string {
	var paths []string
	for _, m := range registerCall.FindAllStringIndex(src, -1) {
		depth, end := 0, m[1]-1
		for i := end; i < len(src); i++ {
			switch src[i] {
			case '(', '{', '[':
				depth++
			case ')', '}', ']':
				depth--
			}
			if depth == 0 && (src[i] == ')' || src[i] == '}' || src[i] == ']') {
				end = i
				break
			}
		}
		arg := src[m[0] : end+1]
		js := registeredJS.FindStringSubmatch(arg)
		if js == nil {
			continue
		}
		for _, lit := range quotedLiteral.FindAllStringSubmatch(js[1], -1) {
			paths = append(paths, lit[1])
		}
	}
	return paths
}

func contentScriptModuleSyntax(repo checksdk.Repo) []checksdk.Finding {
	var roots []string
	targets := map[string]string{}
	tracked := repo.Tracked()
	isTracked := map[string]bool{}
	for _, f := range tracked {
		isTracked[f] = true
	}
	for _, file := range tracked {
		if !manifestFile.MatchString(file) {
			continue
		}
		raw, ok := repo.Read(file)
		if !ok || !strings.Contains(raw, `"manifest_version"`) {
			continue
		}
		var manifest any
		if json.Unmarshal([]byte(raw), &manifest) != nil {
			continue
		}
		roots = append(roots, dirOf(file))
		m, _ := manifest.(map[string]any)
		entries, _ := m["content_scripts"].([]any)
		for _, e := range entries {
			entry, _ := e.(map[string]any)
			js, _ := entry["js"].([]any)
			for _, j := range js {
				if p := resolveFromRoot(dirOf(file), j); p != "" {
					if _, seen := targets[p]; !seen {
						targets[p] = file
					}
				}
			}
		}
	}
	if len(roots) == 0 {
		return nil
	}
	for _, file := range repo.Files() {
		if !sourceFile.MatchString(file) {
			continue
		}
		raw, ok := repo.Read(file)
		if !ok || !strings.Contains(raw, "registerContentScripts") {
			continue
		}
		for _, js := range registeredScriptPaths(checksdk.StripComments(raw)) {
			for _, r := range roots {
				p := resolveFromRoot(r, js)
				if p == "" || !isTracked[p] {
					continue
				}
				if _, seen := targets[p]; !seen {
					targets[p] = file
				}
				break
			}
		}
	}
	keys := make([]string, 0, len(targets))
	for p := range targets {
		keys = append(keys, p)
	}
	sort.Slice(keys, func(i, k int) bool { return keys[i]+","+targets[keys[i]] < keys[k]+","+targets[keys[k]] })
	var out []checksdk.Finding
	for _, p := range keys {
		text, ok := repo.Read(p)
		if !ok {
			continue
		}
		kind, line, hit := moduleSyntax(text)
		if !hit {
			continue
		}
		out = append(out, checksdk.Finding{
			Path:     p,
			Line:     line,
			Sentence: fmt.Sprintf("is injected as a content script (declared in %s) but uses a top-level `%s` statement", targets[p], kind),
			Fix:      "make this file a classic script, and reach the module code with a *dynamic* import instead: register a tiny classic loader whose only statement is `import(chrome.runtime.getURL(\"your-module.js\"))` (legal in a classic script, and the module runs in the same isolated world with the content-script chrome.* surface intact), then list that module and its whole transitive import graph under `web_accessible_resources`",
		})
	}
	return out
}
