from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "pdf"
TARGET = ROOT / "tmp" / "pdfs"
TARGET.mkdir(parents=True, exist_ok=True)

renders: list[tuple[str, Image.Image]] = []
for pdf_path in sorted(SOURCE.glob("demo-*.pdf")):
    document = pdfium.PdfDocument(pdf_path)
    page = document[0]
    image = page.render(scale=1.75).to_pil()
    target_path = TARGET / f"{pdf_path.stem}.png"
    image.save(target_path)
    renders.append((pdf_path.stem.removeprefix("demo-").replace("-", " ").title(), image))
    print(target_path.relative_to(ROOT))

thumbnail_width = 420
label_height = 42
gutter = 20
columns = 2
rows = (len(renders) + columns - 1) // columns
scaled: list[tuple[str, Image.Image]] = []
for title, source_image in renders:
    ratio = thumbnail_width / source_image.width
    scaled.append((title, source_image.resize((thumbnail_width, int(source_image.height * ratio)))))

row_heights = []
for row in range(rows):
    row_images = scaled[row * columns : (row + 1) * columns]
    row_heights.append(max(image.height for _, image in row_images) + label_height)

sheet_width = columns * thumbnail_width + (columns + 1) * gutter
sheet_height = sum(row_heights) + (rows + 1) * gutter
sheet = Image.new("RGB", (sheet_width, sheet_height), "#d8d3c7")
draw = ImageDraw.Draw(sheet)
y = gutter
for row in range(rows):
    row_images = scaled[row * columns : (row + 1) * columns]
    for column, (title, image) in enumerate(row_images):
        x = gutter + column * (thumbnail_width + gutter)
        draw.rectangle((x, y, x + thumbnail_width, y + row_heights[row]), fill="#fffdf8")
        draw.text((x + 14, y + 12), title, fill="#142f31")
        sheet.paste(image, (x, y + label_height))
    y += row_heights[row] + gutter

contact_sheet = TARGET / "contact-sheet.png"
sheet.save(contact_sheet)
print(contact_sheet.relative_to(ROOT))
