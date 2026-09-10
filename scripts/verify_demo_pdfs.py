from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "pdf"
EXPECTED_FILES = {
    "demo-boarding-pass.pdf",
    "demo-entry-waiver.pdf",
    "demo-flight-ticket.pdf",
    "demo-hotel-confirmation.pdf",
    "demo-insurance-summary.pdf",
    "demo-museum-ticket.pdf",
}
MAX_BYTES = 5_000_000


found_files = {path.name for path in SOURCE.glob("demo-*.pdf")}
assert found_files == EXPECTED_FILES, f"Unexpected demo PDF set: {sorted(found_files)}"

for filename in sorted(EXPECTED_FILES):
    path = SOURCE / filename
    reader = PdfReader(path)
    extracted_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert len(reader.pages) == 1, f"{filename} should have exactly one page"
    assert path.stat().st_size < MAX_BYTES, f"{filename} exceeds the upload limit"
    assert "SAMPLE - NOT VALID" in extracted_text, f"{filename} is missing its safety mark"
    assert reader.metadata and "Not Valid" in (reader.metadata.title or ""), f"{filename} has unsafe metadata"
    print(f"OK  {filename}  {path.stat().st_size} bytes")
