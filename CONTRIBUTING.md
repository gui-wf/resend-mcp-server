# Contributing to resend-mcp-server

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. By contributing, you agree that your contributions will be licensed under the same license.

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
5. **Submit** a pull request

### PR Requirements

- [ ] Code follows project style guidelines
- [ ] Tests pass (if applicable)
- [ ] Documentation updated (if applicable)

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
