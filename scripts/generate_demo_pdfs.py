from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output" / "pdf"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BRAND = HexColor("#142F31")
CANVAS = HexColor("#F5F1E8")
SURFACE = HexColor("#FFFDF8")
CORAL = HexColor("#E8785B")
MUTED = HexColor("#5D6B6A")
LINE = HexColor("#D8D3C7")
SUCCESS = HexColor("#2F7A60")
WHITE = HexColor("#FFFFFF")


def rounded_box(pdf, x, y, width, height, fill=SURFACE, stroke=LINE, radius=14):
    pdf.setFillColor(fill)
    pdf.setStrokeColor(stroke)
    pdf.setLineWidth(0.8)
    pdf.roundRect(x, y, width, height, radius, fill=1, stroke=1)


def text(pdf, value, x, y, size=10, color=BRAND, font="Helvetica"):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    pdf.drawString(x, y, value)


def label(pdf, value, x, y):
    text(pdf, value.upper(), x, y, 7, MUTED, "Helvetica-Bold")


def field(pdf, key, value, x, y, value_size=11):
    label(pdf, key, x, y)
    text(pdf, value, x, y - 17, value_size, BRAND, "Helvetica-Bold")


def watermark(pdf, width, height):
    pdf.saveState()
    pdf.setFillColor(Color(0.91, 0.47, 0.36, alpha=0.095))
    pdf.translate(width / 2, height / 2)
    pdf.rotate(32)
    pdf.setFont("Helvetica-Bold", 50)
    value = "SAMPLE - NOT VALID"
    pdf.drawCentredString(0, -15, value)
    pdf.restoreState()


def header(pdf, title, subtitle, width, height):
    pdf.setFillColor(CANVAS)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(BRAND)
    pdf.roundRect(42, height - 86, 40, 40, 11, fill=1, stroke=0)
    text(pdf, "TV", 52, height - 72, 11, WHITE, "Helvetica-Bold")
    text(pdf, "TRIP VAULT DEMO", 96, height - 58, 8, MUTED, "Helvetica-Bold")
    text(pdf, title, 96, height - 79, 18, BRAND, "Helvetica-Bold")
    text(pdf, subtitle, 42, height - 112, 9, MUTED)
    pdf.setStrokeColor(LINE)
    pdf.line(42, height - 128, width - 42, height - 128)


def footer(pdf, width):
    pdf.setStrokeColor(LINE)
    pdf.line(42, 52, width - 42, 52)
    text(pdf, "Synthetic preview document. No booking, identity, or payment value.", 42, 35, 7, MUTED)
    right = "SAMPLE - NOT VALID"
    text(pdf, right, width - 42 - stringWidth(right, "Helvetica-Bold", 7), 35, 7, CORAL, "Helvetica-Bold")


def finish(pdf, width, height):
    watermark(pdf, width, height)
    footer(pdf, width)
    pdf.showPage()
    pdf.save()


def flight_ticket():
    path = OUTPUT_DIR / "demo-flight-ticket.pdf"
    width, height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    pdf.setTitle("Sample Aster Air e-ticket - Not Valid")
    header(pdf, "Aster Air e-ticket", "Fictional flight confirmation for interface testing", width, height)

    rounded_box(pdf, 42, height - 290, width - 84, 132, BRAND, BRAND, 18)
    text(pdf, "DEL", 70, height - 210, 31, WHITE, "Helvetica-Bold")
    text(pdf, "06:40", 70, height - 239, 11, Color(1, 1, 1, alpha=0.7), "Helvetica-Bold")
    pdf.setStrokeColor(CORAL)
    pdf.setLineWidth(3)
    pdf.line(190, height - 218, width - 190, height - 218)
    text(pdf, "AV 218", width / 2 - 20, height - 204, 8, CORAL, "Helvetica-Bold")
    text(pdf, "FCO", width - 142, height - 210, 31, WHITE, "Helvetica-Bold")
    text(pdf, "12:10", width - 142, height - 239, 11, Color(1, 1, 1, alpha=0.7), "Helvetica-Bold")

    rounded_box(pdf, 42, height - 490, width - 84, 170)
    field(pdf, "Passenger", "SAM SHAH", 66, height - 354)
    field(pdf, "Date", "18 JUN 2027", 300, height - 354)
    field(pdf, "Cabin", "ECONOMY", 66, height - 414)
    field(pdf, "Status", "DEMO CONFIRMED", 300, height - 414)
    field(pdf, "Reference", "DEMO-ONLY", 66, height - 474)
    field(pdf, "Ticket", "NOT-A-REAL-TICKET", 300, height - 474, 9)

    rounded_box(pdf, 42, height - 642, width - 84, 120)
    label(pdf, "Included in this demo", 66, height - 555)
    text(pdf, "One checked bag", 66, height - 582, 11, BRAND, "Helvetica-Bold")
    text(pdf, "Meal preference saved", 66, height - 606, 10, MUTED)
    text(pdf, "This document cannot be used for travel.", 300, height - 582, 10, CORAL, "Helvetica-Bold")
    finish(pdf, width, height)


def boarding_pass():
    path = OUTPUT_DIR / "demo-boarding-pass.pdf"
    width, height = landscape(A4)
    pdf = canvas.Canvas(str(path), pagesize=(width, height), pageCompression=1)
    pdf.setTitle("Sample Aster Air boarding pass - Not Valid")
    header(pdf, "Aster Air boarding pass", "Fictional mobile-document preview - code is intentionally non-functional", width, height)

    rounded_box(pdf, 42, 116, width - 84, height - 270, SURFACE, LINE, 22)
    pdf.setFillColor(BRAND)
    pdf.roundRect(42, 116, 175, height - 270, 22, fill=1, stroke=0)
    text(pdf, "AV 218", 70, height - 195, 13, CORAL, "Helvetica-Bold")
    text(pdf, "DEL", 70, height - 245, 38, WHITE, "Helvetica-Bold")
    text(pdf, "TO", 70, height - 273, 8, Color(1, 1, 1, alpha=0.65), "Helvetica-Bold")
    text(pdf, "FCO", 70, height - 319, 38, WHITE, "Helvetica-Bold")

    field(pdf, "Passenger", "SAM SHAH", 250, height - 190)
    field(pdf, "Boarding", "05:55", 450, height - 190, 18)
    field(pdf, "Gate", "22B", 610, height - 190, 18)
    field(pdf, "Seat", "18A", 250, height - 265, 18)
    field(pdf, "Group", "3", 450, height - 265, 18)
    field(pdf, "Date", "18 JUN 2027", 610, height - 265)

    rounded_box(pdf, 250, 142, width - 315, 82, CANVAS, LINE, 10)
    label(pdf, "Demo code - not scannable", 266, 198)
    pdf.setStrokeColor(BRAND)
    for index in range(29):
        x = 268 + index * 13
        top = 183 if index % 3 else 176
        pdf.setLineWidth(1 if index % 4 else 4)
        pdf.line(x, 157, x, top)
    pdf.setStrokeColor(CORAL)
    pdf.setLineWidth(4)
    pdf.line(264, 154, width - 72, 205)
    finish(pdf, width, height)


def hotel_confirmation():
    path = OUTPUT_DIR / "demo-hotel-confirmation.pdf"
    width, height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    pdf.setTitle("Sample Casa Bellora confirmation - Not Valid")
    header(pdf, "Casa Bellora confirmation", "Fictional accommodation record for the Mediterranean Summer demo", width, height)

    rounded_box(pdf, 42, height - 292, width - 84, 134, BRAND, BRAND, 18)
    text(pdf, "ROME", 66, height - 205, 12, CORAL, "Helvetica-Bold")
    text(pdf, "3 nights at Casa Bellora", 66, height - 240, 25, WHITE, "Helvetica-Bold")
    text(pdf, "A fictional property used only inside Trip Vault", 66, height - 268, 9, Color(1, 1, 1, alpha=0.7))

    rounded_box(pdf, 42, height - 476, width - 84, 154)
    field(pdf, "Check in", "18 JUN - 15:00", 66, height - 357)
    field(pdf, "Check out", "21 JUN - 08:00", 310, height - 357)
    field(pdf, "Guests", "5 TRAVELERS", 66, height - 419)
    field(pdf, "Rooms", "2 ROOMS", 310, height - 419)
    field(pdf, "Reference", "DEMO-STAY", 66, height - 467)

    rounded_box(pdf, 42, height - 650, width - 84, 142)
    label(pdf, "Arrival notes", 66, height - 543)
    text(pdf, "Late arrival noted", 66, height - 571, 11, BRAND, "Helvetica-Bold")
    text(pdf, "Breakfast included. Lift access available.", 66, height - 596, 10, MUTED)
    text(pdf, "The displayed address and contact details are fictional.", 66, height - 621, 9, CORAL, "Helvetica-Bold")
    finish(pdf, width, height)


def insurance_summary():
    path = OUTPUT_DIR / "demo-insurance-summary.pdf"
    width, height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    pdf.setTitle("Sample travel cover summary - Not Valid")
    header(pdf, "Travel cover summary", "Fictional policy summary - not insurance and not evidence of cover", width, height)

    rounded_box(pdf, 42, height - 260, width - 84, 102, SUCCESS, SUCCESS, 18)
    text(pdf, "DEMO COVER STATUS", 66, height - 198, 8, Color(1, 1, 1, alpha=0.75), "Helvetica-Bold")
    text(pdf, "Prepared for offline review", 66, height - 230, 22, WHITE, "Helvetica-Bold")

    rounded_box(pdf, 42, height - 466, width - 84, 176)
    field(pdf, "Named group", "MEDITERRANEAN SUMMER", 66, height - 325)
    field(pdf, "Travel dates", "18-27 JUN 2027", 320, height - 325)
    field(pdf, "Policy", "NOT-A-POLICY", 66, height - 394)
    field(pdf, "Provider", "DEMO COVER CO.", 320, height - 394)
    text(pdf, "No claim, emergency assistance, or financial protection is provided.", 66, height - 449, 9, CORAL, "Helvetica-Bold")

    rounded_box(pdf, 42, height - 652, width - 84, 152)
    label(pdf, "Demo checklist", 66, height - 534)
    rows = ["Emergency contact copied offline", "Traveler names reviewed", "Original documents retained separately"]
    for index, value in enumerate(rows):
        y = height - 570 - index * 30
        pdf.setFillColor(BRAND)
        pdf.circle(72, y + 3, 7, fill=1, stroke=0)
        text(pdf, "x", 69.5, y, 8, WHITE, "Helvetica-Bold")
        text(pdf, value, 92, y, 10, BRAND)
    finish(pdf, width, height)


def museum_ticket():
    path = OUTPUT_DIR / "demo-museum-ticket.pdf"
    width, height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    pdf.setTitle("Sample Colosseum ticket - Not Valid")
    header(pdf, "Colosseum evening tour", "Fictional activity ticket - not valid for entry", width, height)

    rounded_box(pdf, 42, height - 360, width - 84, 202, BRAND, BRAND, 22)
    text(pdf, "ROME - DAY 2", 66, height - 202, 8, CORAL, "Helvetica-Bold")
    text(pdf, "19 JUN 2027", 66, height - 245, 29, WHITE, "Helvetica-Bold")
    text(pdf, "16:30 entry", 66, height - 277, 13, Color(1, 1, 1, alpha=0.75), "Helvetica-Bold")
    text(pdf, "SAM SHAH", 66, height - 323, 11, WHITE, "Helvetica-Bold")
    rounded_box(pdf, width - 205, height - 327, 118, 118, WHITE, WHITE, 10)
    pdf.setStrokeColor(BRAND)
    for row in range(7):
        for col in range(7):
            if (row * 3 + col * 5) % 4 < 2:
                pdf.rect(width - 190 + col * 13, height - 311 + row * 13, 8, 8, fill=1, stroke=0)
    pdf.setStrokeColor(CORAL)
    pdf.setLineWidth(5)
    pdf.line(width - 198, height - 320, width - 78, height - 204)

    rounded_box(pdf, 42, height - 548, width - 84, 152)
    field(pdf, "Meet", "NORTH ENTRANCE", 66, height - 432)
    field(pdf, "Arrive", "20 MIN EARLY", 310, height - 432)
    text(pdf, "Demo code: NOT-SCANNABLE", 66, height - 493, 10, CORAL, "Helvetica-Bold")
    text(pdf, "This sample is paired with a separate demo waiver on the same event.", 66, height - 522, 9, MUTED)
    finish(pdf, width, height)


def entry_waiver():
    path = OUTPUT_DIR / "demo-entry-waiver.pdf"
    width, height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
    pdf.setTitle("Sample activity waiver - Not Valid")
    header(pdf, "Evening tour waiver", "Fictional companion document demonstrating multiple event attachments", width, height)

    rounded_box(pdf, 42, height - 280, width - 84, 122)
    label(pdf, "Activity", 66, height - 198)
    text(pdf, "Colosseum evening tour", 66, height - 227, 17, BRAND, "Helvetica-Bold")
    text(pdf, "19 JUN 2027 - 16:30", 66, height - 253, 10, MUTED)

    rounded_box(pdf, 42, height - 518, width - 84, 204)
    label(pdf, "Demo acknowledgements", 66, height - 352)
    items = [
        "This is a fictional sample and creates no agreement.",
        "No real operator, location, or participant information is included.",
        "The app keeps this as a second document on one itinerary event.",
        "Removing the event link does not delete this Vault document.",
    ]
    for index, value in enumerate(items):
        y = height - 390 - index * 34
        pdf.setStrokeColor(BRAND)
        pdf.rect(67, y - 3, 12, 12, fill=0, stroke=1)
        text(pdf, value, 94, y, 9, BRAND)

    rounded_box(pdf, 42, height - 650, width - 84, 98, CANVAS, LINE)
    text(pdf, "NO SIGNATURE REQUIRED", 66, height - 595, 12, CORAL, "Helvetica-Bold")
    text(pdf, "This sample must never be presented as a legal waiver.", 66, height - 620, 9, MUTED)
    finish(pdf, width, height)


if __name__ == "__main__":
    flight_ticket()
    boarding_pass()
    hotel_confirmation()
    insurance_summary()
    museum_ticket()
    entry_waiver()
    for pdf_path in sorted(OUTPUT_DIR.glob("demo-*.pdf")):
        print(f"{pdf_path.name}: {pdf_path.stat().st_size} bytes")
