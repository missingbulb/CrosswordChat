#!/usr/bin/env bash
# The body a project pastes into its Claude Code Web environment's Setup script
# field, whole and unedited. Generic for every project — README.md explains why,
# and the pack's adoptionHandover step quotes this body into the issue that asks
# somebody to paste it.

# Runs when the environment image is built, starting in the checkout's PARENT
# dir, so it looks for the checkout holding a launcher rather than assuming one;
# it never fails, since a failing setup script takes the session down with it.
for d in . *; do [ -f "$d/.claudinite/launch" ] && (cd "$d" && sh .claudinite/launch env install); done; true
