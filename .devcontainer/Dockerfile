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

# Dependabot's docker ecosystem rewrites image tags only, not ARG pins, so this
# version is bumped by hand.
ARG OPENCODE_VERSION=1.18.35

RUN set -e; \
    case "$(uname -m)" in \
        x86_64)  oc=x64   ;; \
        aarch64) oc=arm64 ;; \
        *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-${oc}.tar.gz" | tar -xz -C /usr/local/bin opencode; \
    chmod +x /usr/local/bin/opencode
