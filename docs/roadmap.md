# Silkyway SDK Roadmap

## Completed

### Phase 1-2: OpenClaw Skill Integration (v0.1.0)
- ✅ Extract SDK to dedicated repository (github.com/silkysquad/silk)
- ✅ Publish to ClawHub as "silkyway" skill
- ✅ Publish to npm registry as `@silkyway/silk`
- ✅ OpenClaw-compliant SKILL.md with proper metadata
- ✅ Documentation updates across monorepo

---

## Future Enhancements

### Phase 3: Documentation & Developer Experience

**Priority:** Medium
**Timeline:** 1-2 months

- [ ] **Enhanced Installation Documentation**
  - Comprehensive troubleshooting section
  - Platform-specific install guides (macOS, Linux, Windows)
  - Common error patterns and solutions

- [ ] **Security & Trust Section**
  - Detailed non-custodial architecture explanation
  - Key storage best practices
  - Backup and recovery procedures
  - On-chain policy enforcement documentation

- [ ] **FAQ Section**
  - Why Node.js is required
  - Production readiness guidance
  - What happens if backend goes down
  - Cost breakdown (fees, Solana tx costs)
  - Hardware wallet support (or lack thereof)
  - Cluster migration guide

- [ ] **Versioning Documentation**
  - Semver policy and breaking change process
  - Deprecation timeline (30-day notice)
  - Upgrade guides for major versions
  - ClawHub version pinning examples

- [ ] **Contribution Guide**
  - Skill documentation update process
  - Testing guidelines for skill changes
  - Publishing workflow for maintainers

### Phase 4: Standalone Binary Distribution

**Priority:** Low (depends on user feedback)
**Timeline:** 3-6 months

**Problem:** Node.js dependency creates friction for some users

**Solutions to evaluate:**

1. **Binary Packaging Tools**
   - `pkg` (https://github.com/vercel/pkg) - Note: may be unmaintained
   - `nexe` (https://github.com/nexe/nexe) - More actively maintained
   - `caxa` (https://github.com/leafac/caxa) - Simpler alternative
   - Native rewrite in Rust/Go (highest effort, best UX)

2. **CI/CD for Multi-Platform Builds**
   - GitHub Actions workflow for release automation
   - Build matrix: macOS (ARM64/x64), Linux (x64), Windows (x64)
   - Code signing for macOS/Windows binaries
   - Automated GitHub releases with checksums

3. **ClawHub Multi-Installer Support**
   ```json
   "install": [
     {"id":"silk-npm","kind":"node","label":"Silk CLI (npm)","package":"@silkyway/silk"},
     {"id":"silk-binary-macos-arm64","kind":"download","label":"Silk Binary (macOS ARM64)","os":["darwin"],"url":"https://github.com/silkysquad/silk/releases/download/v0.3.0/silk-macos-arm64.tar.gz","archive":"tar.gz"},
     {"id":"silk-binary-linux-x64","kind":"download","label":"Silk Binary (Linux x64)","os":["linux"],"url":"https://github.com/silkysquad/silk/releases/download/v0.3.0/silk-linux-x64.tar.gz","archive":"tar.gz"}
   ]
   ```
   ClawHub intelligently picks best installer based on OS

4. **Homebrew Formula** (macOS/Linux)
   - Create tap: `silkysquad/homebrew-tap`
   - Formula for `silk` binary
   - ClawHub integration: `"kind":"brew"`

**Trade-offs:**
- ✅ Pros: No Node.js dependency, faster install, more professional
- ❌ Cons: Complex build setup, platform-specific bugs, higher maintenance
- **Decision:** Defer until user demand justifies effort

### Phase 5: Sandboxed Execution Support

**Priority:** Low
**Timeline:** TBD (depends on ecosystem requirements)

**Current State:** Host-only recommended for wallet persistence

**Future Work:**
- [ ] Docker setup guide with volume mounting
- [ ] Container-optimized build (smaller image)
- [ ] OpenClaw sandbox env configuration examples
- [ ] Document sandbox trade-offs clearly

**Challenges:**
- Wallet persistence requires volume mounts (`~/.config/silk`)
- Binary must exist inside container
- Network access needed for Solana + API

**Recommendation:** Only pursue if OpenClaw enforces sandboxing or users request it

### Phase 6: Environment Variable Configuration

**Priority:** Low
**Timeline:** 3-6 months

**Goal:** Support self-hosted backends and custom configurations

**Environment Variables:**
- `SILK_API_URL` - Override API base URL (default: https://api.silkyway.ai)
- `SILK_CLUSTER` - Override default cluster (mainnet-beta/devnet)
- `SILK_CONFIG_PATH` - Override config file location (default: ~/.config/silk/config.json)

**ClawHub Metadata:**
```json
"openclaw": {
  "requires": {
    "bins": ["silk"],
    "env": []  // No required env vars
  },
  "providedEnv": ["SILK_API_URL", "SILK_CLUSTER", "SILK_CONFIG_PATH"]
}
```

**Use Cases:**
- Self-hosted Silkyway backend deployments
- Custom Solana RPC endpoints
- Enterprise configurations with isolated config storage

### Phase 7: Automated Testing & Quality

**Priority:** Medium
**Timeline:** 2-3 months

- [ ] **Integration Tests**
  - End-to-end install test (ClawHub + npm)
  - CLI command smoke tests
  - Wallet creation and config verification

- [ ] **CI/CD Pipeline**
  - Automated tests on PR
  - Publish to npm on tag push
  - ClawHub publish automation (if API available)

- [ ] **Skill Sync Automation**
  - Script to sync SKILL.md between repos
  - Validation of OpenClaw frontmatter format
  - Detect version mismatches

### Phase 8: Advanced Features

**Priority:** Low
**Timeline:** 6+ months

- [ ] **Hardware Wallet Support**
  - Ledger integration for human-controlled accounts
  - Separation: agents use local keys, humans use hardware

- [ ] **Multi-Signature Accounts**
  - Require multiple operators to approve transfers
  - Threshold signing (M-of-N)

- [ ] **Scheduled Payments**
  - Recurring transfers
  - Time-locked releases

- [ ] **Gas Optimization**
  - Batch transactions
  - Compute unit optimization

- [ ] **Web UI for Account Management**
  - Create accounts via browser
  - Manage operator permissions
  - View transfer history

---

## Decision Log

### Why npm registry over binaries first?

**Date:** 2026-02-12
**Decision:** Publish to npm registry (`@silkyway/silk`) before building standalone binaries

**Rationale:**
- Speed to market: npm publish takes <1 hour vs days of binary tooling setup
- Ecosystem alignment: OpenClaw agents expect Node.js-based tools
- Trust: npm registry has better reputation than self-hosted tarballs
- Maintenance: Zero infrastructure vs managing builds + GitHub releases
- Compatibility: ClawHub `kind: "node"` installer already supports npm packages

**Trade-off accepted:** Users need Node.js 18+. This is documented clearly in prerequisites.

**Future path:** Can add binaries in Phase 4 as alternative installation method.

### Why dedicated repository?

**Date:** 2026-02-12
**Decision:** Extract SDK to dedicated `silk` repository instead of keeping in monorepo

**Rationale:**
- Clean separation: SDK is a standalone product, not just a package
- Easier publishing: No monorepo complexity for npm/ClawHub
- Better discoverability: Agents find dedicated repo more easily
- Skill files at root: SKILL.md naturally belongs at repo root
- Issue tracking: Separate issue tracker for SDK vs backend/programs

**Trade-off accepted:** Backend must depend on published `@silkyway/silk` package instead of local code.

### Why skip self-hosted tarball phase?

**Date:** 2026-02-12
**Decision:** Go straight to npm registry, skip temporary self-hosted tarball

**Rationale:**
- No existing users to migrate (only developer using it)
- Self-hosted tarball is brittle and suspicious-looking
- npm registry provides provenance, checksums, versioning automatically
- Simpler workflow: One distribution method, not two
- Aligns with ecosystem best practices immediately

**Trade-off accepted:** Slightly longer initial setup (need npm account), but worth it for proper foundation.

---

## Metrics & Success Criteria

### Phase 3 Success
- Installation documentation reduces support requests by 80%
- FAQ covers most common questions (measured by GitHub issues)
- Clear versioning policy prevents confusion

### Phase 4 Success (if pursued)
- Binary installation reduces install time to <10 seconds
- No increase in platform-specific bugs
- Users report improved UX in feedback

### Overall SDK Health
- npm download metrics trending up
- GitHub issues resolved within 7 days
- ClawHub skill maintains "latest" tag
- Positive user feedback in OpenClaw community

---

## References

- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills)
- [ClawHub Registry](https://docs.openclaw.ai/tools/clawhub)
- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)

---

## Last Updated

2026-02-12 - Initial roadmap created after Phase 1-2 completion
