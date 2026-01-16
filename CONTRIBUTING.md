# Contributing to resend-mcp-server

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Contributor License Agreement (CLA)

This project requires contributors to sign a Contributor License Agreement (CLA) before their contributions can be merged.

### Why Do We Have a CLA?

**resend-mcp-server** uses a dual-licensing model:

| License | Availability | Requirements |
|---------|--------------|--------------|
| **AGPL-3.0** | Always free | Must share modifications if deployed |
| **Commercial** | Paid license | No copyleft obligations |

The CLA ensures the project maintainer has the rights needed to offer both licensing options. This model is used by many successful projects including Grafana, MongoDB, and others.

### What You're Agreeing To

By signing the CLA, you:

- **Grant** a broad license for your contributions to be used under AGPL-3.0 and commercial terms
- **Retain** full copyright ownership of your code
- **Can** use your contributions in your own projects under any terms you choose
- **Confirm** that you have the right to make the contribution

### How to Sign

When you open a pull request, a bot will automatically check if you've signed the CLA:

1. If you haven't signed, the bot will comment with instructions
2. Read the [CLA document](./CLA.md)
3. Reply to the PR with: `I have read the CLA Document and I hereby sign the CLA`
4. The bot will record your signature and update the PR status

**This is a one-time process** - once signed, it applies to all your future contributions.

---

## Development Setup

### Prerequisites

- Node.js 20+
- npm or pnpm
- A Resend API key (get one at [resend.com](https://resend.com))

### Getting Started

```bash
# Clone the repository
git clone https://github.com/gui-wf/resend-mcp-server.git
cd resend-mcp-server

# Install dependencies
npm install

# Set up environment
export RESEND_API_KEY="re_your_api_key_here"

# Run in development mode
npm run dev

# Run tests
npm test
```

### Using Nix (Recommended)

If you have Nix installed with flakes enabled:

```bash
# Enter development shell
nix develop

# All dependencies are automatically available
npm install
npm run dev
```

---

## Code Guidelines

### TypeScript

- Use ES modules (`import`/`export`), not CommonJS
- Include explicit return types for functions
- Use Zod for runtime validation
- Follow the existing code style

### MCP Tools

When adding new tools:

1. Create a new file in `src/tools/<category>/`
2. Define input schema with Zod
3. Implement the tool class with `getDefinition()` and `execute()` methods
4. Register the tool in `src/tools/index.ts`
5. Add appropriate annotations (`readOnlyHint`, `destructiveHint`, etc.)

### Commits

- Write clear, concise commit messages
- Use conventional commit format when possible:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation
  - `refactor:` for code changes that don't add features or fix bugs

---

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/my-feature`)
3. **Make** your changes
4. **Test** your changes thoroughly
5. **Sign** the CLA when prompted
6. **Submit** a pull request

### PR Requirements

- [ ] Code follows project style guidelines
- [ ] Tests pass (if applicable)
- [ ] Documentation updated (if applicable)
- [ ] CLA signed

---

## Reporting Issues

When reporting issues, please include:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (Node.js version, OS, etc.)
- Relevant error messages or logs

---

## Questions?

If you have questions about contributing, feel free to:

- Open a GitHub issue
- Start a discussion in the repository

Thank you for contributing!
