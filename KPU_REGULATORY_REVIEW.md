# KPU regulatory alignment — preliminary engineering review

Reviewed 16 November 2026. This is a source-to-code gap assessment, NOT a finding
that every workflow complies. Applicable Sulawesi Utara appointment/delegation
instruments and internal SOPs have not been obtained. No real office data should
be used until the unresolved controls below are implemented and validated.

## Official sources examined

| Source | Relevant scope | Official text |
|---|---|---|
| PKPU 2/2021, amended by PKPU 8/2021 | Tata naskah dinas, templates and signing-authority matrix | https://jdih.kpu.go.id/peraturan-kpu/download/389 and https://jdih.kpu.go.id/peraturan-kpu/download/395 |
| Keputusan KPU 1257/2024 | Archive classification and official document coding | https://jdih.kpu.go.id/keputusan-kpu/download/1349 |
| PKPU 7/2021 | Dynamic archive security/access | https://jdih.kpu.go.id/data/data_pkpu/PKPU%207%20THN%202021.pdf |
| PKPU 17/2023 | Active/inactive retention and final disposition | https://jdih.kpu.go.id/data/data_pkpu/2023pkpu017.pdf |
| Keputusan KPU 43/2022 | SINDE technical guidance | https://jdih.kpu.go.id/keputusan-kpu/download/948 |
| Keputusan KPU 1027/2025 | Budget execution, accounting and financial reporting | https://jdih.kpu.go.id/data/data_kepkpu/2025kpt1027.pdf |

JDIH detail pages inspected list PKPU 2/2021, PKPU 8/2021, Keputusan 1257/2024,
and Keputusan 43/2022 as berlaku. Keputusan 1257/2024 supersedes 57/2022 and
666/2023. PKPU 17/2023 supersedes the older 17/2016 and 13/2019 retention rules.
Search results do not guarantee exhaustive discovery of later amendments.

## Source-to-code mapping

| Workflow | Reference/location | Finding in this implementation | Required next implementation/verification |
|---|---|---|---|
| Draft/review | PKPU 8/2021 appendix; SINDE Chapter III A.2 | Persistent revision history exists, but reviewer/signatory hierarchy is not modeled | Separate drafter, reviewer, numbering officer and signatory; bind assignments to office evidence |
| Signing authority | PKPU 8/2021 appendix Chapter V.C, provincial matrix, PDF pp. 138–139 (printed 121–122) | Admin privilege was used for internal approval; it does not establish legal signing authority | Model document-type and office-level authority, delegation and validity dates. Internal approval is now labeled internal review |
| Official numbering | Keputusan 1257/2024 appendices | Seeded classification catalog and hardcoded format are incomplete; province code 71 is present in the official table | Import and verify applicable full catalog; implement per-document formatting; reconcile existing registers. Official issuance is disabled by default |
| Electronic signing/distribution | SINDE Chapter II/III | No certified signing integration, signature verification or delivery evidence | Resolve approved signing/SINDE integration with the office. No claim that this app replaces SINDE; applicability of central administrative details to provincial routing requires review |
| Incoming disposition | PKPU 2/2021 appendix disposition forms | Sender, date, subject and assignee exist; distinct arrival date, agenda registration, formal instructions and delegation hierarchy remain incomplete | Implement required disposition metadata and authorized routing; verify local SOP |
| Archive access | PKPU 7/2021 Articles 4–7 | Current internal/terbatas labels and same-department/admin access are NOT the prescribed full access model | Four categories are sangat rahasia, rahasia, terbatas, biasa/terbuka. Build job/authority-based grants; do not infer permission solely from department or IT-admin role |
| Retention/destruction | PKPU 17/2023 Articles 3–8 and appendix | No complete type-specific JRA engine, legal holds or disposition approval records | Permanent-delete API blocked. Implement event-based retention and permanent-preservation exceptions; soft deletion is only reversible UI trash |
| Budget execution/reporting | Keputusan 1027/2025, appendices I–III | Budget tracker exists; full financial-authority/document mapping has not been audited | Treat as internal tracking only until KPA/PPK/PPSPM/bendahara roles, evidence, reconciliation and applicable forms are verified against the full appendices |
| User administration | SINDE Chapter III A.1 | Server-enforced admin create/edit; deactivation, session revocation | Office must identify appointed administrators; test authorization and audit coverage |
| Bug reports | Internal technical support | Authenticated tickets; not a public complaint or statutory reporting channel | Keep scope explicit; office-specific support SOP applies |
| AI | No blanket authorization established by reviewed instruments | Local model configuration does not establish permission to ingest confidential material | Establish approved corpus and access boundaries; keep generated legal/financial output subject to human review |
| Backups | Engineering recovery control, not a substitute for JRA | ZIP/dump support and separate-target restore exist | Run actual recovery drill; arrange protected storage, schedules, retention and operational ownership |

## Changes made during review

- Permanent archive deletion now returns 409; no automatic destruction exists.
- Official issuance now defaults to disabled. An additional documented, expiring
  numbering-authority grant is required if that gate is later enabled. This does
  not by itself implement the full signing matrix; keep issuance disabled until
  the missing controls above are complete.
- Public verification no longer returns letter subject and recipient.
- Internal approval labels no longer suggest official signing.
- Added JWT session-version revocation, bounded login inputs, shorter default
  token lifetime, disabled public API documentation, and Nginx login throttling.

## Information required from KPU Sulut

1. Current internal incoming/outgoing/disposition SOP and approved sample forms.
2. Current appointment/delegation documents identifying signatories, reviewers,
   numbering officers, archivists and finance authorities, with validity periods.
3. Approved archive classification/access assignment and the applicable JRA mapping.
4. Decision on integration with existing SINDE, certified TTE and financial systems.
5. Hosting/domain, HTTPS/network boundary, data owner and operational support owner.

No duties are assigned to real employees based on names, titles in demo seeds, or
an assumption that administrator means authorized signatory. Those decisions need
verified office records. All unresolved rows remain release blockers for official
use, rather than silently being marked compliant.

## Further JDIH search — 16 November 2026

The earlier request for office documents was premature: further public-source
search located additional relevant instruments.

- Keputusan KPU 89/2026, issued 23 February 2026, is listed as berlaku and
  replaces 191/2022 on electronic certificates. Official full text retrieved:
  https://jdih.kpu.go.id/keputusan-kpu/download/1428 . Add this instrument to the
  electronic-signature implementation review; the earlier reference list was
  incomplete without it.
- KPU Sulut Decision 26/2026 amends Decision 6/2026 appointing PPID personnel.
  The JDIH detail page lists it as berlaku. This concerns information/documentation
  duties, not blanket signing, numbering or financial authority:
  https://jdih.kpu.go.id/kepkpuprov/detail/z-xOwwraXSGwpRIWyDvc7HFXUVZ0dVRlaTZNbkhTUnFZNTd5aFE9PQ
- Secretary of KPU Sulut Decision 53/2026 on the PIPK drafting/assessment team
  was found in indexed JDIH listings and a detail search result. The detail page
  could not be fetched, so its full contents and appointment scope remain unverified:
  https://jdih.kpu.go.id/kepsekkpup/detail/zn2M0t03fvf5w_4hhohVfng0QVNGMVc2bDkxNzhzVjB5aW9SYkE9PQ
- A Kotamobagu instrument cites Sulut Decision 6/PL.01.6-Kpt/71/Prov/I/2019
  concerning SOP for drafting legal decisions. This is a secondary lead within
  an official document, not verification of the original text/current status or
  evidence of a general incoming/outgoing correspondence SOP.

Still not located/verified in this search: the current provincial general
correspondence/disposition SOP and complete current provincial financial and
numbering/signing delegations. Failure to locate is not proof of nonpublication.
District/city appointments (including Talaud) must not be applied to the provincial
secretariat. No account permissions were changed from these search results.
