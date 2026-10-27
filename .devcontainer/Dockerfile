# Dev container for bedrock (Next.js 16 + Bun).
# Fedora-based image with the container client and opencode preinstalled (see
# this Dockerfile); Bun comes from the devcontainer feature in
# devcontainer.json, so Dependabot tracks it.
# Podman users: point your editor's devcontainer docker path at podman,
# e.g. VS Code: "dev.containers.dockerPath": "podman"
FROM quay.io/fedora/fedora:46

RUN dnf -y install \
        git \
        make \
        curl \
        unzip \
        openssh-clients \
        podman \
        podman-compose \
    && dnf clean all

RUN useradd -u 1000 -ms /bin/bash vscode \
    && mkdir -p /home/vscode/.config/opencode /home/vscode/.local/share/opencode \
    && chown -R vscode:vscode /home/vscode

# opencode tracks the current release rather than a pinned version: the host's
# `~/.local/share/opencode` is bind-mounted into the container, so the CLI in the
# image has to match the v2 install writing that data.
RUN set -e; \
    case "$(uname -m)" in \
        x86_64)  oc=x64   ;; \
        aarch64) oc=arm64 ;; \
        *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://opencode.ai/update/api/latest/cli/opencode/opencode-linux-${oc}.tar.gz" | tar -xz -C /usr/local/bin opencode; \
    chmod +x /usr/local/bin/opencode
