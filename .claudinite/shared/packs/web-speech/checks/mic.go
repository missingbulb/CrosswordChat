package checks

import (
	"fmt"
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

func init() {
	register("mic-capture-released", `a media stream is freed only by stopping its tracks — dropping the reference leaves the browser and OS microphone indicators lit and the device claimed, which on anything voice-driven reads to the user as "it is still listening to me"`, micCaptureReleased)
	register("mic-constraints-not-screen-capture", "suppressLocalAudioPlayback and restrictOwnAudio are getDisplayMedia screen-capture constraints — they filter a captured tab's own playout, not a microphone — so getUserMedia silently ignores them while the author believes self-echo is now handled at the capture layer and never writes the guard that would have handled it", micConstraintsNotScreenCapture)
}

var (
	userMediaCall = regexp.MustCompile(`\bgetUserMedia\s*\(`)
	trackRelease  = regexp.MustCompile(`\bgetTracks\b|\bgetAudioTracks\b`)
	stopCall      = regexp.MustCompile(`\.\s*stop\s*\(`)
)

func micCaptureReleased(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	sources(repo, func(raw string) bool { return strings.Contains(raw, "getUserMedia") }, func(file, src string) {
		first := search(userMediaCall, src)
		if first < 0 || trackRelease.MatchString(src) && stopCall.MatchString(src) {
			return
		}
		out = append(out, checksdk.Finding{
			Path:     file,
			Line:     lineOf(src, first),
			Sentence: "opens a microphone capture but never stops its tracks",
			Fix:      "release the capture with stream.getTracks().forEach((t) => t.stop()), and put that call in a `finally` so no early return, rejection, or throw from the code in between can leave the device held",
		})
	})
	return out
}

var (
	declaration = regexp.MustCompile(`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=`)
	opener      = regexp.MustCompile(`^\s*(?:[A-Za-z_$][\w$.]*\s*)?([\[{(])`)
	displayOnly = []string{"suppressLocalAudioPlayback", "restrictOwnAudio"}
)

// reach is the spans of src a getUserMedia call's constraints reach: the
// argument list, and the initializer of each declaration it names, one
// hop, since further needs data-flow analysis.
func reach(src string, argsStart int, args string) [][2]int {
	regions := [][2]int{{argsStart, argsStart + len(args)}}
	for _, d := range declaration.FindAllStringSubmatchIndex(src, -1) {
		named, err := regexp.Compile(`\b` + src[d[2]:d[3]] + `\b`)
		if err != nil || !named.MatchString(args) {
			continue
		}
		eq := d[1]
		head := opener.FindStringIndex(src[eq:])
		if head == nil {
			continue
		}
		open := eq + head[1] - 1
		init, ok := balanced(src, open)
		if !ok {
			continue
		}
		regions = append(regions, [2]int{open, open + len(init)})
	}
	return regions
}

func micConstraintsNotScreenCapture(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	keep := func(raw string) bool {
		for _, name := range displayOnly {
			if strings.Contains(raw, name) {
				return true
			}
		}
		return false
	}
	sources(repo, keep, func(file, src string) {
		seen := map[string]bool{}
		for _, m := range userMediaCall.FindAllStringIndex(src, -1) {
			argsStart := m[1] - 1
			args, ok := balanced(src, argsStart)
			if !ok {
				continue
			}
			for _, r := range reach(src, argsStart, args) {
				region := src[r[0]:r[1]]
				for _, name := range displayOnly {
					at := search(regexp.MustCompile(`\b`+name+`\b`), region)
					if at < 0 {
						continue
					}
					line := lineOf(src, r[0]+at)
					key := fmt.Sprintf("%s:%d", name, line)
					if seen[key] {
						continue
					}
					seen[key] = true
					out = append(out, checksdk.Finding{
						Path:     file,
						Line:     line,
						Sentence: "a getUserMedia microphone capture asks for " + name + ", which is a getDisplayMedia screen-capture constraint",
						Fix:      "drop " + name + " from the microphone constraints — it filters a captured tab's own playout out of a screen-capture track and getUserMedia ignores it outright, so it suppresses nothing here; residual self-echo has to be handled above the capture (an application-level echo guard), because the recognizer's capture takes no constraints at all",
					})
				}
			}
		}
	})
	return out
}
