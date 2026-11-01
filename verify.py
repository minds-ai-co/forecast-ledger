#!/usr/bin/env python3
"""Verify this forecast ledger export. Python 3 standard library only.

  python3 verify.py [DIR]            (default: the folder this script is in)
  python3 verify.py [DIR] --online   (also fetch the attested Bitcoin block headers from a public explorer)

Checks
1. proofs/index.jsonl: the hash chain (each line commits to the previous one, from 64 zeros).
2. proofs/batches/*.json: each manifest is canonical JSON, matches the chain, its Merkle root recomputes from its
   entry hashes and its chain head is the chain hash of its last entry.
3. proofs/batches/*.json.ots: each OpenTimestamps proof commits to the SHA-256 of its manifest; the proof is replayed
   operation by operation to every Bitcoin block attestation, giving the Merkle root that block must have.
   Offline, that root is compared with the block recorded in index.json; with --online, with the block header itself.
4. index.json and forecasts/: every listed batch, manifest hash and Merkle root matches, every forecast hash is the one
   in the chain, and every chained entry appears in exactly one forecasts file.
5. entries/ (if present): every raw entry file hashes to its chain entry.
Exit code 0 when everything passes.
"""
import hashlib
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

GENESIS = "0" * 64
OTS_MAGIC = b"\x00OpenTimestamps\x00\x00Proof\x00\xbf\x89\xe2\xe8\x84\xe8\x92\x94"
BITCOIN_TAG = bytes.fromhex("0588960d73d71901")
PENDING_TAG = bytes.fromhex("83dfe30d2ef90c8e")
EXPLORERS = ["https://blockstream.info/api", "https://mempool.space/api"]


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def merkle_root(hashes):
    level = [hashlib.sha256(b"\x00" + bytes.fromhex(h)).digest() for h in hashes]
    while len(level) > 1:
        level = [hashlib.sha256(b"\x01" + level[i] + level[i + 1]).digest() if i + 1 < len(level) else level[i]
                 for i in range(0, len(level), 2)]
    return level[0].hex()


# OpenTimestamps proof replay ----------------------------------------------------------------------------
class Reader:
    def __init__(self, data):
        self.data, self.pos = data, 0

    def bytes(self, n):
        if self.pos + n > len(self.data):
            raise ValueError("truncated proof")
        out = self.data[self.pos:self.pos + n]
        self.pos += n
        return out

    def varuint(self):
        value, shift = 0, 0
        while True:
            b = self.bytes(1)[0]
            value |= (b & 0x7F) << shift
            if not b & 0x80:
                return value
            shift += 7

    def varbytes(self):
        return self.bytes(self.varuint())


UNARY = {0x08: lambda m: hashlib.sha256(m).digest(), 0x02: lambda m: hashlib.sha1(m).digest(),
         0x03: lambda m: hashlib.new("ripemd160", m).digest(), 0xF2: lambda m: m[::-1], 0xF3: lambda m: m.hex().encode()}


def replay(r, msg, found, depth=0):
    """Walk one timestamp node: apply each operation to `msg`, collect (kind, value, message) attestations."""
    if depth > 256:
        raise ValueError("proof too deep")

    def child(tag):
        if tag == 0x00:
            att_tag, payload = r.bytes(8), r.varbytes()
            if att_tag == BITCOIN_TAG:
                found.append(("bitcoin", Reader(payload).varuint(), msg))
            elif att_tag == PENDING_TAG:
                found.append(("pending", Reader(payload).varbytes().decode("utf-8", "replace"), msg))
            else:
                found.append(("other", att_tag.hex(), msg))
        elif tag == 0xF0:
            replay(r, msg + r.varbytes(), found, depth + 1)
        elif tag == 0xF1:
            replay(r, r.varbytes() + msg, found, depth + 1)
        elif tag in UNARY:
            replay(r, UNARY[tag](msg), found, depth + 1)
        else:
            raise ValueError(f"unknown operation 0x{tag:02x}")

    tag = r.bytes(1)[0]
    while tag == 0xFF:
        child(r.bytes(1)[0])
        tag = r.bytes(1)[0]
    child(tag)


def parse_ots(data):
    r = Reader(data)
    if r.bytes(len(OTS_MAGIC)) != OTS_MAGIC:
        raise ValueError("not an OpenTimestamps proof")
    if r.varuint() != 1:
        raise ValueError("unsupported proof version")
    if r.bytes(1)[0] != 0x08:
        raise ValueError("file hash is not SHA-256")
    digest = r.bytes(32)
    found = []
    replay(r, digest, found)
    return digest.hex(), found


def fetch_block(height):
    last = None
    for base in EXPLORERS:
        try:
            get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "ledger-verify"}), timeout=30).read().decode()
            block_hash = get(f"{base}/block-height/{int(height)}").strip()
            info = json.loads(get(f"{base}/block/{block_hash}"))
            return {"hash": block_hash, "merkle_root": info["merkle_root"],
                    "time": datetime.fromtimestamp(info["timestamp"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        except Exception as err:  # try the next explorer
            last = err
    raise RuntimeError(f"no explorer reachable: {last}")


# checks ------------------------------------------------------------------------------------------------
def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    online = "--online" in argv
    root = Path(args[0]) if args else Path(__file__).resolve().parent
    proofs = root / "proofs"
    problems, notes = [], []

    rows = [json.loads(l) for l in (proofs / "index.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    prev = GENESIS
    for i, row in enumerate(rows):
        if row["seq"] != i or row["prev_chain_sha256"] != prev:
            problems.append(f"chain broken at seq {i}")
        prev = sha(canonical({"seq": row["seq"], "entry_id": row["entry_id"], "entry_sha256": row["entry_sha256"],
                              "batch_id": row["batch_id"], "prev_chain_sha256": prev}))
        if row["chain_sha256"] != prev:
            problems.append(f"chain hash mismatch at {row['entry_id']}")
    by_id = {r["entry_id"]: r for r in rows}
    print(f"[1] hash chain: {len(rows)} entries, head {prev}")

    manifests, seen = {}, set()
    for path in sorted((proofs / "batches").glob("*.json")):
        raw = path.read_bytes()
        m = json.loads(raw)
        manifests[m["batch_id"]] = (m, sha(raw))
        if canonical(m) != raw:
            problems.append(f"manifest not canonical: {path.name}")
        hashes = []
        for e in sorted(m["entries"], key=lambda e: e["seq"]):
            r = by_id.get(e["entry_id"])
            if not r or r["entry_sha256"] != e["entry_sha256"] or r["batch_id"] != m["batch_id"] or r["seq"] != e["seq"]:
                problems.append(f"{path.name}: {e['entry_id']} does not match the chain")
            hashes.append(e["entry_sha256"])
            seen.add(e["entry_id"])
        if merkle_root(hashes) != m["merkle_root"]:
            problems.append(f"Merkle root mismatch: {path.name}")
        last = by_id.get(m["entries"][-1]["entry_id"]) if m["entries"] else None
        if not last or last["chain_sha256"] != m["chain_head_sha256"]:
            problems.append(f"chain head mismatch: {path.name}")
    if seen != set(by_id):
        problems.append(f"{len(set(by_id) - seen)} chain entries without a manifest")
    print(f"[2] manifests: {len(manifests)} batches, Merkle roots and chain heads recomputed")

    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    recorded = {b["batch_id"]: b for t in index["targets"] for b in t["batches"]}
    counts = {"bitcoin": 0, "pending_only": 0, "missing": 0, "online_ok": 0}
    for batch_id, (m, manifest_sha) in manifests.items():
        ots = proofs / "batches" / f"{batch_id}.json.ots"
        if not ots.exists():
            counts["missing"] += 1
            notes.append(f"no OTS proof yet: {batch_id}")
            continue
        try:
            digest, found = parse_ots(ots.read_bytes())
        except ValueError as err:
            problems.append(f"{ots.name}: {err}")
            continue
        if digest != manifest_sha:
            problems.append(f"{ots.name}: proof does not commit to its manifest")
            continue
        btc = [(h, msg[::-1].hex()) for kind, h, msg in found if kind == "bitcoin"]
        if not btc:
            counts["pending_only"] += 1
            notes.append(f"calendar receipt only, no Bitcoin attestation yet: {batch_id}")
            continue
        counts["bitcoin"] += 1
        rec = recorded.get(batch_id) or {}
        if rec.get("bitcoin_block_height") is not None:
            match = [root_hex for h, root_hex in btc if h == rec["bitcoin_block_height"]]
            if not match:
                problems.append(f"{ots.name}: no attestation for recorded block {rec['bitcoin_block_height']}")
            elif rec.get("bitcoin_block_merkle_root") and match[0] != rec["bitcoin_block_merkle_root"]:
                problems.append(f"{ots.name}: replayed Merkle root differs from index.json")
        if online:
            h, root_hex = min(btc)
            try:
                block = fetch_block(h)
            except RuntimeError as err:
                problems.append(f"{ots.name}: {err}")
                continue
            if block["merkle_root"] != root_hex:
                problems.append(f"{ots.name}: Bitcoin block {h} Merkle root does not match the proof")
            else:
                counts["online_ok"] += 1
                if rec.get("bitcoin_block_time_utc") and rec["bitcoin_block_time_utc"] != block["time"] and rec.get("bitcoin_block_height") == h:
                    problems.append(f"{ots.name}: block time differs from index.json")
    print(f"[3] OpenTimestamps: {counts['bitcoin']} proofs replayed to a Bitcoin attestation, {counts['pending_only']} awaiting "
          f"Bitcoin, {counts['missing']} without proof" + (f"; {counts['online_ok']} confirmed against block headers" if online else
                                                          " (run with --online to compare with the block headers)"))

    listed = {}
    for t in index["targets"]:
        for b in t["batches"]:
            m = manifests.get(b["batch_id"])
            if not m:
                problems.append(f"index.json: unknown batch {b['batch_id']}")
                continue
            if m[1] != b["manifest_sha256"] or m[0]["merkle_root"] != b["merkle_root"] or len(m[0]["entries"]) != b["entries"]:
                problems.append(f"index.json: batch {b['batch_id']} does not match its manifest")
        for rel in t["forecasts"].values():
            for e in json.loads((root / rel).read_text(encoding="utf-8"))["entries"]:
                r = by_id.get(e["entry_id"])
                if not r or r["entry_sha256"] != e["entry_sha256"] or r["batch_id"] != e["batch_id"]:
                    problems.append(f"{rel}: {e['entry_id']} does not match the chain")
                if e["entry_id"] in listed:
                    problems.append(f"{rel}: {e['entry_id']} listed twice")
                listed[e["entry_id"]] = rel
    missing = set(by_id) - set(listed)
    if missing:
        notes.append(f"{len(missing)} chained entries not listed under forecasts/ (not part of a listed target)")
    print(f"[4] index.json: {len(index['targets'])} targets, {len(listed)} forecast hashes matched to the chain")

    entries = sorted((root / "entries").glob("*.json")) if (root / "entries").exists() else []
    for path in entries:
        r = by_id.get(path.stem)
        if not r or sha(path.read_bytes()) != r["entry_sha256"]:
            problems.append(f"entry hash mismatch: {path.name}")
    print(f"[5] raw entry files: {len(entries)} checked")

    for n in notes:
        print("NOTE", n)
    for p in problems:
        print("FAIL", p)
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
