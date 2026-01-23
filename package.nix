{
  pkgs,
  version ? "0.1.0",
}:

pkgs.buildNpmPackage {
  pname = "resend-mcp-server";
  inherit version;
  src = ./.;

  npmDepsHash = "sha256-6UKWIKoWtUQ/blfXLh12IXan9XdCky10LCp2NP7jlxo=";

  # Native dependencies for sharp (used by @xenova/transformers)
  nativeBuildInputs = with pkgs; [
    pkg-config
    python3
  ];

  buildInputs = with pkgs; [
    vips
  ];

  # Use system libvips instead of downloading
  SHARP_FORCE_GLOBAL_LIBVIPS = "1";

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
    mainProgram = "resend-mcp-server";
    maintainers = [ ];
  };
}
