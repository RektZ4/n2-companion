# Privacy

N2 Companion stores cards, settings, source URLs, and study history locally in
Chrome extension storage. It does not include analytics, accounts, advertising,
or a project-operated server.

OCR screenshots are processed locally by the bundled Tesseract.js engine. A
cropped screenshot is stored locally only when the user explicitly saves that
OCR result as a card; screenshots are never uploaded by N2 Companion.

PDFs opened in the custom reader are parsed locally using bundled PDF.js files.
The PDF document is not uploaded or retained after the reader tab is closed.

Selected terms are sent to Jisho's public word-search endpoint to retrieve
dictionary entries, to Jotoba only when Jisho has no result, and to Tatoeba's
API to find one example sentence. Surrounding sentences and browsing history
are not sent to these services.
Source URLs are stored only when the user explicitly saves a card.

Exported JSON backups are created locally and are controlled by the user. If
weekly automatic backups are enabled, Chrome downloads one after a card save
once seven days have elapsed.
