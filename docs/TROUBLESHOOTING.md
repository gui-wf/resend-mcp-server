# Troubleshooting

This guide covers common issues and their solutions when using the Resend MCP Server.

## Table of Contents

- [Server Startup Issues](#server-startup-issues)
- [API Key Problems](#api-key-problems)
- [Tool Execution Errors](#tool-execution-errors)
- [Documentation Search Issues](#documentation-search-issues)
- [Claude Desktop Integration](#claude-desktop-integration)
  - [Connection Timeout on First Run](#connection-timeout-on-first-run)
- [Debug Mode](#debug-mode)

## Server Startup Issues

### Error: RESEND_API_KEY is required

**Symptom:**
```
[config] Configuration validation failed:
  - RESEND_API_KEY: RESEND_API_KEY is required
```

**Cause:** The `RESEND_API_KEY` environment variable is not set.

**Solution:**
1. Get your API key from [Resend Dashboard](https://resend.com/api-keys)
2. Set the environment variable:
   ```bash
   export RESEND_API_KEY="re_your_api_key_here"
   ```
3. Or add it to your Claude Desktop configuration:
   ```json
   {
     "env": {
       "RESEND_API_KEY": "re_your_api_key_here"
     }
   }
   ```

### Error: RESEND_API_KEY must start with 're_'

**Symptom:**
```
[config] Configuration validation failed:
  - RESEND_API_KEY: RESEND_API_KEY must start with 're_'
```

**Cause:** The API key format is invalid.

**Solution:**
- Ensure you copied the complete API key from Resend Dashboard
- Resend API keys always start with the prefix `re_`
- Check for leading/trailing whitespace in your configuration

### Error: Cannot find module

**Symptom:**
```
Error: Cannot find module '@modelcontextprotocol/sdk/server/index.js'
```

**Cause:** Dependencies not installed or corrupted.

**Solution:**
```bash
rm -rf node_modules
npm install
```

If using from npm:
```bash
npm install resend-mcp-server
```

## API Key Problems

### Error: Invalid API Key (401)

**Symptom:**
```json
{
  "error": true,
  "message": "Invalid API key"
}
```

**Cause:** The API key is expired, revoked, or incorrectly configured.

**Solution:**
1. Verify the key exists in [Resend Dashboard](https://resend.com/api-keys)
2. Create a new key if the old one was revoked
3. Update your configuration with the new key

### Error: Rate Limited (429)

**Symptom:**
```json
{
  "error": true,
  "message": "Rate limit exceeded"
}
```

**Cause:** Too many API requests in a short period.

**Solution:**
1. Wait a moment and retry
2. Increase rate limit interval:
   ```bash
   export RESEND_RATE_LIMIT_MS=1000  # 1 second between requests
   ```
3. Use batch operations when sending multiple emails

## Tool Execution Errors

### Tool Not Found

**Symptom:**
```json
{
  "error": "Unknown tool",
  "message": "Tool 'create_contact' is not implemented"
}
```

**Cause:** The requested tool is not enabled in the current tier.

**Solution:**
1. Check current tier configuration:
   ```bash
   export RESEND_MCP_DEFAULT_TIER=tertiary
   ```
2. Or set to `all` for all tools:
   ```bash
   export RESEND_MCP_DEFAULT_TIER=all
   ```

### Invalid Input Error

**Symptom:**
```json
{
  "error": true,
  "message": "Invalid input: to: Invalid email"
}
```

**Cause:** Input validation failed.

**Solution:**
- Check the tool's input schema requirements
- Ensure email addresses are valid
- Verify required fields are provided

### Domain Not Verified

**Symptom:**
```json
{
  "error": true,
  "message": "The domain example.com is not verified"
}
```

**Cause:** Attempting to send from an unverified domain.

**Solution:**
1. Verify your domain in Resend Dashboard
2. Add required DNS records
3. Wait for verification to complete
4. Use `verify_domain` tool to check status

## Documentation Search Issues

### Embeddings Not Found

**Symptom:**
```json
{
  "error": true,
  "message": "Failed to load embeddings",
  "hint": "Run 'npm run build:embeddings' to generate the embeddings index"
}
```

**Cause:** The `data/embeddings.json` file is missing.

**Solution:**
```bash
npm run build:embeddings
```

This generates the vector embeddings from documentation.

### Low Relevance Results

**Symptom:** Search returns results that do not match the query.

**Cause:** The query is too vague or the semantic model cannot find matches.

**Solution:**
1. Use more specific terms
2. Include API names or function names
3. The search will automatically fall back to keyword matching
4. Try rephrasing the question

### Search Timeout

**Symptom:** Search takes a long time or times out.

**Cause:** First search loads the embedding model, which takes time.

**Solution:**
- First search may take 5-10 seconds to load the model
- Subsequent searches are fast (< 100ms)
- This is normal behavior

## Claude Desktop Integration

### Server Not Appearing in Claude

**Symptom:** The resend server does not appear in Claude Desktop.

**Cause:** Configuration file error or wrong location.

**Solution:**
1. Verify configuration file location:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. Validate JSON syntax:
   ```json
   {
     "mcpServers": {
       "resend": {
         "command": "npx",
         "args": ["resend-mcp-server"],
         "env": {
           "RESEND_API_KEY": "re_your_api_key_here"
         }
       }
     }
   }
   ```

3. Restart Claude Desktop after configuration changes

### Server Disconnects Frequently

**Symptom:** The server appears but disconnects after a few operations.

**Cause:** Unhandled exception or stdout pollution.

**Solution:**
1. Check server logs for errors
2. Ensure no code uses `console.log` (must use `console.error`)
3. Enable debug mode to see detailed logs

### Tools Not Listed

**Symptom:** Server connects but tools are not visible.

**Cause:** Tool tier set too low or scopes restricted.

**Solution:**
```json
{
  "env": {
    "RESEND_API_KEY": "re_...",
    "RESEND_MCP_DEFAULT_TIER": "all"
  }
}
```

### Connection Timeout on First Run

**Symptom:** Claude Desktop fails to connect to the server on first use, but works after retrying.

**Cause:** TypeScript compilation or dependency initialization takes too long on first run, causing Claude Desktop to timeout before the server is ready.

**Solution:**

Run the build manually before connecting:

```bash
cd /path/to/resend-mcp-server
npm run build
```

Then restart Claude Desktop. The pre-compiled server will start much faster.

If using `npx`, the first invocation downloads and compiles the package. Run it once manually in a terminal first:

```bash
RESEND_API_KEY=re_... npx resend-mcp-server
```

Wait for it to start successfully, then close it and restart Claude Desktop.

## Debug Mode

Enable debug mode for detailed logging:

```bash
export RESEND_DEBUG=true
```

Or in Claude Desktop config:
```json
{
  "env": {
    "RESEND_DEBUG": "true"
  }
}
```

Debug output includes:
- Configuration values (API key masked)
- Tool registration events
- Request/response details
- Search performance metrics

### Viewing Debug Logs

**Claude Desktop:**
- Check the application's developer console or logs directory

**Running manually:**
```bash
RESEND_API_KEY=re_... RESEND_DEBUG=true npm run dev 2>&1 | head -50
```

Logs are written to stderr, so redirect accordingly.

## Getting Help

If you cannot resolve an issue:

1. Enable debug mode and collect logs
2. Check [GitHub Issues](https://github.com/gui-wf/resend-mcp-server/issues)
3. Open a new issue with:
   - Error message
   - Steps to reproduce
   - Environment details (OS, Node version)
   - Debug logs (with sensitive data removed)
