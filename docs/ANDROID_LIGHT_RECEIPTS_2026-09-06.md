# Light receipt export correction - 2026-09-06

Verified mismatch: the on-screen document used the current receipt layout,
while image and PDF export called a separate black canvas with the old
ARC AGREEMENT header. The document also had a 40 px status badge above its title.

The preview now stays light in either app theme. A 24 px badge with a 14 px
glyph sits inline with the status heading. Details use the same compact badge.
Image and PDF export share one light layout using the existing logo, status,
amount, rows, full reference and footer. Status semantics are shared with the
preview. Full values wrap instead of being shortened. The PDF explorer link
remains attached to the reference area.

Synthetic completed, refunded and long funding receipts were rendered in a
browser with dark mode enabled. PDF raster renders were inspected. The JPEG
inside each PDF matches its separate image export byte-for-byte. All three
PDFs parse as one page and retain their explorer link. Receipt financial smoke
checks, surface assertions and TypeScript checks passed.

This is Android versionCode 3 / versionName 1.0.2. Device installation uses
adb install -r; no instrumentation cleanup or logout is performed.

Final Android build, unit tests and lint passed. Version 1.0.2 was installed
in place on the Pixel; its authenticated session and agreement list remained
available. The same returned-payment receipt was reopened. An actual new
Android image export was inspected: white background, current branding, and
compact inline return icon. The phone switched to another app during the
remaining UI checks, so the new PDF share-sheet flow was not independently
completed on the phone in this pass; its rendered output was verified locally.

APK SHA-256: 78a2f80e54ba3ff22f12ee1495c84d9bb9f3de7e15ac9cc80192a87224352938
