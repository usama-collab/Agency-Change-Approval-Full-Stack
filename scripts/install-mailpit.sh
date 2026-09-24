#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
version=v1.27.0
# Digests from the assets in the pinned GitHub release.
case "$(uname -sm)" in
  'Linux x86_64') archive=mailpit-linux-amd64.tar.gz; checksum=629d29442499976ebe271570bac07106c2a0667ba37d2358efbbaff25fd583a1 ;;
  'Linux aarch64') archive=mailpit-linux-arm64.tar.gz; checksum=ac5312fd83151fe4e758c3de52a58a2bca8c85f83d7494cb82f27a8d303617a7 ;;
  *) echo 'This helper supports Linux amd64 and arm64.' >&2; exit 1 ;;
esac
mkdir -p .local/bin .local/downloads
verify() {
  printf "%s  %s\n" "$checksum" ".local/downloads/$archive" | sha256sum --check --status -
}
if ! verify 2>/dev/null; then
  curl --fail --silent --show-error --location "https://github.com/axllent/mailpit/releases/download/$version/$archive" --output ".local/downloads/$archive"
fi
verify
if ! tar -xOf ".local/downloads/$archive" mailpit | cmp -s .local/bin/mailpit -; then
  tar -xzf ".local/downloads/$archive" -C .local/bin mailpit
fi
printf 'Mailpit %s installed and checksum verified.\n' "$version"
