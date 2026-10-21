#!/bin/sh
# Claudinite engine setup. A member checks this file in as
# .claudinite/setup-cn.sh, unchanged; only the engine update replaces it.
#
#   sh .claudinite/setup-cn.sh    fetch, verify and cache the pinned engine, and link .claudinite/bin/cn to it
#
# It reads engine.version and engine.manifest from .claudinite/settings.yaml,
# downloads that release's manifest.json and this platform's
# binary from the npm registry, or from the GitHub releases of the
# repository engine.releases names (owner/name, tag v<version>, assets named
# as npm's tarballs), checks the manifest against the pin and the
# binary against the manifest, caches the binary read-only and links
# .claudinite/bin/cn to it. Nothing is trusted that the pin
# does not cover; the registry's identity is immaterial to integrity.
#
# It never runs cn: every caller runs .claudinite/bin/cn itself once this
# exits 0. On a failure it removes that link, so no other engine runs in
# its place, says why on stderr, prints a line telling the session to stop
# and ask the person on stdout, and exits 1.
#
#   sh setup-cn.sh --from-package DIR
#
# The @claudinite/cli package carries this file as package/launch, beside
# its manifest.json and manifest.sig.json, for its npx bin to adopt a
# repository with: from DIR, the folder the package unpacked to, it takes
# the version and the binary's hash from the package's own manifest.json,
# fetches and checks the binary as above, caches it with the manifest and
# manifest.sig.json, which cn adopt verifies before it writes anything, and
# prints the binary's path instead of linking it. Windows is not covered:
# npm's shim for a sh script there is the desktop work.
#
# CLAUDINITE_REGISTRY overrides the registry, CLAUDINITE_GITHUB the GitHub
# host releases are read from and CLAUDINITE_MAX_DOWNLOAD_BYTES the download
# size cap; all three exist for tests and the rehearsal.
set -u

registry=${CLAUDINITE_REGISTRY:-https://registry.npmjs.org}
github=${CLAUDINITE_GITHUB:-https://github.com}
max_bytes=${CLAUDINITE_MAX_DOWNLOAD_BYTES:-67108864}

# Run as .claudinite/launch, the name engines before the rename wrote it
# under and every caller they wired still names, it is that launcher: it
# runs cn with its arguments once the engine is in place, and a failure
# exits as each of those callers expects.
#
# @legacy-tolerance advisory:launcher-renamed retire:#224
legacy=
if [ "${0##*/}" = launch ] && [ "${1:-}" != --from-package ]; then
  if [ "${1:-}" = hook ] && [ "${2:-}" = session-start ]; then
    legacy=session-start
  elif [ "${1:-}" = hook ]; then
    legacy=guard
  else
    legacy='command'
  fi
fi

tmp=
here=
cleanup() {
  if [ -n "$tmp" ]; then
    chmod -R u+w "$tmp" 2>/dev/null
    rm -rf "$tmp"
    tmp=
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 1' HUP INT TERM

say() {
  printf 'claudinite setup: %s\n' "$*" >&2
}

# fail_with CODE: the engine never runs, so the link to it goes.
fail_with() {
  cleanup
  if [ -n "$here" ] && [ -z "$from_package" ]; then
    rm -f "$here/bin/cn" "$here/bin/cn.exe"
  fi
  exit "$1"
}

# A configuration or integrity failure.
refuse() {
  say "$1"
  printf 'Claudinite refused to set up its engine: %s: stop and ask the person before continuing.\n' "$1"
  case $legacy in
    session-start) fail_with 0 ;;
    guard) fail_with 2 ;;
  esac
  fail_with 1
}

# The registry could not be reached; nothing verified is cached.
unreachable() {
  say "could not fetch the engine from $1"
  printf 'Claudinite could not fetch its engine from %s: stop and ask the person before continuing.\n' "$1"
  case $legacy in
    session-start | guard) fail_with 0 ;;
  esac
  fail_with 1
}

from_package=
if [ -z "$legacy" ]; then
  while [ $# -gt 0 ]; do
    case $1 in
      --from-package)
        [ $# -ge 2 ] || refuse "--from-package needs the package's folder"
        from_package=$2
        shift 2 ;;
      --from-package=*)
        from_package=${1#*=}
        shift ;;
      *) refuse "unknown argument $1: setup-cn.sh takes only --from-package DIR" ;;
    esac
  done
fi

# The shapes a value must have, by shell patterns alone: the script runs
# once per session and per workflow step, and each tool it starts costs a
# process.
digits() {
  case $1 in '' | *[!0-9]*) return 1 ;; esac
}
is_version() {
  case $1 in *.*.*) ;; *) return 1 ;; esac
  set -- "${1%%.*}" "${1#*.}"
  set -- "$1" "${2%%.*}" "${2#*.}"
  digits "$1" && digits "$2" && digits "$3"
}
is_package() {
  case $1 in @claudinite/cli | @claudinite/cli-rc) ;; *) return 1 ;; esac
}
is_pin() {
  case $1 in sha512-*==) ;; *) return 1 ;; esac
  set -- "${1#sha512-}"
  set -- "${1%==}"
  [ "${#1}" -eq 86 ] || return 1
  case $1 in *[!A-Za-z0-9+/]*) return 1 ;; esac
}

# dir_of PATH sets dir to PATH's folder, as dirname would.
dir_of() {
  case $1 in
    */*) dir=${1%/*}; [ -n "$dir" ] || dir=/ ;;
    *) dir=. ;;
  esac
}

# Step 1: the pin, from the settings file.

if [ -n "$from_package" ]; then
  pkgdir=$(cd "$from_package" && pwd) || refuse "cannot locate the package folder $from_package"
  if [ ! -f "$pkgdir/manifest.json" ] || [ ! -f "$pkgdir/package.json" ]; then
    refuse "$pkgdir holds no manifest.json and package.json"
  fi
  settings=$pkgdir/manifest.json
  [ -f "$pkgdir/manifest.sig.json" ] || refuse "$pkgdir holds no manifest.sig.json, and cn adopt never runs from an unsigned manifest"
else
  dir_of "$0"
  here=$(cd "$dir" && pwd) || refuse "cannot locate the .claudinite folder"
  settings=$here/settings.yaml
  [ -f "$settings" ] || refuse ".claudinite/settings.yaml does not exist in ${here%/.claudinite}"
fi

# The engine block's values, read in one pass. No parser: the values the
# script needs are plain quoted strings, read with a strict pattern. A key
# absent reads empty; a key present twice reads "duplicate", and one not
# holding a plain quoted string, or a releases value not naming a GitHub
# repository, "malformed". The pass also decodes the pin to the lowercase
# hex the hash tools print.
read_pin() {
  awk -v repo='[A-Za-z0-9-]+/[A-Za-z0-9_-][A-Za-z0-9._-]*' '
  function value(key,   n, i, line, v, found) {
    n = 0
    for (i = 1; i <= nlines; i++) {
      line = lines[i]
      if (line ~ ("^[ \t]*\"?" key "\"?[ \t]*:")) { n++; found = line }
    }
    if (n == 0) return ""
    if (n > 1) return "duplicate"
    if (found !~ ("^[ \t]*\"?" key "\"?[ \t]*:[ \t]*\"[^\"]*\"[ \t]*$")) return "malformed"
    v = found
    sub("^[ \t]*\"?" key "\"?[ \t]*:[ \t]*\"", "", v)
    sub("\"[ \t]*$", "", v)
    return (v == "") ? "malformed" : v
  }
  function hex(b64,   a, h, i, c, bits, nb, p, byte, out) {
    a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    for (i = 0; i < 64; i++) dv[substr(a, i + 1, 1)] = i
    h = "0123456789abcdef"
    bits = 0; nb = 0; out = ""
    for (i = 1; i <= length(b64); i++) {
      c = substr(b64, i, 1)
      if (c == "=") break
      bits = bits * 64 + dv[c]; nb += 6
      if (nb >= 8) {
        nb -= 8; p = 2 ^ nb
        byte = int(bits / p); bits -= byte * p
        out = out substr(h, int(byte / 16) + 1, 1) substr(h, byte % 16 + 1, 1)
      }
    }
    return out
  }
  /^engine:[ \t]*$/ { inb = 1; next }
  inb && /^[^ \t]/ { inb = 0 }
  inb { lines[++nlines] = $0 }
  END {
    pin = value("manifest")
    print value("version")
    print pin
    print value("package")
    releases = value("releases")
    if (releases != "" && releases !~ ("^" repo "$")) releases = "malformed"
    print releases
    print (pin ~ /^sha512-/) ? hex(substr(pin, 8)) : ""
  }' "$settings"
}

if [ -n "$from_package" ]; then
  # The version and package as the package npx unpacked names them; the
  # manifest's own hash stands in for the pin.
  version=$(sed -n 's/^ *"version": *"\([0-9]*\.[0-9]*\.[0-9]*\)",\{0,1\}$/\1/p' "$pkgdir/manifest.json" | head -n 1)
  package=$(sed -n 's/^ *"name": *"\(@claudinite\/cli[-a-z]*\)",\{0,1\}$/\1/p' "$pkgdir/package.json" | head -n 1)
  is_version "$version" || refuse "$pkgdir/manifest.json names no version"
  is_package "$package" \
    || refuse "$pkgdir/package.json must name \"@claudinite/cli\" or \"@claudinite/cli-rc\""
else
  pinned=$(read_pin) || refuse "cannot read $settings"
  version='' manifest_pin='' package='' releases='' pin_hex=''
  { read -r version; read -r manifest_pin; read -r package; read -r releases; read -r pin_hex; } <<EOF
$pinned
EOF
  [ -n "$package" ] || package=@claudinite/cli

  is_version "$version" \
    || refuse "engine.version in $settings must be a quoted version like \"1.60928.1\""
  is_pin "$manifest_pin" \
    || refuse "engine.manifest in $settings must be a quoted sha512-... integrity string"
  is_package "$package" \
    || refuse "engine.package in $settings must be \"@claudinite/cli\" or \"@claudinite/cli-rc\""
  case $releases in
    '' | */*) ;;
    *) refuse "engine.releases in $settings must be a quoted GitHub repository like \"owner/name\"" ;;
  esac
fi

uname=$(uname -s -m)
case ${uname% *} in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  MINGW*|MSYS*|CYGWIN*) os=windows ;;
  *) refuse "unsupported operating system ${uname% *}" ;;
esac
case ${uname##* } in
  x86_64|amd64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) refuse "unsupported processor ${uname##* }" ;;
esac
bin=cn
bin_re=cn
if [ "$os" = windows ]; then
  [ "$arch" = x64 ] || refuse "unsupported platform windows-$arch"
  bin=cn.exe
  bin_re='cn\.exe'
fi
platform=$os-$arch

if command -v sha256sum >/dev/null 2>&1; then
  sha256() { set -- "$(sha256sum < "$1")"; printf '%s\n' "${1%% *}"; }
  sha512() { set -- "$(sha512sum < "$1")"; printf '%s\n' "${1%% *}"; }
elif command -v shasum >/dev/null 2>&1; then
  sha256() { set -- "$(shasum -a 256 < "$1")"; printf '%s\n' "${1%% *}"; }
  sha512() { set -- "$(shasum -a 512 < "$1")"; printf '%s\n' "${1%% *}"; }
elif command -v openssl >/dev/null 2>&1; then
  sha256() { set -- "$(openssl dgst -sha256 < "$1")"; printf '%s\n' "${1##* }"; }
  sha512() { set -- "$(openssl dgst -sha512 < "$1")"; printf '%s\n' "${1##* }"; }
else
  refuse "no SHA-256 tool found (sha256sum, shasum or openssl)"
fi
for tool in curl tar; do
  command -v "$tool" >/dev/null 2>&1 || refuse "$tool is not installed; the engine setup needs it to fetch the engine"
done

# The package's pin is the hash of the manifest npx unpacked, as the
# lowercase hex the hash tools print; a settings file's pin was decoded to
# that hex as it was read.
if [ -n "$from_package" ]; then
  pin_hex=$(sha512 "$pkgdir/manifest.json")
fi

# This platform's SHA-256 from a manifest.json whose hash matched the pin.
manifest_entry() {
  sed -n "s/^ *\"$platform\": {\"file\": \"$bin_re\", \"sha256\": \"\([0-9a-f]\{64\}\)\", \"size\": [0-9]*},\{0,1\}\$/\1/p" "$1"
}

# Step 2: the cache, re-hashed on every run.

if [ -z "${XDG_CACHE_HOME:-}" ] && [ -z "${HOME:-}" ]; then
  refuse "HOME is not set, so there is no cache folder (set HOME or XDG_CACHE_HOME)"
fi
cache_root=${XDG_CACHE_HOME:-$HOME/.cache}/claudinite
vdir=$cache_root/$version

private_dir() {
  if [ ! -d "$1" ]; then
    (umask 077 && mkdir -p "$1") || refuse "cannot create the cache directory $1"
  fi
  [ -L "$1" ] && refuse "the cache directory $1 is a symbolic link"
  [ "$os" = windows ] && return 0
  # shellcheck disable=SC3067 # -O is in every sh the script runs under (dash, bash, busybox, zsh)
  [ -O "$1" ] || private_refused "$1"
}
# private_refused names the mode and owner found on a cache folder that is
# not mode 0700 and owned by you.
private_refused() {
  # shellcheck disable=SC2012 # ls -ldn is the portable way to read mode and uid
  set -- "$1" "$(ls -ldn "$1" | awk '{ print $1 " " $3 }')"
  refuse "the cache directory $1 must be mode 0700 and owned by you (found ${2% *})"
}
private_dir "$cache_root"
private_dir "$vdir"
# One find answers both folders' modes, printing each one that is exactly
# 0700.
if [ "$os" != windows ]; then
  private=$(find "$cache_root" "$vdir" -prune -perm 0700)
  for d in "$cache_root" "$vdir"; do
    case "
$private
" in
      *"
$d
"*) ;;
      *) private_refused "$d" ;;
    esac
  done
fi

cached_ok() {
  [ -f "$vdir/manifest.json" ] && [ -f "$vdir/$bin" ] || return 1
  [ "$(sha512 "$vdir/manifest.json")" = "$pin_hex" ] || return 1
  want=$(manifest_entry "$vdir/manifest.json")
  [ -n "$want" ] && [ "$(sha256 "$vdir/$bin")" = "$want" ]
}

if ! cached_ok; then
  chmod u+w "$vdir/manifest.json" "$vdir/$bin" 2>/dev/null
  rm -f "$vdir/manifest.json" "$vdir/$bin"

  # Step 3: download by exact tarball URL, HTTPS only, with a size cap.

  digits "$max_bytes" || refuse "CLAUDINITE_MAX_DOWNLOAD_BYTES must be a number"
  # A whole transfer may take as long as the cap at about 220 kB/s, and never
  # less than 30 s: the 64 MiB default allows about 300 s. --max-filesize
  # bounds only the compressed size, so the wall clock is what stops a
  # registry that stalls or trickles.
  max_time=$((max_bytes / 220000))
  [ "$max_time" -ge 30 ] || max_time=30
  tmp=$(mktemp -d "$vdir/.download.XXXXXX") || refuse "cannot create a temporary folder in $vdir"

  fetch() {
    curl --proto =https --proto-redir =https --tlsv1.2 --fail --silent --show-error --location \
      --connect-timeout 20 --max-time "$max_time" --max-filesize "$max_bytes" --output "$2" "$1" < /dev/null
    status=$?
    if [ "$status" -eq 63 ]; then
      refuse "$1 is larger than the $max_bytes-byte download cap"
    elif [ "$status" -ne 0 ]; then
      unreachable "$1"
    fi
    size=$(wc -c < "$2" | tr -d ' ')
    [ "$size" -le "$max_bytes" ] || refuse "$1 is larger than the $max_bytes-byte download cap"
  }

  name=${package#@claudinite/}
  if [ -n "${releases:-}" ]; then
    manifest_url=$github/$releases/releases/download/v$version/$name-$version.tgz
    binary_url=$github/$releases/releases/download/v$version/$name-$platform-$version.tgz
  else
    manifest_url=$registry/$package/-/$name-$version.tgz
    binary_url=$registry/$package-$platform/-/$name-$platform-$version.tgz
  fi

  fetch "$manifest_url" "$tmp/manifest.tgz"
  tar -xzf "$tmp/manifest.tgz" -C "$tmp" package/manifest.json 2>/dev/null \
    || refuse "$manifest_url holds no package/manifest.json"

  # Step 4: the manifest against the pin, the binary against the manifest.

  [ "$(sha512 "$tmp/package/manifest.json")" = "$pin_hex" ] \
    || refuse "manifest.json of $package $version does not match the pin in $settings"
  want=$(manifest_entry "$tmp/package/manifest.json")
  [ -n "$want" ] || refuse "$package $version lists no binary for $platform"

  mkdir "$tmp/platform" || refuse "cannot unpack into $tmp"
  fetch "$binary_url" "$tmp/platform.tgz"
  tar -xzf "$tmp/platform.tgz" -C "$tmp/platform" "package/bin/$bin" 2>/dev/null \
    || refuse "$binary_url holds no package/bin/$bin"
  [ "$(sha256 "$tmp/platform/package/bin/$bin")" = "$want" ] \
    || refuse "the $platform binary of $package $version does not match its manifest entry"

  if ! { chmod 0555 "$tmp/platform/package/bin/$bin" && chmod 0444 "$tmp/package/manifest.json" \
    && mv -f "$tmp/platform/package/bin/$bin" "$vdir/$bin" \
    && mv -f "$tmp/package/manifest.json" "$vdir/manifest.json"; }; then
    refuse "cannot place the engine in $vdir"
  fi
  cleanup
fi

if [ -n "$from_package" ]; then
  chmod u+w "$vdir/manifest.sig.json" 2>/dev/null
  { cp "$pkgdir/manifest.sig.json" "$vdir/.manifest.sig.json.$$" && chmod 0444 "$vdir/.manifest.sig.json.$$" \
    && mv -f "$vdir/.manifest.sig.json.$$" "$vdir/manifest.sig.json"; } || refuse "cannot place manifest.sig.json in $vdir"
  printf '%s\n' "$vdir/$bin"
  exit 0
fi

# Step 5: link.

# shellcheck disable=SC3013 # -ef is in every sh the script runs under (dash, bash, busybox, zsh)
if [ ! "$here/bin/$bin" -ef "$vdir/$bin" ]; then
  mkdir -p "$here/bin" || refuse "cannot create $here/bin"
  if ! ln -sfn "$vdir/$bin" "$here/bin/$bin" 2>/dev/null; then
    rm -f "$here/bin/$bin"
    cp "$vdir/$bin" "$here/bin/$bin" || refuse "cannot link or copy the engine into $here/bin"
  fi
fi
if [ -n "$legacy" ]; then
  exec "$vdir/$bin" "$@"
fi
