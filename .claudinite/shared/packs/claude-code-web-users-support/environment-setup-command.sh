#!/usr/bin/env bash
# The body a project pastes into its Claude Code Web environment's Setup script
# field, whole and unedited. Generic for every project — README.md explains why,
# and the pack's adoptionHandover step quotes this body into the issue that asks
# somebody to paste it.

# Runs when the environment image is built, starting in the checkout's PARENT
# dir, so it runs each checkout's generated env setup script rather than
# assuming one checkout; it never fails, since a failing setup script takes the
# session down with it.
for f in .claudinite/cache/env-setup.GENERATED.sh */.claudinite/cache/env-setup.GENERATED.sh; do [ -f "$f" ] && bash "$f"; done; true
