#!/usr/bin/env bash
# Warns at every session start while Claude Code is older than this plugin needs.
#
# Claude Code can't refuse to install a plugin on an older version, and on one that lacks an
# event the plugin's hooks module uses, it silently refuses the whole module. This plain command
# hook still runs in that case, so the user learns why the plugin does nothing and how to fix it.
#
# hooks.json: bash "${CLAUDE_PLUGIN_ROOT}/hooks/version-guard.sh" PLUGIN_NAME MINIMUM_VERSION
set -u
name="${1:?plugin name}"
need="${2:?minimum Claude Code version}"

have="${VERSION_GUARD_HAVE:-$(claude --version 2>/dev/null | awk '{print $1}')}"
[ -n "$have" ] || exit 0  # can't tell: say nothing rather than guess

# 0 when $1 is older than $2, comparing major.minor.patch numerically ("2.1.280-dev..." -> 2.1.280).
older() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { xi = x[i] + 0; yi = y[i] + 0; if (xi < yi) exit 0; if (xi > yi) exit 1 }
    exit 1
  }'
}

if older "$have" "$need"; then
  printf '{"systemMessage": "%s needs Claude Code %s or later (this is %s), so it is switched off. Run: claude update"}\n' \
    "$name" "$need" "$have"
fi
exit 0
