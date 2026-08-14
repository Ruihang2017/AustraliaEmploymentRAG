# `test/providers/cassettes` — recorded provider responses (EVID-07 deliverable 14)

Every cassette here is **synthetic** (sub-PRD **D22**). None was recorded from a real provider, none
contains a real legal source, a real customer fact or a credential, and the vendor named in each is
nobody: the only provider id is `STUB_DETERMINISTIC`.

**What a cassette is keyed by, and why it is not keyed by the request body.** The key is
`{ providerId, profileId, instructionTemplateVersion, packId, packHash, scenarioKey }` — identifiers
and versions only. Fingerprinting the assembled payload would put evidence text and sanitized
customer facts into a committed artefact, which is exactly the thing PRD §37.3 says never leaves the
system. `scenarioKey` is what lets one profile have both a valid cassette and a 500 cassette without
the two differing by a byte of evidence.

**A miss is loud.** `createCassetteTransport` throws `CassetteMissError` on an unknown fingerprint and
has no `inner`, no `fallback` and no `onMiss` parameter — there is nothing to fall through to. A
cassette transport that quietly reached a network on a miss would make the whole offline claim
worthless, and the shape of the API is what prevents it rather than a comment asking nicely.

**Coverage.** One valid §36.5 response per hosted profile, plus one cassette per row of the failure
matrix (deliverable 10). `costMicroAud` is stored as a decimal string, or `null`, because JSON has no
bigint and PRD §34.1 forbids routing money through a double.
