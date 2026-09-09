"""Build a source-only combined review ZIP from explicit allowlisted inputs."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
contract_root = root / "contracts"
files = {}

def include(source, destination):
    if not source.is_file() or source.is_symlink():
        raise RuntimeError("Missing or symlinked review input: " + str(source))
    files[destination] = source.read_bytes()

for folder, suffix in [("src", ".sol"), ("test", ".ts")]:
    for source in sorted((contract_root / folder).rglob("*" + suffix)):
        include(source, source.relative_to(contract_root).as_posix())
for name in ["package-lock.json", "tsconfig.json"]:
    include(contract_root / name, name)
package = json.loads((contract_root / "package.json").read_text())
package["scripts"] = {"compile": "hardhat compile", "test": "hardhat test --network hardhat"}
files["package.json"] = (json.dumps(package, indent=2) + "\n").encode()
files["hardhat.config.ts"] = b"import type { HardhatUserConfig } from 'hardhat/config';\nimport '@nomicfoundation/hardhat-toolbox';\nconst config: HardhatUserConfig = { defaultNetwork: 'hardhat', solidity: { version: '0.8.24', settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true } }, paths: { sources: './src', tests: './test', artifacts: './artifacts', cache: './cache' } };\nexport default config;\n"
for source in sorted((contract_root / "audits").glob("TRADE*.md")):
    include(source, "review/" + source.name)
for name in ["trade-escrow-candidate-manifest.json", "trade-escrow-static-findings.json"]:
    include(contract_root / "audits" / name, "review/" + name)
for source in sorted((root / "docs").glob("TRADE_*2026-09-09.md")):
    include(source, "context/docs/" + source.name)
for folder, pattern in [("api", "trade-*.ts"), ("src/lib", "trade*.ts"), ("src/components", "Trade*.tsx")]:
    for source in sorted((root / folder).glob(pattern)):
        include(source, "context/" + source.relative_to(root).as_posix())
include(root / "src/components/StreamPayTradeEnquiries.tsx", "context/src/components/StreamPayTradeEnquiries.tsx")
files["README.md"] = b"# HashPayStream combined Trade release review\n\nStart with review/TRADE_RELEASE_GATE_REVIEW_2026-09-09.md. This is a review submission, not audit clearance or deployment authorization.\n\nIncludes all eight current production contracts, including both savings contracts, every local contract test and test helper. Trade source is unchanged; new tests extend issuer-restriction, deadline and generated accounting coverage.\n\nReproduce with Node 24.14.1 (tested), npm ci --ignore-scripts, then npm test. The supplied Hardhat harness is local-only and preserves compiler 0.8.24, optimizer 200 and viaIR. The generic wallet fixture is not a live Circle or multisig test. context/ is selected integration reference, not a self-contained runnable application.\n\nReview retains nine Slither findings: one high balance/reentrancy heuristic, seven timestamp notices and one informational pragma notice. See the disposition document. An independent reviewer must assess these; passing tests are not complete exploit coverage.\n\nMANIFEST.json gives exact SHA-256 values for every delivered file except itself. Verify these after extraction. No environment, signer keys, browser data, database records or deployment commands are included. Older review documents describe their respective earlier snapshots; the release-gate review states the current result.\n"
for required in ["src/PersonalSavingsVault.sol", "src/LockedSavingsCohortVault.sol", "src/TradeEscrow.sol", "src/TradeEscrowFactory.sol"]:
    if required not in files:
        raise RuntimeError("Incomplete combined scope: " + required)
review = json.loads((contract_root / "audits/trade-escrow-candidate-manifest.json").read_text())
for name, expected in review["files"].items():
    if hashlib.sha256(files[name]).hexdigest() != expected:
        raise RuntimeError("Review manifest mismatch: " + name)
manifest = {"status": "review-required-not-deployed", "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(), "files": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
files["MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
archive = root / "output/playwright/HashPayStream-Trade-Combined-Review-2026-09-09.zip"
archive.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for name, data in sorted(files.items()):
        if name.startswith("/") or ".." in Path(name).parts or Path(name).name.startswith(".env"):
            raise RuntimeError("Unexpected review archive path")
        z.writestr(name, data)
with zipfile.ZipFile(archive) as z:
    if set(z.namelist()) != set(files):
        raise RuntimeError("Archive inventory mismatch")
    for name, expected in manifest["files"].items():
        if hashlib.sha256(z.read(name)).hexdigest() != expected:
            raise RuntimeError("Archive checksum mismatch: " + name)
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(checksum + "  " + archive.name + "\n")
print(json.dumps({"archive": str(archive), "files": len(files), "sha256": checksum}))
