package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

func init() {
	register("stt-terminal-handlers", "a recognition cycle that ends with no transcript fires only `end`, so a recognizer wired for result alone leaves the listen promise pending forever — the UI shows a live mic while nothing is listening, with no error anywhere", sttTerminalHandlers)
	register("stt-error-map-has-default", "the Web Speech error-name set is open — browsers extend it — so a mapping switch with no catch-all returns undefined for a name it does not enumerate; the dialog policy then compares undefined against every kind it knows, takes its do-nothing arm, and the session dies without throwing, logging, or changing the UI", sttErrorMapHasDefault)
	register("stt-interim-results-gated", "interim hypotheses are delivered on the same result event as the final transcript, so a handler that never checks isFinal treats every half-formed guess as a finished utterance — the app acts on words the user has not said yet and repeats itself as the guess is revised, with nothing thrown and nothing logged", sttInterimResultsGated)
}

func sttTerminalHandlers(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	result := wiresRE("result")
	sources(repo, func(raw string) bool { return strings.Contains(raw, "result") }, func(file, src string) {
		at := search(result, src)
		if at < 0 {
			return
		}
		var missing []string
		for _, event := range []string{"end", "error"} {
			if !wires(src, event) {
				missing = append(missing, event)
			}
		}
		if len(missing) == 0 {
			return
		}
		out = append(out, checksdk.Finding{
			Path:     file,
			Line:     lineOf(src, at),
			Sentence: "a speech recognizer handles result but never " + strings.Join(missing, " or "),
			Fix:      "handle " + strings.Join(missing, " and ") + ` on the recognizer and settle the listen cycle from every one of them — map end (the "closed with nothing" case) to a no-speech outcome and error through a named taxonomy, so exactly one outcome always reaches the caller`,
		})
	})
	return out
}

var (
	errorNames  = []string{"no-speech", "aborted", "audio-capture", "network", "not-allowed", "service-not-allowed", "bad-grammar", "language-not-supported"}
	switchCall  = regexp.MustCompile(`\bswitch\s*\(`)
	caseLabel   = regexp.MustCompile("^case\\s+(?:'([^'\"`]*)'|\"([^'\"`]*)\"|`([^'\"`]*)`)\\s*:")
	defaultArm  = regexp.MustCompile(`^default\s*:`)
	wordChar    = regexp.MustCompile(`[\w$]`)
	returnWord  = regexp.MustCompile(`\breturn\b`)
	leadingSemi = regexp.MustCompile(`^[\s;]*`)
	exitWord    = regexp.MustCompile(`^(?:return|throw)\b`)
)

// arms are a switch body's case labels and default at its own depth, the
// body its {…} run: a nested switch contributes neither.
func arms(body string) (labels map[string]bool, hasDefault bool) {
	labels = map[string]bool{}
	depth := 0
	for i := 1; i < len(body)-1; i++ {
		c := body[i]
		if c == '"' || c == '\'' || c == '`' {
			for i++; i < len(body); i++ {
				if body[i] == '\\' {
					i++
					continue
				}
				if body[i] == c {
					break
				}
			}
			continue
		}
		switch c {
		case '{', '[', '(':
			depth++
			continue
		case '}', ']', ')':
			depth--
			continue
		}
		if depth != 0 || wordChar.MatchString(body[i-1:i]) {
			continue
		}
		rest := body[i:]
		if m := caseLabel.FindStringSubmatch(rest); m != nil {
			labels[m[1]+m[2]+m[3]] = true
			i += len(m[0]) - 1
			continue
		}
		if defaultArm.MatchString(rest) {
			hasDefault = true
		}
	}
	return labels, hasDefault
}

func sttErrorMapHasDefault(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	keep := func(raw string) bool {
		n := 0
		for _, name := range errorNames {
			if strings.Contains(raw, name) {
				n++
			}
		}
		return n >= 2
	}
	sources(repo, keep, func(file, src string) {
		for _, m := range switchCall.FindAllStringIndex(src, -1) {
			parenAt := m[1] - 1
			head, ok := balanced(src, parenAt)
			if !ok {
				continue
			}
			after := parenAt + len(head)
			brace := strings.Index(src[after:], "{")
			if brace < 0 || strings.TrimSpace(src[after:after+brace]) != "" {
				continue
			}
			braceAt := after + brace
			body, ok := balanced(src, braceAt)
			if !ok {
				continue
			}
			labels, hasDefault := arms(body)
			var known []string
			for _, name := range errorNames {
				if labels[name] {
					known = append(known, name)
				}
			}
			// Fewer than two names is no speech-error mapping, and a body
			// that returns nothing is a dispatch, not a mapping.
			if len(known) < 2 || !returnWord.MatchString(body) || hasDefault {
				continue
			}
			if exitWord.MatchString(leadingSemi.ReplaceAllString(src[braceAt+len(body):], "")) {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineOf(src, m[0]),
				Sentence: "a switch mapping Web Speech recognition error names (" + strings.Join(known, ", ") + ") has no default arm, so any other name maps to undefined",
				Fix:      "give the switch a `default:` arm returning your catch-all kind (or `return` that kind straight after the switch) — the taxonomy the dialog policy reasons over has to name \"some other error\" explicitly, so a name this browser build invented degrades to a handled kind instead of silently becoming undefined",
			})
		}
	})
	return out
}

var (
	// interimFlag is interimResults set by = (never == or ===) or :, with
	// its value; interimAt finds the name, the rest is read by hand.
	interimAt     = regexp.MustCompile(`\binterimResults\s*(?:=|:)`)
	interimValue  = regexp.MustCompile(`^\s*([^,;\n)}]*)`)
	interimOff    = regexp.MustCompile(`^(?:false|0|null|undefined)$`)
	wiresResult   = []*regexp.Regexp{regexp.MustCompile(`\.\s*onresult\s*=\s*`), regexp.MustCompile("addEventListener\\s*\\(\\s*['\"`]result['\"`]\\s*,\\s*")}
	inlineHandler = regexp.MustCompile(`^(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)`)
	isFinal       = regexp.MustCompile(`\bisFinal\b`)
)

// handlesResultInline reports whether the file wires result to a handler
// it spells out itself.
func handlesResultInline(src string) bool {
	for _, re := range wiresResult {
		for _, m := range re.FindAllStringIndex(src, -1) {
			if inlineHandler.MatchString(src[m[1]:]) {
				return true
			}
		}
	}
	return false
}

// firstInterimOn is the offset of the first interimResults assignment
// whose value is not off, or -1.
func firstInterimOn(src string) int {
	for pos := 0; pos < len(src); {
		loc := interimAt.FindStringIndex(src[pos:])
		if loc == nil {
			return -1
		}
		start, end := pos+loc[0], pos+loc[1]
		if src[end-1] == '=' && end < len(src) && src[end] == '=' {
			pos = start + 1
			continue
		}
		v := interimValue.FindStringSubmatchIndex(src[end:])
		if !interimOff.MatchString(strings.TrimSpace(src[end+v[2] : end+v[3]])) {
			return start
		}
		pos = end + v[1]
		if pos == start {
			pos++
		}
	}
	return -1
}

func sttInterimResultsGated(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	sources(repo, func(raw string) bool { return strings.Contains(raw, "interimResults") }, func(file, src string) {
		if !handlesResultInline(src) || isFinal.MatchString(src) {
			return
		}
		if at := firstInterimOn(src); at >= 0 {
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineOf(src, at),
				Sentence: "this file turns on interim results and handles the result event, but never checks isFinal",
				Fix:      `test ` + "`isFinal`" + ` on each result in the handler and deliver only a final one to the caller — use the interim results solely as the "still speaking" signal (they are what a mid-utterance pause monitor watches); if interim hypotheses are not wanted at all, leave interimResults off rather than filtering them downstream`,
			})
		}
	})
	return out
}
