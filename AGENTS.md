# Agent instructions

- Read `IMPLEMENTATION_NOTES.md` before changing the injector or renderer integration.
- Update `IMPLEMENTATION_NOTES.md` in the same task when you confirm a non-trivial implementation detail. Record the evidence, consequence, and verification status. Mark hypotheses as unverified.
- Core owns CDP, renderer lifecycle, named UI slots, and module mounting. Feature modules must not target arbitrary Codex selectors or interact with conversations, tools, or the composer.
- Keep the default UI styled by inherited Codex fonts and CSS variables. Keep optional module CSS inside the module's shadow root.
- Feature modules own their data sources. Do not add data connectors to core without an explicit requirement.
- Bump `package.json` version when changing the injected runtime. The injector uses it to replace startup scripts across renderer documents.
- Preserve user changes and do not stage files.
