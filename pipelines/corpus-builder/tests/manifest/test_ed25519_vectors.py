"""RFC 8032 §7.1 test vectors — what makes the pure-Python signer interoperable.

These are the same vectors `ed25519-dalek` is tested against. RETR-01's Rust verifier accepting a
signature this module produced rests on them, not on the implementation looking correct.
"""

from __future__ import annotations

import hashlib

import pytest

from manifest import ed25519

# (private seed, public key, message, signature) — all lowercase hex, RFC 8032 §7.1.
VECTORS = [
    (
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
        "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
        "",
        "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    ),
    (
        "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
        "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
        "72",
        "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
    ),
    (
        "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7",
        "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
        "af82",
        "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
    ),
    (
        # The SHA-512(abc) vector.
        "833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42",
        "ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf",
        "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a"
        "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
        "dc2a4459e7369633a52b1bf277839a00201009a3efbf3ecb69bea2186c26b589"
        "09351fc9ac90b3ecfdfbc7c66431e0303dca179c138ac17ad9bef1177331a704",
    ),
]


@pytest.mark.parametrize("seed,public,message,signature", VECTORS, ids=["empty", "1-byte", "2-byte", "sha512-abc"])
def test_rfc_8032_vector(seed: str, public: str, message: str, signature: str) -> None:
    seed_bytes = bytes.fromhex(seed)
    message_bytes = bytes.fromhex(message)
    assert ed25519.public_key_of(seed_bytes).hex() == public
    assert ed25519.sign(seed_bytes, message_bytes).hex() == signature
    assert ed25519.verify(bytes.fromhex(public), message_bytes, bytes.fromhex(signature))


def test_generate_returns_the_seed_and_its_public_key() -> None:
    seed = bytes.fromhex(VECTORS[0][0])
    assert ed25519.generate(seed) == (seed, bytes.fromhex(VECTORS[0][1]))


def test_a_flipped_signature_byte_fails() -> None:
    seed, public, message, signature = VECTORS[2]
    raw = bytearray(bytes.fromhex(signature))
    raw[0] ^= 0x01
    assert not ed25519.verify(bytes.fromhex(public), bytes.fromhex(message), bytes(raw))


def test_a_flipped_message_byte_fails() -> None:
    seed, public, message, signature = VECTORS[2]
    raw = bytearray(bytes.fromhex(message))
    raw[0] ^= 0x01
    assert not ed25519.verify(bytes.fromhex(public), bytes(raw), bytes.fromhex(signature))


def test_a_signature_from_another_key_fails() -> None:
    other = bytes.fromhex(VECTORS[0][0])
    signature = ed25519.sign(other, b"payload")
    assert not ed25519.verify(bytes.fromhex(VECTORS[1][1]), b"payload", signature)


@pytest.mark.parametrize(
    "public,message,signature",
    [
        (b"", b"m", b"\x00" * 64),
        (b"\x00" * 32, b"m", b""),
        (b"\x00" * 31, b"m", b"\x00" * 64),
        (b"\x00" * 32, b"m", b"\x00" * 63),
        ("not bytes", b"m", b"\x00" * 64),
        (b"\x00" * 32, b"m", None),
        (b"\xff" * 32, b"m", b"\xff" * 64),
    ],
)
def test_malformed_input_returns_false_and_never_raises(public, message, signature) -> None:
    assert ed25519.verify(public, message, signature) is False


def test_a_scalar_at_or_above_the_group_order_is_rejected() -> None:
    """RFC 8032 §5.1.7: `s` must be reduced. A signature with s >= L is not canonical."""
    seed, public, message, signature = VECTORS[1]
    raw = bytearray(bytes.fromhex(signature))
    raw[32:] = (2**252 + 27742317777372353535851937790883648493).to_bytes(32, "little")
    assert not ed25519.verify(bytes.fromhex(public), bytes.fromhex(message), bytes(raw))


def test_a_long_message_round_trips() -> None:
    """A multi-block message, so the SHA-512 streaming path is exercised at realistic length."""
    seed = hashlib.sha256(b"long-message-seed").digest()
    message = bytes((index * 7 + 3) % 256 for index in range(1023))
    signature = ed25519.sign(seed, message)
    assert ed25519.verify(ed25519.public_key_of(seed), message, signature)
    assert not ed25519.verify(ed25519.public_key_of(seed), message + b"\x00", signature)


def test_a_wrong_length_seed_is_a_value_error() -> None:
    with pytest.raises(ValueError):
        ed25519.sign(b"\x00" * 31, b"m")
