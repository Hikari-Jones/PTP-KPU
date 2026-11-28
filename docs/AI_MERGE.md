# AI update merged into minorfixes

Prepared 18 November 2026.

## Result and source versions

The combined working tree is `/Users/hikaru/Projects/PTP-KPU`.

- Application baseline: the actual sibling `PTP-KPU-minorfixes` checkout, commit `bd1826d` on `ptp_kpu_test_v1`. This contains newer fixes than this repository's cached `origin/minorfixes` reference.
- AI implementation: this repository's original `ai_update` commit `624362d`.
- The sibling checkout was read only and is unchanged. No Git commit or push was made.
- All tracked baseline files were retained. Differences from that baseline are confined to the AI implementation and its authentication, frontend integration, deployment, documentation, and tests.

## Integration fixes

- Retained minorfixes' budget approvals, correspondence workflows, authentication, file handling, backups, and other application changes.
- Added the in-process Qwen/KIRANA model, streamed responses, Markdown display, stop/regenerate controls, and per-user saved conversations.
- Combined API helpers instead of overwriting minorfixes' non-AI functions. HTTP errors remain explicit.
- Retained bounded request/history sizes and concurrent-request limits. AI requests receive the authenticated user.
- Replaced each physical SQL relation with a safe column projection and authorized row selection. Password/session fields are excluded before model access, including wildcard queries. Legacy letters use owner/disposition access, current workflow letters use owner/assignee access, and archives use the existing owner/department/access-label rules. SQL result limits are capped.
- Added the current `workflow_letter` schema to the model guidance; the newer correspondence UI no longer depends only on legacy `surat_keluar` records.
- Handle arbitrary UTF-8/CRLF network splits, malformed events, stream interruption, and cancellation. Closing the generator cancels inference work.
- Removed invented classification content from the unavailable-model response.
- Updated development and production Docker builds to include `kirana-llm`, preserved minorfixes' MySQL client/non-root production setup, replaced Ollama services with persistent model storage, and disabled proxy buffering for streaming.
- Preserved the `reportlab` dependency and async SQLAlchemy requirements while keeping legacy LangChain dependencies separate.
- Updated README and production runbook for the local model.

## Verification

| Check | Result |
|---|---|
| Python syntax | Passed for 82 files |
| Frontend application TypeScript | Passed using locally available TypeScript 5.9.3 and dependency types in a temporary checkout; this is not an exact-lockfile production build |
| SSE tests | 4 passed: split UTF-8/CRLF, truncated output, malformed/callback errors, cancellation |
| Existing CSV tests | 2 passed using a temporary TypeScript compilation |
| Isolated backend logic tests | 28 passed, 2 skipped; unavailable async database/auth infrastructure was stubbed only in the temporary test runner, and inference was mocked |
| SQL row-policy tests | Passed against temporary SQLite fixtures, including current/legacy correspondence and archive visibility |
| SQL parser/rewriter tests | 2 skipped because `sqlglot` is unavailable locally |
| Docker Compose configuration | All three Compose files validated |
| Whitespace/conflict check | `git diff --check` passed; no merge-conflict markers found (existing decorative separator lines are not conflicts) |
| Full backend startup | Blocked by missing `greenlet` in the existing local virtual environment |
| Clean dependency install, production frontend build, lint | Blocked: package registries could not resolve; local caches are incomplete |
| Real model, MySQL queries, browser end-to-end | Not verified |

The ordinary backend test run cannot import the AI stack until `greenlet` is installed. The isolated test result above does not substitute for authentication, async database integration, model inference, or production startup testing. Earlier imported reports describe the baseline, not validation of this merge.

## Complete validation in an environment with dependencies

Use a Python environment supported by the model wheels (the supplied Docker images use Python 3.11). From `backend/`, install `requirements.txt`; this includes `sqlalchemy[asyncio]`, `sqlglot`, and the local model package. Configure a strong `SECRET_KEY` and a test `DATABASE_URL` before starting the API. Run:

```bash
# From backend/
pip install -r requirements.txt
python -m kirana_llm --download
python -m unittest discover -s tests -p 'test_*unit.py' -v

# From frontend/
npm ci
npm run build
npm run lint
npm test
```

The model weights are approximately 2.1 GB. `KIRANA_SKIP_MODEL_DOWNLOAD=1` skips the install-time download; `KIRANA_MODEL_PATH` selects an existing GGUF file. Download the weights explicitly before offline use.

With the backend and frontend running against a test database, verify login, `/api/v1/ai/status`, streaming/stop/regenerate, and a second user's isolated history. Compare chatbot letter and archive results against each user's module visibility; verify budget totals against the existing dashboard. Test the AI-unavailable response and the production reverse proxy. Do not treat this merge as a production-readiness certification until these checks pass.
