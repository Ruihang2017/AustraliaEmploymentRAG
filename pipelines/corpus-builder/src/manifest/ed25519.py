"""RFC 8032 Ed25519, in pure Python, for OFFLINE release signing only.

WHY THIS EXISTS. PRD §18.4 puts build/sign/upload offline and verification in production, and
CRPS-02 deliverable 8 makes Ed25519 the default scheme. No cryptography library is importable in the
environment `uv sync --frozen && uv run pytest` builds: a uv workspace member that is
`package = false` contributes no dependency to it (CRPS-01 recorded this as E1 and shipped
`contracts.jsonschema_min` for the same reason), and adding one would force a regeneration of the
root `uv.lock`, a PRD §44.3 serial-owned artifact outside this ticket's file-scope, which CI polices
with `uv lock --check`. Implementing the RFC is therefore not a scheme deviation — the scheme is
still Ed25519, byte-for-byte interoperable with `ed25519-dalek`, which RETR-01 will verify with.

WHAT THIS IS NOT.

* NOT constant-time. The scalar multiplication branches on secret bits and Python's big integers
  are not constant-time by construction. That is acceptable for exactly one use: signing a release
  manifest offline, on the release operator's own machine, with a key that never serves an online
  request. It MUST NOT be used for an online secret, a session key, or anything an attacker can
  time.
* NOT a general-purpose library. It exposes three functions and no key-agreement, no batch
  verification and no Ed25519ph/ctx variants.

WHAT PINS ITS CORRECTNESS. `tests/manifest/test_ed25519_vectors.py` runs the RFC 8032 §7.1 test
vectors — the same vectors `ed25519-dalek` is tested against. Interoperability with the Rust
verifier rests on those vectors, not on this docstring.

The code below follows the reference implementation in RFC 8032 §6, using extended homogeneous
coordinates so no modular inversion is needed per point operation.
"""

from __future__ import annotations

import hashlib

__all__ = ["generate", "public_key_of", "sign", "verify"]

#: The field prime, 2**255 - 19.
_P = 2**255 - 19
#: The group order.
_Q = 2**252 + 27742317777372353535851937790883648493


def _sha512(data: bytes) -> bytes:
    return hashlib.sha512(data).digest()


def _inv(x: int) -> int:
    return pow(x, _P - 2, _P)


_D = -121665 * _inv(121666) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)


def _recover_x(y: int, sign: int) -> int | None:
    if y >= _P:
        return None
    x2 = (y * y - 1) * _inv(_D * y * y + 1) % _P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _SQRT_M1 % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return x


_G_Y = 4 * _inv(5) % _P
_G_X = _recover_x(_G_Y, 0)
assert _G_X is not None  # the base point is a constant of the curve, not an input
#: The base point, in extended homogeneous coordinates (X, Y, Z, T) with x = X/Z, y = Y/Z, xy = T/Z.
_G = (_G_X, _G_Y, 1, _G_X * _G_Y % _P)
_IDENTITY = (0, 1, 1, 0)

_Point = tuple[int, int, int, int]


def _point_add(p: _Point, q: _Point) -> _Point:
    a = (p[1] - p[0]) * (q[1] - q[0]) % _P
    b = (p[1] + p[0]) * (q[1] + q[0]) % _P
    c = 2 * p[3] * q[3] * _D % _P
    d = 2 * p[2] * q[2] % _P
    e, f, g, h = b - a, d - c, d + c, b + a
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


def _point_mul(scalar: int, point: _Point) -> _Point:
    result = _IDENTITY
    while scalar > 0:
        if scalar & 1:
            result = _point_add(result, point)
        point = _point_add(point, point)
        scalar >>= 1
    return result


def _point_equal(p: _Point, q: _Point) -> bool:
    if (p[0] * q[2] - q[0] * p[2]) % _P != 0:
        return False
    return (p[1] * q[2] - q[1] * p[2]) % _P == 0


def _compress(point: _Point) -> bytes:
    z_inv = _inv(point[2])
    x = point[0] * z_inv % _P
    y = point[1] * z_inv % _P
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _decompress(data: bytes) -> _Point | None:
    if len(data) != 32:
        return None
    value = int.from_bytes(data, "little")
    sign = value >> 255
    y = value & ((1 << 255) - 1)
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, x * y % _P)


def _expand(seed: bytes) -> tuple[int, bytes]:
    if len(seed) != 32:
        raise ValueError("an Ed25519 private key seed is exactly 32 bytes")
    digest = _sha512(seed)
    scalar = int.from_bytes(digest[:32], "little")
    scalar &= (1 << 254) - 8
    scalar |= 1 << 254
    return scalar, digest[32:]


def public_key_of(seed: bytes) -> bytes:
    """The 32-byte public key for a 32-byte private seed (RFC 8032 §5.1.5)."""
    scalar, _ = _expand(seed)
    return _compress(_point_mul(scalar, _G))


def generate(seed: bytes) -> tuple[bytes, bytes]:
    """Return `(seed, public_key)` for a caller-supplied 32-byte seed.

    The seed is an INPUT, never generated here: a signing key's provenance is the operator's
    decision (PRD §20.2, sub-PRD Q-CRPS-3), and a function that quietly minted keys would make it
    easy to ship one by accident.
    """
    return seed, public_key_of(seed)


def sign(seed: bytes, message: bytes) -> bytes:
    """The 64-byte detached signature of *message* under the private *seed* (RFC 8032 §5.1.6)."""
    scalar, prefix = _expand(seed)
    public = _compress(_point_mul(scalar, _G))
    r = int.from_bytes(_sha512(prefix + message), "little") % _Q
    r_point = _compress(_point_mul(r, _G))
    k = int.from_bytes(_sha512(r_point + public + message), "little") % _Q
    s = (r + k * scalar) % _Q
    return r_point + int.to_bytes(s, 32, "little")


def verify(public_key: bytes, message: bytes, signature: bytes) -> bool:
    """Whether *signature* is a valid Ed25519 signature (RFC 8032 §5.1.7).

    Returns `False` for every malformed input — a wrong length, a non-canonical point, an
    out-of-range scalar. It never raises and never reports WHICH check failed: the caller's finding
    vocabulary distinguishes an unknown signer from a bad signature (see `findings.py`), and this
    function distinguishing more than that would only widen an oracle.
    """
    if not isinstance(public_key, (bytes, bytearray)) or len(public_key) != 32:
        return False
    if not isinstance(signature, (bytes, bytearray)) or len(signature) != 64:
        return False
    public_key = bytes(public_key)
    signature = bytes(signature)
    point_a = _decompress(public_key)
    if point_a is None:
        return False
    r_bytes = signature[:32]
    point_r = _decompress(r_bytes)
    if point_r is None:
        return False
    s = int.from_bytes(signature[32:], "little")
    if s >= _Q:
        return False
    k = int.from_bytes(_sha512(r_bytes + public_key + message), "little") % _Q
    return _point_equal(_point_mul(s, _G), _point_add(point_r, _point_mul(k, point_a)))
