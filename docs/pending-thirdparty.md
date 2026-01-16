# Pending Third-Party Features

Features blocked on external service support. Check periodically if these are now available.

---

## Resend OAuth Authentication

**Status**: Not supported (as of January 2026)
**Impact**: Users must manually provide `RESEND_API_KEY` environment variable

### Current Situation

Resend only supports **API key authentication** (Bearer token). There is no OAuth 2.0 flow or "Connect with Resend" integration similar to Anthropic's Claude OAuth.

### What We Want

OAuth authentication would allow:
- Users to authenticate via browser flow instead of copying API keys
- Automatic token refresh
- Granular permission scopes
- Revocation without regenerating keys

### Current Workaround

```bash
# User must set environment variable manually
export RESEND_API_KEY=re_xxxxxxxxx
```

### How to Check for Updates

1. **Resend Changelog**: https://resend.com/changelog
2. **Resend API Docs**: https://resend.com/docs/api-reference/introduction
3. **Resend GitHub**: https://github.com/resend

### If Resend Adds OAuth

The MCP SDK already supports OAuth via `@modelcontextprotocol/sdk/server/auth`. Implementation would involve:

1. Register as OAuth client with Resend
2. Implement authorization flow in server
3. Store and refresh tokens securely
4. Update environment validation to support both methods

### Research Date

January 2026 - No OAuth support announced. Resend focuses on simplicity with API keys.

### Sources

- [Resend API Introduction](https://resend.com/docs/api-reference/introduction)
- [Resend API Keys](https://resend.com/docs/api-reference/api-keys/create-api-key)
- [Resend Changelog](https://resend.com/changelog)
