"""libsodium `crypto_box_seal` — X25519 + XSalsa20-Poly1305 — implemented in pure Python.

WHY THIS EXISTS, AND WHY IT IS NOT A SCHEME DEVIATION. Breakdown plan §8 Q6 is CONFIRMED on the
primitive: blind material is sealed with PyNaCl/libsodium `SealedBox`, i.e. `crypto_box_seal`
(sub-PRD D22). PyNaCl is not importable in the environment `uv sync --frozen && uv run pytest`
builds at the repository root — the root manifest is a virtual project and every workspace member
is `package = false`, so a member's dependency is locked and never installed, and the root manifest
is PRD §44.3 serial-owned by `00-foundation`. The repository has already answered this exact
question once, in `pipelines/corpus-builder/src/manifest/ed25519.py`: implement the specified
primitive, and pin it with the standard vectors. The bytes this module produces ARE
`crypto_box_seal` bytes — `nacl.public.SealedBox(private).decrypt(sealed)` opens them unchanged on
the Founder's machine — so the confirmed decision is preserved and no §8 Q6 writeback is required.
The route is recorded in `docs/adr/0004-blind-gold-sealing.md` (Consequences).

WHAT THIS IS NOT. It is **not** a general cryptographic library and must not be reused as one.

  * It is **not constant time.** Python big integers, `list` indexing and conditional swaps all leak
    timing. That is acceptable for exactly one use — sealing and opening blind evaluation material
    offline, on the operator's own machine, where there is no online attacker to time and the
    private half never leaves the Founder's custody. It would not be acceptable for anything that
    handles a live secret.
  * It provides no key storage, no rotation and no agreement protocol. Custody is the Founder's
    (plan §8 Q6 items 12-14); this module only transforms bytes.

CORRECTNESS IS PINNED BY VECTORS, NOT BY ROUND-TRIPPING. A round trip passes for a wrong but
self-consistent implementation, so `tests/dataset/test_sealedbox_vectors.py` runs the RFC 7748 §5.2
and §6.1 X25519 vectors, the RFC 8439 §2.5.2 Poly1305 vector, the NaCl reference `crypto_box`
vector (which also pins HSalsa20 key derivation, XSalsa20 and the tag-first output layout), and a
`crypto_box_seal` golden produced with a pinned ephemeral key.

FAIL CLOSED. `box_open` and `seal_open` raise `AuthenticationFailed` and return nothing on any tag
mismatch: never a partial plaintext, never a truncated result. The tag comparison is
`hmac.compare_digest`, never `==`.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from typing import Callable

__all__ = [
    "AuthenticationFailed",
    "PRIVATE_BYTES",
    "PUBLIC_BYTES",
    "SEAL_OVERHEAD",
    "box",
    "box_open",
    "generate_keypair",
    "public_from_private",
    "scalarmult",
    "scalarmult_base",
    "seal",
    "seal_open",
]

PUBLIC_BYTES = 32
PRIVATE_BYTES = 32
_NONCE_BYTES = 24
_TAG_BYTES = 16
#: 32 bytes of ephemeral public key plus the 16-byte Poly1305 tag.
SEAL_OVERHEAD = PUBLIC_BYTES + _TAG_BYTES

_MASK32 = 0xFFFFFFFF


class AuthenticationFailed(Exception):
    """The ciphertext did not authenticate. No plaintext is produced, ever."""


# -- X25519 (RFC 7748) -----------------------------------------------------------------------------

_P = 2**255 - 19
_A24 = 121665


def _clamp(private: bytes) -> int:
    scalar = bytearray(private)
    scalar[0] &= 248
    scalar[31] &= 127
    scalar[31] |= 64
    return int.from_bytes(scalar, "little")


def _decode_u(u: bytes) -> int:
    value = bytearray(u)
    value[31] &= 127
    return int.from_bytes(value, "little") % _P


def scalarmult(private: bytes, public: bytes) -> bytes:
    """RFC 7748 §5 X25519. The Montgomery ladder, with the standard scalar clamping."""
    if len(private) != PRIVATE_BYTES or len(public) != PUBLIC_BYTES:
        raise ValueError("X25519 takes a 32-byte scalar and a 32-byte u-coordinate")
    x_1 = _decode_u(public)
    scalar = _clamp(private)
    x_2, z_2, x_3, z_3 = 1, 0, x_1, 1
    swap = 0
    for bit_index in range(254, -1, -1):
        bit = (scalar >> bit_index) & 1
        swap ^= bit
        if swap:
            x_2, x_3 = x_3, x_2
            z_2, z_3 = z_3, z_2
        swap = bit
        a = (x_2 + z_2) % _P
        aa = a * a % _P
        b = (x_2 - z_2) % _P
        bb = b * b % _P
        e = (aa - bb) % _P
        c = (x_3 + z_3) % _P
        d = (x_3 - z_3) % _P
        da = d * a % _P
        cb = c * b % _P
        x_3 = pow(da + cb, 2, _P)
        z_3 = x_1 * pow(da - cb, 2, _P) % _P
        x_2 = aa * bb % _P
        z_2 = e * (aa + _A24 * e) % _P
    if swap:
        x_2, x_3 = x_3, x_2
        z_2, z_3 = z_3, z_2
    return (x_2 * pow(z_2, _P - 2, _P) % _P).to_bytes(32, "little")


_BASE_POINT = (9).to_bytes(32, "little")


def scalarmult_base(private: bytes) -> bytes:
    """The X25519 public value for *private*: `scalarmult(private, 9)`."""
    return scalarmult(private, _BASE_POINT)


public_from_private = scalarmult_base


def generate_keypair(randbytes: Callable[[int], bytes] = os.urandom) -> tuple[bytes, bytes]:
    """Return `(public, private)`.

    *randbytes* exists so a vector test can pin a key pair; production never passes it. It defaults
    to `os.urandom` and must never be given a seeded `random.Random` — a seeded PRNG in a parallel
    test run is a real-world way to reuse an ephemeral key.
    """
    private = randbytes(PRIVATE_BYTES)
    if len(private) != PRIVATE_BYTES:
        raise ValueError("randbytes must return exactly 32 bytes")
    return scalarmult_base(private), private


# -- Salsa20 / HSalsa20 / XSalsa20 ------------------------------------------------------------------

_SIGMA = b"expand 32-byte k"


def _rotl(value: int, count: int) -> int:
    return ((value << count) | (value >> (32 - count))) & _MASK32


def _double_rounds(state: list[int]) -> None:
    """Ten double rounds — twenty rounds — each a column round followed by a row round."""
    x = state
    for _ in range(10):
        # column round
        x[4] ^= _rotl((x[0] + x[12]) & _MASK32, 7)
        x[8] ^= _rotl((x[4] + x[0]) & _MASK32, 9)
        x[12] ^= _rotl((x[8] + x[4]) & _MASK32, 13)
        x[0] ^= _rotl((x[12] + x[8]) & _MASK32, 18)
        x[9] ^= _rotl((x[5] + x[1]) & _MASK32, 7)
        x[13] ^= _rotl((x[9] + x[5]) & _MASK32, 9)
        x[1] ^= _rotl((x[13] + x[9]) & _MASK32, 13)
        x[5] ^= _rotl((x[1] + x[13]) & _MASK32, 18)
        x[14] ^= _rotl((x[10] + x[6]) & _MASK32, 7)
        x[2] ^= _rotl((x[14] + x[10]) & _MASK32, 9)
        x[6] ^= _rotl((x[2] + x[14]) & _MASK32, 13)
        x[10] ^= _rotl((x[6] + x[2]) & _MASK32, 18)
        x[3] ^= _rotl((x[15] + x[11]) & _MASK32, 7)
        x[7] ^= _rotl((x[3] + x[15]) & _MASK32, 9)
        x[11] ^= _rotl((x[7] + x[3]) & _MASK32, 13)
        x[15] ^= _rotl((x[11] + x[7]) & _MASK32, 18)
        # row round
        x[1] ^= _rotl((x[0] + x[3]) & _MASK32, 7)
        x[2] ^= _rotl((x[1] + x[0]) & _MASK32, 9)
        x[3] ^= _rotl((x[2] + x[1]) & _MASK32, 13)
        x[0] ^= _rotl((x[3] + x[2]) & _MASK32, 18)
        x[6] ^= _rotl((x[5] + x[4]) & _MASK32, 7)
        x[7] ^= _rotl((x[6] + x[5]) & _MASK32, 9)
        x[4] ^= _rotl((x[7] + x[6]) & _MASK32, 13)
        x[5] ^= _rotl((x[4] + x[7]) & _MASK32, 18)
        x[11] ^= _rotl((x[10] + x[9]) & _MASK32, 7)
        x[8] ^= _rotl((x[11] + x[10]) & _MASK32, 9)
        x[9] ^= _rotl((x[8] + x[11]) & _MASK32, 13)
        x[10] ^= _rotl((x[9] + x[8]) & _MASK32, 18)
        x[12] ^= _rotl((x[15] + x[14]) & _MASK32, 7)
        x[13] ^= _rotl((x[12] + x[15]) & _MASK32, 9)
        x[14] ^= _rotl((x[13] + x[12]) & _MASK32, 13)
        x[15] ^= _rotl((x[14] + x[13]) & _MASK32, 18)


def _words(data: bytes) -> list[int]:
    return [int.from_bytes(data[index : index + 4], "little") for index in range(0, len(data), 4)]


def _state(secret: bytes, block: bytes) -> list[int]:
    """The Salsa20 input state: sigma at 0/5/10/15, the key at 1-4 and 11-14, `block` at 6-9."""
    constant = _words(_SIGMA)
    secret_words = _words(secret)
    block_words = _words(block)
    return [
        constant[0], secret_words[0], secret_words[1], secret_words[2],
        secret_words[3], constant[1], block_words[0], block_words[1],
        block_words[2], block_words[3], constant[2], secret_words[4],
        secret_words[5], secret_words[6], secret_words[7], constant[3],
    ]


def _hsalsa20(secret: bytes, block: bytes) -> bytes:
    """RFC-less but standard: 20 rounds, NO feed-forward, output words 0,5,10,15,6,7,8,9."""
    state = _state(secret, block)
    _double_rounds(state)
    return b"".join(state[index].to_bytes(4, "little") for index in (0, 5, 10, 15, 6, 7, 8, 9))


def _salsa20_block(secret: bytes, nonce8: bytes, counter: int) -> bytes:
    block = nonce8 + counter.to_bytes(8, "little")
    initial = _state(secret, block)
    state = list(initial)
    _double_rounds(state)
    return b"".join(
        ((state[index] + initial[index]) & _MASK32).to_bytes(4, "little") for index in range(16)
    )


def _xsalsa20_stream(secret: bytes, nonce: bytes, length: int) -> bytes:
    """XSalsa20: derive a subkey with HSalsa20 over the first 16 nonce bytes, then Salsa20."""
    if len(nonce) != _NONCE_BYTES:
        raise ValueError("XSalsa20 takes a 24-byte nonce")
    subkey = _hsalsa20(secret, nonce[:16])
    out = bytearray()
    counter = 0
    while len(out) < length:
        out += _salsa20_block(subkey, nonce[16:], counter)
        counter += 1
    return bytes(out[:length])


# -- Poly1305 (RFC 8439 §2.5) -----------------------------------------------------------------------

_POLY_P = (1 << 130) - 5
_R_CLAMP = 0x0FFFFFFC0FFFFFFC0FFFFFFC0FFFFFFF


def _poly1305(message: bytes, one_time: bytes) -> bytes:
    if len(one_time) != 32:
        raise ValueError("Poly1305 takes a 32-byte one-time key")
    r = int.from_bytes(one_time[:16], "little") & _R_CLAMP
    s = int.from_bytes(one_time[16:], "little")
    accumulator = 0
    for offset in range(0, len(message), 16):
        chunk = message[offset : offset + 16]
        accumulator = (accumulator + int.from_bytes(chunk + b"\x01", "little")) * r % _POLY_P
    return ((accumulator + s) % (1 << 128)).to_bytes(16, "little")


def _xor(left: bytes, right: bytes) -> bytes:
    return bytes(a ^ b for a, b in zip(left, right, strict=True))


# -- secretbox / box ---------------------------------------------------------------------------------


def _secretbox(message: bytes, nonce: bytes, secret: bytes) -> bytes:
    """NaCl `crypto_secretbox_easy`: `tag(16) || ciphertext`.

    The first 32 keystream bytes are reserved as the Poly1305 one-time key — which is what NaCl's
    32-byte zero prefix accomplishes — and the message is encrypted from keystream byte 32 on.
    """
    stream = _xsalsa20_stream(secret, nonce, 32 + len(message))
    ciphertext = _xor(message, stream[32:])
    return _poly1305(ciphertext, stream[:32]) + ciphertext


def _secretbox_open(sealed: bytes, nonce: bytes, secret: bytes) -> bytes:
    if len(sealed) < _TAG_BYTES:
        raise AuthenticationFailed("ciphertext is shorter than the authentication tag")
    tag, ciphertext = sealed[:_TAG_BYTES], sealed[_TAG_BYTES:]
    stream = _xsalsa20_stream(secret, nonce, 32 + len(ciphertext))
    if not hmac.compare_digest(_poly1305(ciphertext, stream[:32]), tag):
        raise AuthenticationFailed("the ciphertext did not authenticate under this key and nonce")
    return _xor(ciphertext, stream[32:])


_ZERO16 = b"\x00" * 16


def _shared(private: bytes, public: bytes) -> bytes:
    point = scalarmult(private, public)
    if point == b"\x00" * 32:
        # A small-order public key drives the shared secret to zero, which would make every
        # ciphertext openable by anyone. libsodium rejects it and so does this.
        raise ValueError("the X25519 shared secret is all zero; the public value has small order")
    return _hsalsa20(point, _ZERO16)


def box(message: bytes, nonce: bytes, recipient_public: bytes, sender_private: bytes) -> bytes:
    """NaCl `crypto_box_easy`: `tag(16) || ciphertext`."""
    return _secretbox(message, nonce, _shared(sender_private, recipient_public))


def box_open(sealed: bytes, nonce: bytes, sender_public: bytes, recipient_private: bytes) -> bytes:
    """NaCl `crypto_box_open_easy`. Raises `AuthenticationFailed`; never returns partial plaintext."""
    return _secretbox_open(sealed, nonce, _shared(recipient_private, sender_public))


# -- crypto_box_seal ---------------------------------------------------------------------------------


def _seal_nonce(ephemeral_public: bytes, recipient_public: bytes) -> bytes:
    return hashlib.blake2b(ephemeral_public + recipient_public, digest_size=_NONCE_BYTES).digest()


def seal(
    message: bytes,
    recipient_public: bytes,
    *,
    randbytes: Callable[[int], bytes] = os.urandom,
) -> bytes:
    """libsodium `crypto_box_seal`: `ephemeral_public(32) || crypto_box(message)`.

    Sealing needs ONLY the recipient's public half — which is the whole point of plan §8 Q6 item
    11: an authorised `evaluation-author` agent can encrypt without ever holding the private key,
    and no Builder ever needs it.

    *randbytes* is injectable so a vector test can pin the ephemeral key, exactly as
    `createIdFactory`'s clock and `manifest.ed25519.generate`'s seed are. Production never passes
    it: a fresh ephemeral pair per call is what makes two seals of the same plaintext differ.
    """
    if len(recipient_public) != PUBLIC_BYTES:
        raise ValueError("a recipient public value is 32 bytes")
    ephemeral_public, ephemeral_private = generate_keypair(randbytes)
    nonce = _seal_nonce(ephemeral_public, recipient_public)
    return ephemeral_public + box(message, nonce, recipient_public, ephemeral_private)


def seal_open(sealed: bytes, recipient_public: bytes, recipient_private: bytes) -> bytes:
    """libsodium `crypto_box_seal_open`. Fails closed on any tampering."""
    if len(sealed) < SEAL_OVERHEAD:
        raise AuthenticationFailed("sealed material is shorter than the sealed-box overhead")
    ephemeral_public, body = sealed[:PUBLIC_BYTES], sealed[PUBLIC_BYTES:]
    nonce = _seal_nonce(ephemeral_public, recipient_public)
    return box_open(body, nonce, ephemeral_public, recipient_private)
