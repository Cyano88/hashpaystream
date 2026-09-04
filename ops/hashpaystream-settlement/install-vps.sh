#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' 'Run this installer with sudo.' >&2
  exit 1
fi

for command_name in curl git sha256sum sudo tar; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "${command_name}" >&2
    exit 1
  }
done

if ! id hashpaystream >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash hashpaystream
fi

install -d -o hashpaystream -g hashpaystream -m 0750 /opt/hashpaystream-worker
install -d -o hashpaystream -g hashpaystream -m 0700 /var/lib/hashpaystream-worker
install -d -o root -g hashpaystream -m 0750 /etc/hashpaystream-worker

case "$(uname -m)" in
  x86_64) node_arch='x64' ;;
  aarch64|arm64) node_arch='arm64' ;;
  *)
    printf '%s\n' 'This VPS architecture is not supported by the worker installer.' >&2
    exit 1
    ;;
esac

node_stage="$(mktemp -d)"
trap 'rm -rf -- "${node_stage}"' EXIT
curl --fail --silent --show-error --location \
  https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt \
  --output "${node_stage}/SHASUMS256.txt"
node_archive="$(awk -v arch="${node_arch}" '$2 ~ ("node-v22\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") { print $2; exit }' "${node_stage}/SHASUMS256.txt")"
if [[ -z "${node_archive}" ]]; then
  printf '%s\n' 'A verified Node.js 22 Linux archive was not found.' >&2
  exit 1
fi
curl --fail --silent --show-error --location \
  "https://nodejs.org/dist/latest-v22.x/${node_archive}" \
  --output "${node_stage}/${node_archive}"
(
  cd "${node_stage}"
  sha256sum --check --ignore-missing SHASUMS256.txt
)
node_version="${node_archive%-linux-${node_arch}.tar.xz}"
node_directory="/opt/hashpaystream-worker/${node_version}"
if [[ ! -x "${node_directory}/bin/node" ]]; then
  install -d -o root -g root -m 0755 "${node_directory}"
  tar -xJf "${node_stage}/${node_archive}" -C "${node_directory}" --strip-components=1
fi
ln -sfnT "${node_directory}" /opt/hashpaystream-worker/node
node_bin=/opt/hashpaystream-worker/node/bin/node
npm_bin=/opt/hashpaystream-worker/node/bin/npm
"${node_bin}" --version | grep -Eq '^v22\.'

git_ref="${HASHPAYSTREAM_GIT_REF:-main}"
repository_url="${HASHPAYSTREAM_REPOSITORY_URL:-https://github.com/Cyano88/hashpaystream.git}"

if [[ -d /opt/hashpaystream-worker/app/.git ]]; then
  sudo -u hashpaystream git -C /opt/hashpaystream-worker/app fetch origin "${git_ref}"
  sudo -u hashpaystream git -C /opt/hashpaystream-worker/app checkout "${git_ref}"
  sudo -u hashpaystream git -C /opt/hashpaystream-worker/app merge --ff-only "origin/${git_ref}"
else
  sudo -u hashpaystream git clone --branch "${git_ref}" --single-branch \
    "${repository_url}" /opt/hashpaystream-worker/app
fi

sudo -u hashpaystream env HOME=/home/hashpaystream PATH=/opt/hashpaystream-worker/node/bin:/usr/bin:/bin "${npm_bin}" --prefix /opt/hashpaystream-worker/app ci

install -o root -g root -m 0644 \
  /opt/hashpaystream-worker/app/ops/hashpaystream-settlement/hashpaystream-settlement-worker.service \
  /etc/systemd/system/hashpaystream-settlement-worker.service

if [[ ! -e /etc/hashpaystream-worker/worker.env ]]; then
  install -o root -g hashpaystream -m 0640 \
    /opt/hashpaystream-worker/app/ops/hashpaystream-settlement/worker.env.example \
    /etc/hashpaystream-worker/worker.env
fi

systemctl daemon-reload

sudo -u hashpaystream env HOME=/home/hashpaystream PATH=/opt/hashpaystream-worker/node/bin:/usr/bin:/bin "${npm_bin}" --prefix /opt/hashpaystream-worker/app run typecheck
sudo -u hashpaystream env HOME=/home/hashpaystream PATH=/opt/hashpaystream-worker/node/bin:/usr/bin:/bin "${npm_bin}" --prefix /opt/hashpaystream-worker/app run test:upfront-settlement
sudo -u hashpaystream env HOME=/home/hashpaystream PATH=/opt/hashpaystream-worker/node/bin:/usr/bin:/bin "${npm_bin}" --prefix /opt/hashpaystream-worker/app run test:upfront-settlement-daemon

printf 'PolyDesk daemon: %s\n' "$(systemctl is-active polydesk-a2a-daemon 2>/dev/null || true)"
printf 'HashPayStream Node: %s\n' "$("${node_bin}" --version)"
printf 'HashPayStream commit: %s\n' "$(sudo -u hashpaystream git -C /opt/hashpaystream-worker/app rev-parse --short HEAD)"
printf '%s\n' 'Installation complete. Configure worker.env and run staging checks before enabling the service.'
