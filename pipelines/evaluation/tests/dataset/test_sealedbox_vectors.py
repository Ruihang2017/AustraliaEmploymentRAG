"""The sealing primitive really is `crypto_box_seal`, pinned by published vectors.

Ticket test-plan step 13 (Reviewer focus): "the sealing primitive is PyNaCl/libsodium `SealedBox`
(`crypto_box_seal`) as plan §8 Q6 confirms". A round-trip test cannot establish that — it passes
for any self-consistent construction — so correctness is pinned by RFC 7748, RFC 8439 and the NaCl
reference `crypto_box` vector, transcribed in `data/sealedbox-vectors.json` with their provenance.
"""

from __future__ import annotations

import json

import dataset_fixtures
import pytest
from dataset import sealedbox

_VECTORS = json.loads(
    (dataset_fixtures.DATA_DIR / "sealedbox-vectors.json").read_text(encoding="utf-8")
)


def unhex(text: str) -> bytes:
    return bytes.fromhex(text)


@pytest.mark.parametrize("vector", _VECTORS["x25519"])
def test_rfc7748_scalar_multiplication(vector: dict[str, str]) -> None:
    assert sealedbox.scalarmult(unhex(vector["scalar"]), unhex(vector["u"])).hex() == vector["output"]


def test_rfc7748_key_exchange() -> None:
    exchange = _VECTORS["x25519Exchange"]
    alice_private = unhex(exchange["alicePrivate"])
    bob_private = unhex(exchange["bobPrivate"])
    assert sealedbox.scalarmult_base(alice_private).hex() == exchange["alicePublic"]
    assert sealedbox.scalarmult_base(bob_private).hex() == exchange["bobPublic"]
    assert sealedbox.scalarmult(alice_private, unhex(exchange["bobPublic"])).hex() == exchange["shared"]
    assert sealedbox.scalarmult(bob_private, unhex(exchange["alicePublic"])).hex() == exchange["shared"]


def test_rfc8439_poly1305() -> None:
    vector = _VECTORS["poly1305"]
    tag = sealedbox._poly1305(vector["messageUtf8"].encode("utf-8"), unhex(vector["oneTime"]))
    assert tag.hex() == vector["tag"]


def test_nacl_crypto_box_shared_key_derivation() -> None:
    """HSalsa20 over the X25519 point — the step that makes this XSalsa20-Poly1305 and not something else."""
    vector = _VECTORS["cryptoBox"]
    derived = sealedbox._shared(unhex(vector["senderPrivate"]), unhex(vector["recipientPublic"]))
    assert derived.hex() == vector["derivedShared"]


def test_nacl_crypto_box_reference_vector() -> None:
    vector = _VECTORS["cryptoBox"]
    produced = sealedbox.box(
        unhex(vector["message"]),
        unhex(vector["nonce"]),
        unhex(vector["recipientPublic"]),
        unhex(vector["senderPrivate"]),
    )
    assert produced.hex() == vector["expected"]


def test_nacl_crypto_box_opens_the_reference_vector() -> None:
    vector = _VECTORS["cryptoBox"]
    exchange = _VECTORS["x25519Exchange"]
    opened = sealedbox.box_open(
        unhex(vector["expected"]),
        unhex(vector["nonce"]),
        unhex(exchange["alicePublic"]),
        unhex(exchange["bobPrivate"]),
    )
    assert opened.hex() == vector["message"]


def test_seal_is_ephemeral_public_plus_a_box_under_the_blake2b_nonce() -> None:
    """The `crypto_box_seal` construction, asserted member by member rather than by round trip."""
    recipient_public, recipient_private = sealedbox.generate_keypair()
    pinned = bytes(range(32))
    sealed = sealedbox.seal(b"blind material", recipient_public, randbytes=lambda n: pinned[:n])
    ephemeral_public = sealedbox.scalarmult_base(pinned)
    assert sealed[:32] == ephemeral_public
    expected_nonce = sealedbox._seal_nonce(ephemeral_public, recipient_public)
    assert sealed[32:] == sealedbox.box(
        b"blind material", expected_nonce, recipient_public, pinned
    )
    assert sealedbox.seal_open(sealed, recipient_public, recipient_private) == b"blind material"


def test_two_seals_of_the_same_plaintext_differ() -> None:
    """Acceptance item: "the ciphertext differs on every seal"."""
    recipient_public, _ = sealedbox.generate_keypair()
    first = sealedbox.seal(b"identical plaintext", recipient_public)
    second = sealedbox.seal(b"identical plaintext", recipient_public)
    assert first != second
    assert first[:32] != second[:32]


def test_round_trip_over_random_lengths() -> None:
    recipient_public, recipient_private = sealedbox.generate_keypair()
    import os

    for length in (0, 1, 15, 16, 17, 31, 32, 33, 64, 1000):
        message = os.urandom(length)
        sealed = sealedbox.seal(message, recipient_public)
        assert sealedbox.seal_open(sealed, recipient_public, recipient_private) == message
        assert len(sealed) == length + sealedbox.SEAL_OVERHEAD


def test_a_flipped_ciphertext_bit_fails_closed() -> None:
    recipient_public, recipient_private = sealedbox.generate_keypair()
    sealed = bytearray(sealedbox.seal(b"blind material", recipient_public))
    sealed[-1] ^= 0x01
    with pytest.raises(sealedbox.AuthenticationFailed):
        sealedbox.seal_open(bytes(sealed), recipient_public, recipient_private)


def test_a_flipped_tag_bit_fails_closed() -> None:
    recipient_public, recipient_private = sealedbox.generate_keypair()
    sealed = bytearray(sealedbox.seal(b"blind material", recipient_public))
    sealed[32] ^= 0x80
    with pytest.raises(sealedbox.AuthenticationFailed):
        sealedbox.seal_open(bytes(sealed), recipient_public, recipient_private)


def test_the_wrong_private_key_fails_closed_rather_than_returning_garbage() -> None:
    recipient_public, _ = sealedbox.generate_keypair()
    _, other_private = sealedbox.generate_keypair()
    sealed = sealedbox.seal(b"blind material", recipient_public)
    with pytest.raises(sealedbox.AuthenticationFailed):
        sealedbox.seal_open(sealed, recipient_public, other_private)


def test_truncated_material_fails_closed() -> None:
    recipient_public, recipient_private = sealedbox.generate_keypair()
    sealed = sealedbox.seal(b"blind material", recipient_public)
    with pytest.raises(sealedbox.AuthenticationFailed):
        sealedbox.seal_open(sealed[:40], recipient_public, recipient_private)


def test_a_small_order_public_value_is_rejected() -> None:
    """An all-zero shared secret would make every ciphertext openable by anyone."""
    _, private = sealedbox.generate_keypair()
    with pytest.raises(ValueError):
        sealedbox.seal(b"blind material", b"\x00" * 32)
    with pytest.raises(ValueError):
        sealedbox._shared(private, b"\x00" * 32)


def test_generate_keypair_rejects_a_short_random_source() -> None:
    with pytest.raises(ValueError):
        sealedbox.generate_keypair(lambda n: b"\x00" * (n - 1))


def test_agrees_with_pynacl_when_it_is_installed() -> None:
    """If libsodium ever becomes importable, the bytes must be interchangeable — not merely similar."""
    public = pytest.importorskip("nacl.public")
    recipient_public, recipient_private = sealedbox.generate_keypair()
    their_private = public.PrivateKey(recipient_private)
    assert bytes(their_private.public_key) == recipient_public
    ours = sealedbox.seal(b"blind material", recipient_public)
    assert public.SealedBox(their_private).decrypt(ours) == b"blind material"
    theirs = public.SealedBox(their_private.public_key).encrypt(b"blind material")
    assert sealedbox.seal_open(bytes(theirs), recipient_public, recipient_private) == b"blind material"
