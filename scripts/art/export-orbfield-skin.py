"""Re-export approved Orbfield masters. Requires Pillow; changes only trim/size/encoding."""
from pathlib import Path
from PIL import Image
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art-source/games/orbfield/moonlit"
DEST = ROOT / "static/games/dodge/skins/moonlit"
DEST.mkdir(parents=True, exist_ok=True)

with Image.open(SOURCE / "moonlit-conservatory.png") as image:
    image.resize((960, 640), Image.Resampling.LANCZOS).save(DEST / "arena.webp", "WEBP", quality=78, method=6)
for name, box in [("pearl-wisp", (70, 78, 1186, 1174)), ("thorn-mote", (44, 44, 1209, 1179))]:
    with Image.open(SOURCE / f"{name}.png") as master:
        image = master.crop(box)
        image.thumbnail((128, 128), Image.Resampling.LANCZOS)
        image.save(DEST / f"{name}.webp", "WEBP", quality=90, method=6)
with Image.open(ROOT / "art-source/world/companions/muse/production/v1/frames/idle/s/muse_idle_s_01.png") as image:
    image.resize((128, 128), Image.Resampling.LANCZOS).save(DEST / "muse.webp", "WEBP", quality=92, method=6)

files = []
for path in sorted(DEST.glob("*.webp")):
    with Image.open(path) as image:
        alpha = image.getchannel("A") if image.mode == "RGBA" else None
        files.append({
            "file": str(path.relative_to(ROOT)), "width": image.width, "height": image.height,
            "mode": image.mode, "bytes": path.stat().st_size,
            "decodedRgbaBytes": image.width * image.height * 4,
            "alphaExtrema": list(alpha.getextrema()) if alpha else None,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()
        })
manifest = {
    "skin": "moonlit-conservatory", "generatedOn": "2026-10-04", "files": files,
    "totalTransferBytes": sum(file["bytes"] for file in files),
    "totalDecodedRgbaBytes": sum(file["decodedRgbaBytes"] for file in files),
    "memoryScope": "Image textures only; excludes browser overhead and the existing 960x540 canvas. No extra canvas cache."
}
assert manifest["totalTransferBytes"] < 150_000
assert manifest["totalDecodedRgbaBytes"] < 3_000_000
(SOURCE / "runtime-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=2))
