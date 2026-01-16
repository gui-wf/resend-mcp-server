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
            nodePackages.typescript-language-server  # Editor integration only

            # AIDEV-NOTE: All Node.js packages (TypeScript, Speakeasy, Spectral, etc.)
            # are managed via package.json, NOT in Nix
            # Nix only provides Node.js binary and npm

            # Git & GitHub
            gh  # GitHub CLI for PR workflows

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
              echo "Speakeasy: $(npx speakeasy --version 2>/dev/null || echo 'not found')"
            else
              echo "Node modules: Not installed"
              echo ""
              echo "Run: npm install"
            fi

            echo ""
            echo "Quick Start:"
            echo "  1. npm install          - Install dependencies"
            echo "  2. npm run generate     - Generate server from OpenAPI"
            echo "  3. npm run build        - Compile TypeScript"
            echo "  4. npm run dev          - Run server in development mode"
            echo "  5. npm run inspector    - Test with MCP Inspector"
            echo ""
            echo "See ROADMAP.md and IMPLEMENTATION_PLAN.md for details"
          '';
        };

        # Production package (update after Speakeasy generation)
        packages.default = pkgs.buildNpmPackage {
          pname = "resend-mcp-server";
          version = "0.1.0";
          src = ./.;

          # AIDEV-TODO: Update npmDepsHash after first build - run: nix build 2>&1 | grep "got:" | awk '{print $2}'
          npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

          buildPhase = ''
            npm run build
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p $out/{bin,lib}

            # Copy compiled code and dependencies
            cp -r dist $out/lib/
            cp -r node_modules $out/lib/
            cp package.json $out/lib/

            # Create executable wrapper
            cat > $out/bin/resend-mcp-server <<EOF
            #!/usr/bin/env bash
            exec ${pkgs.nodejs_24}/bin/node $out/lib/dist/index.js "\$@"
            EOF
            chmod +x $out/bin/resend-mcp-server

            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "MCP server for Resend email API - send emails, manage domains, templates, and contacts";
            license = licenses.agpl3Plus;
            homepage = "https://github.com/gui-wf/resend-mcp-server";
            maintainers = [ ];
          };
        };

        # App for running the server
        apps.default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/resend-mcp-server";
        };
      }
    );
}
