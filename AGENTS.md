# Agent instructions

- Read `IMPLEMENTATION_NOTES.md` before changing the injector or renderer integration.
- When work confirms a non-trivial implementation detail, update `IMPLEMENTATION_NOTES.md` in the same task. Record the evidence, implementation consequence, and verification status. Mark hypotheses as unverified.
- When changing `panel.js`, increment its `version` constant so the injector can replace older runtime instances and startup scripts.
- Keep the notes focused on durable findings. Do not add session-specific CDP target IDs as stable facts.
- Preserve user changes and do not stage files.
