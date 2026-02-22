FROM mcr.microsoft.com/vscode/devcontainers/base:ubuntu

RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    ca-certificates \
    tmux \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/root/.bun"
ENV PATH="$BUN_INSTALL/bin:$PATH"

# Install Bun for vscode user
USER vscode
ENV BUN_INSTALL="/home/vscode/.bun"
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/home/vscode/.bun/bin:$PATH"

# Install uv (for MCP server tooling)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/home/vscode/.local/bin:$PATH"

# Install Claude CLI
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/vscode/.claude/local/bin:$PATH"

USER root

# Copy tmux config
COPY .tmux.conf /home/vscode/.tmux.conf
RUN chown vscode:vscode /home/vscode/.tmux.conf

USER vscode
