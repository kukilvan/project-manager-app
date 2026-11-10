# Drawings are parsed by the PDF text layer, without AI

Status: accepted

Parsing reads captions from the PDF text layer (color, font, size) with MuPDF in a Web Worker, not image recognition. AI or a person only decides which caption groups are points and of which type; the goal is autonomous parsing in the app with a caption catalog edited in the app. A separate tool for Claude lives in `tools/tohnit/`.

## Consequences

- Accuracy beats fewer questions: 5–10 button questions on a new drawing are fine. A few misses per hundreds of points are acceptable; dozens of misses or junk (heights like H240, room numbers, dimensions) are not.
- Icons without numbers: each type is numbered separately from 1, left to right, neighbours consecutive; a big sheet splits into logical parts and numbering continues across them.
- New drawing version: a point missing on the new sheet stays and is flagged; moved points stay, the owner decides; the old sheet stays visible; new icons go straight to the wizard.
- Replacing a partial drawing with a full one will recur; «New drawing version» exists for it.
