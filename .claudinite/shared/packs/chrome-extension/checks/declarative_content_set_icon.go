package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

// A chrome.declarativeContent.SetIcon action built with path silently
// leaves the icon unset: the rules are evaluated by the browser process, so
// the icon must already be raw pixels when the rule is registered. The
// declarativeContent qualifier is required (chrome.action.setIcon({path})
// is correct), only the SetIcon argument's own top-level keys are read, and
// comments are stripped first.

var setIconCall = regexp.MustCompile(`\bdeclarativeContent\s*\.\s*SetIcon\s*\(\s*\{`)

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "declarative-content-set-icon",
		Tags: []string{"world"},
		Doc:  "packs/chrome-extension/README.md",
		Why:  "declarativeContent rules are evaluated by the browser process, so the icon must already be raw pixels at registration time — the documented path option can silently leave the icon unset, with no throw and no console error to notice",
		Run:  declarativeContentSetIcon,
	})
}

// endOfString is the index of the closing quote of the literal opening at
// i, honouring backslash escapes.
func endOfString(src []rune, i int) int {
	quote := src[i]
	for i++; i < len(src); i++ {
		if src[i] == '\\' {
			i++
			continue
		}
		if src[i] == quote {
			return i
		}
	}
	return len(src)
}

// objectLiteral is the balanced literal beginning at the { at open, false
// when the source is unbalanced.
func objectLiteral(src []rune, open int) ([]rune, bool) {
	depth := 0
	for i := open; i < len(src); i++ {
		switch c := src[i]; c {
		case '"', '\'', '`':
			i = endOfString(src, i)
		case '{', '[', '(':
			depth++
		case '}', ']', ')':
			depth--
			if depth == 0 {
				return src[open : i+1], true
			}
		}
	}
	return nil, false
}

// topLevelKeys are the property names written at the object's own top
// level, quoted or not.
func topLevelKeys(obj []rune) []string {
	var keys []string
	depth := 0
	var token []rune
	for i := 0; i < len(obj); i++ {
		c := obj[i]
		switch {
		case c == '"' || c == '\'' || c == '`':
			end := endOfString(obj, i)
			if depth == 1 {
				hi := end
				if hi > len(obj) {
					hi = len(obj)
				}
				token = append([]rune{}, obj[i+1:hi]...)
			}
			i = end
			continue
		case c == '{' || c == '[' || c == '(':
			depth++
			token = nil
			continue
		case c == '}' || c == ']' || c == ')':
			depth--
			token = nil
			continue
		}
		if depth != 1 {
			continue
		}
		switch c {
		case ':':
			if t := strings.TrimFunc(string(token), checksdk.IsJSSpace); t != "" {
				keys = append(keys, t)
			}
			token = nil
		case ',':
			token = nil
		default:
			token = append(token, c)
		}
	}
	return keys
}

func declarativeContentSetIcon(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, file := range repo.Files() {
		if !sourceFile.MatchString(file) {
			continue
		}
		raw, ok := repo.Read(file)
		if !ok || !strings.Contains(raw, "declarativeContent") {
			continue
		}
		src := checksdk.StripComments(raw)
		runes := []rune(src)
		for _, m := range setIconCall.FindAllStringIndex(src, -1) {
			open := len([]rune(src[:m[1]-1]))
			obj, ok := objectLiteral(runes, open)
			if !ok {
				continue
			}
			hasPath := false
			for _, k := range topLevelKeys(obj) {
				hasPath = hasPath || k == "path"
			}
			if !hasPath {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineAt(src, m[0]),
				Sentence: "builds a declarativeContent.SetIcon action from a path",
				Fix:      "pass imageData instead — a service worker has no DOM, so decode the packaged icon yourself: fetch(chrome.runtime.getURL(icon)) → blob → createImageBitmap → OffscreenCanvas.drawImage → getImageData",
			})
		}
	}
	return out
}
