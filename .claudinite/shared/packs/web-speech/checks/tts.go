package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

func init() {
	register("tts-speak-settles", "a speak promise settles only from the outcome its handler recognises, so one that ignores interrupted/cancelled/error leaves every awaiting caller pending forever — with nothing thrown and nothing logged", ttsSpeakSettles)
}

var (
	ttsTerminal = []string{"end", "interrupted", "cancelled", "error"}
	speakCall   = regexp.MustCompile(`\.\s*speak\s*\(`)
	onEvent     = regexp.MustCompile(`\bonEvent\b`)
	utterance   = regexp.MustCompile(`\bSpeechSynthesisUtterance\b`)
)

func ttsSpeakSettles(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	sources(repo, func(string) bool { return true }, func(file, src string) {
		for _, m := range speakCall.FindAllStringIndex(src, -1) {
			args, ok := balanced(src, m[1]-1)
			if !ok || !onEvent.MatchString(args) {
				continue
			}
			var missing []string
			for _, t := range ttsTerminal {
				if !quoted(args, t) {
					missing = append(missing, t)
				}
			}
			if len(missing) == 0 || len(missing) == len(ttsTerminal) {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineOf(src, m[0]),
				Sentence: "a chrome.tts speak handler never settles on " + strings.Join(missing, "/"),
				Fix:      "treat every terminal event as completion — resolve on " + strings.Join(ttsTerminal, ", ") + " alike; a later speak() with enqueue:false ends this utterance as 'interrupted' and a stop()/teardown as 'cancelled', so those are normal endings, not rare ones",
			})
		}
		if utterance.MatchString(src) && wires(src, "end") && !wires(src, "error") {
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineOf(src, search(utterance, src)),
				Sentence: "a SpeechSynthesisUtterance settles on end but has no error handler",
				Fix:      "handle the utterance's error event alongside end and settle the same promise from both (either wiring form — `utterance.onerror =` or `addEventListener('error', …)`) — speechSynthesis reports a failed utterance through error only, so end never fires and the awaiting caller hangs",
			})
		}
	})
	return out
}
