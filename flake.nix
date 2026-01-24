{
  description = "Resend MCP Server - AI-powered email management via Resend API";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        resend-mcp-server = pkgs.callPackage ./package.nix { };
      in
      {
        # Development shell
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Core utilities
            wget
            yq
            jq
            curl
            tree

            # Runtime environments
            nodejs_24
            nodePackages.npm
            nodePackages.typescript-language-server # Editor integration only

            # NOTE: All Node.js packages (TypeScript, etc.) are managed via
            # package.json, NOT in Nix. Nix only provides Node.js and npm.

            # Git & GitHub
            gh # GitHub CLI for PR workflows

            # Secrets management
            sops
            age
          ];

          shellHook = ''
            # Decrypt MCP environment if it exists
            if [ -f ./.mcp.env.enc ]; then
              sops -d ./.mcp.env.enc > .env.mcp 2>/dev/null || echo "WARNING: Could not decrypt .mcp.env.enc"
            fi

            echo "Resend MCP Server - Development Environment (Nix)"
            echo ""
            echo "Node.js: $(node --version)"
            echo "npm: $(npm --version)"
            echo ""

            # Check if npm packages are installed
            if [ -d "node_modules" ]; then
              echo "TypeScript: $(npx tsc --version 2>/dev/null || echo 'not found')"
            else
              echo "Node modules: Not installed"
              echo ""
              echo "Run: npm install"
            fi

            echo ""
            echo "Quick Start:"
            echo "  1. npm install          - Install dependencies"
            echo "  2. npm run build        - Compile TypeScript"
            echo "  3. npm run dev          - Run server in development mode"
            echo "  4. npm run inspector    - Test with MCP Inspector"
            echo ""
            echo "See README.md for details"
          '';
        };

        # Production package
        packages.default = resend-mcp-server;

        # App for running the server
        apps.default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/resend-mcp-server";
        };
      }
    );
}
