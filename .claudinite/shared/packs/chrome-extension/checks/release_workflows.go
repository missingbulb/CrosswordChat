package checks

import (
	"fmt"
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

// The Chrome Web Store release pipeline is vendored into each consumer's
// own .github/: the orchestrator (stubFile, named stubName) owns the
// triggers and calls the local reusable workflows, which with the
// privacy-page reusable and three composite actions the pack's stubs/
// materialize beside it.
const (
	stubFile = "chrome-extension-release.yml"
	stubName = "Release to Chrome Store"
	stubCron = "30 0 * * *"
)

var (
	orchestratorCalls = []string{
		"chrome-extension-create-package.yml",
		"chrome-extension-publish-store.yml",
		"chrome-extension-daily-release.yml",
		"chrome-extension-bump-version.yml",
	}
	vendoredWorkflows = append(append([]string{}, orchestratorCalls...), "deploy-privacy-page.yml")
	vendoredActions   = []string{"read-release-config", "bump-extension-patch", "report-failure"}
)

// Whether the repo ships to the store gates the pack's whole release half,
// coded and declared checks alike: either signal is enough, a workflow
// carrying the orchestrator's name (legacy "Release" included) or a
// .github/release.config, so neither check that judges one is made
// unreachable by the other's absence. The declared checks' relevantWhen
// carries the same two patterns, which a test holds equal to these.
var (
	shipsPipelinePath = regexp.MustCompile(`^\.github\/(?:workflows\/[^/]+\.ya?ml|release\.config)$`)
	shipsPipelineText = regexp.MustCompile(`(?m)^(?:name:\s*['"]?(?:Release to Chrome Store|Release)['"]?\s*|manifest_path=.*)$`)
	workflowName      = regexp.MustCompile(`(?m)^name:\s*['"]?(.+?)['"]?\s*$`)
	scheduleCron      = regexp.MustCompile(`(?m)^\s*-\s*cron:\s*['"]?([^'"\n]+?)['"]?\s*$`)
)

func shipsReleasePipeline(repo checksdk.Repo) bool {
	for _, f := range repo.Tracked() {
		if !shipsPipelinePath.MatchString(f) {
			continue
		}
		text, _ := repo.Read(f)
		if shipsPipelineText.MatchString(text) {
			return true
		}
	}
	return false
}

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "release-workflows",
		Tags: []string{"world"},
		Doc:  "packs/chrome-extension/skills/chrome-store-releases/SKILL.md",
		Why:  "every extension repo ships the same pipeline entirely from its own .github/ — vendored from the pack, kept in sync by the update, with no cross-repo @main dependency",
		Run:  releaseWorkflows,
	})
}

func releaseWorkflows(repo checksdk.Repo) []checksdk.Finding {
	if !shipsReleasePipeline(repo) {
		return nil
	}
	path := ".github/workflows/" + stubFile
	text, ok := repo.Read(path)
	if !ok {
		return []checksdk.Finding{{
			Path:     path,
			Sentence: stubFile + " is missing",
			Fix:      "copy the vendored release set from this pack (stubs/workflows/ + stubs/actions/); the orchestrator is stubs/workflows/chrome-extension-release.yml",
		}}
	}
	var out []checksdk.Finding
	name, named := "", false
	if m := workflowName.FindStringSubmatch(text); m != nil {
		name, named = m[1], true
	}
	if name != stubName {
		shown := name
		if !named {
			shown = "(none)"
		}
		out = append(out, checksdk.Finding{
			Path:     path,
			Sentence: fmt.Sprintf(`name: is "%s" — the contract requires "%s"`, shown, stubName),
			Fix:      fmt.Sprintf(`set "name: %s"`, stubName),
		})
	}
	// Once the vendored scheduler is present the store-release task drives the
	// daily release, so the orchestrator must carry no cron; before, it must
	// carry the contract's.
	_, cutOver := repo.Read(".github/workflows/claudinite-scheduler.yml")
	cron, hasCron := "", false
	if m := scheduleCron.FindStringSubmatch(text); m != nil {
		cron, hasCron = m[1], true
	}
	switch {
	case cutOver && hasCron:
		out = append(out, checksdk.Finding{
			Path:     path,
			Sentence: fmt.Sprintf(`has a schedule cron "%s", but this repo runs the Claudinite scheduler — the store-release task drives the daily release, so the orchestrator must be dispatch-only`, cron),
			Fix:      "remove the schedule: trigger from the orchestrator (keep push + workflow_dispatch); the store-release task fires the daily release",
		})
	case !cutOver && cron != stubCron:
		shown := "(none)"
		if cron != "" {
			shown = `"` + cron + `"`
		}
		out = append(out, checksdk.Finding{
			Path:     path,
			Sentence: fmt.Sprintf(`schedule cron is %s — the contract requires "%s"`, shown, stubCron),
			Fix:      fmt.Sprintf(`set the schedule trigger to - cron: "%s" (or re-copy the orchestrator from the pack's stubs/workflows/)`, stubCron),
		})
	}
	for _, call := range orchestratorCalls {
		if !strings.Contains(text, "./.github/workflows/"+call) {
			out = append(out, checksdk.Finding{
				Path:     path,
				Sentence: "does not call the local reusable workflow ./.github/workflows/" + call,
				Fix:      fmt.Sprintf("re-copy the orchestrator from the pack (stubs/workflows/%s)", stubFile),
			})
		}
	}
	for _, wf := range vendoredWorkflows {
		if _, ok := repo.Read(".github/workflows/" + wf); !ok {
			out = append(out, checksdk.Finding{
				Path:     ".github/workflows/" + wf,
				Sentence: fmt.Sprintf("vendored reusable workflow %s is missing", wf),
				Fix:      fmt.Sprintf("copy it from the chrome-extension pack (stubs/workflows/%s)", wf),
			})
		}
	}
	for _, act := range vendoredActions {
		p := ".github/actions/" + act + "/action.yml"
		if _, ok := repo.Read(p); !ok {
			out = append(out, checksdk.Finding{
				Path:     p,
				Sentence: fmt.Sprintf("vendored composite action %s is missing", act),
				Fix:      fmt.Sprintf("copy it from the chrome-extension pack (stubs/actions/%s/)", act),
			})
		}
	}
	return out
}
