# N2 Companion

A privacy-first Chrome extension that turns Japanese encountered online into
contextual, reading-first flashcards for JLPT study.

N2 Companion is especially designed for learners from Chinese-language
backgrounds: recognizing a kanji is not the same as knowing its Japanese
reading, usage, or false-friend traps.

## What works today

- Select Japanese on ordinary web pages and click the floating **辞** button.
- Use the **Alt+J** shortcut or the right-click lookup action.
- Look up readings, definitions, parts of speech, common-word status, and JLPT tags.
- Select romaji and press **Alt+J** (or use the right-click action) to normalize
  readings automatically—for example, `oshiroi` → `おしろい` → `白粉`.
- Save the surrounding sentence, page title, URL, and dictionary result as one card.
- Warn about a curated set of common Japanese–Chinese false friends.
- Select text in Chrome's PDF viewer, right-click, and open an automatic lookup window.
- Open local PDFs in the built-in PDF.js reader for normal selectable-text
  lookup with the red **辞** button or **Alt+J**.
- Press **Alt+Shift+J** anywhere to capture the visible tab, crop Japanese text,
  and recognize it locally—even in PDFs, images, manga, Instagram, and video.
- Save the cropped source image with its contextual flashcard.
- Review due cards with Again, Hard, Good, and Easy scheduling.
- Track due cards, retention, today's reviews, daily goal, and exam countdown.
- Change the exam date and daily goal; export or restore a local JSON backup.

All study data stays in the browser. Dictionary terms are requested from
Jisho's public search endpoint; no sentence context is sent.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Choose this repository folder.
6. Open a normal web page containing Japanese, select a word, and click **辞**.

Use **Alt+Shift+J** for screenshot OCR. If that shortcut conflicts with another
application, change it at `chrome://extensions/shortcuts`.

Chrome does not inject extensions into already-open tabs. Refresh existing tabs
once after installation. Browser-internal pages such as `chrome://` cannot be
modified by extensions.

### Custom PDF reader

Open the extension popup and choose **Open custom PDF reader**, then select or
drag in a local PDF. PDF.js renders each page with a selectable text layer, so
highlighted Japanese uses the same red **辞** button as a normal website.
**Alt+J** also looks up the current selection. Image-only pages remain available
to **Alt+Shift+J** screenshot OCR.

The text layer follows PDF.js's official viewer scaling, marked-content, and
selection rules so highlight hitboxes align with the rendered glyphs.
Use **Ctrl+mouse-wheel** to change the reader's top-right zoom level without
triggering a separate Chrome page zoom.

When the active tab is already displaying a direct PDF URL, the popup offers
**Open this PDF in N2 Companion**. The extension requests access only to that
PDF's origin. Local `file://` PDFs additionally require Chrome's one-time
**Allow access to file URLs** toggle on the extension details page.

## PDFs, images, and video

Normal page text needs no OCR. For selectable PDFs, select a term and choose
**Look up Japanese** from the right-click menu. For scanned PDFs, manga,
screenshots, and burned-in video subtitles, press **Alt+Shift+J**, drag around
the text in the captured frame, correct the OCR result if necessary, and look
up the relevant word. OCR runs locally using Tesseract.js and Japanese trained
data; the first recognition can take longer while the engine initializes.

## Architecture

This MVP deliberately has no framework, bundler, server, or runtime dependency:

- Manifest V3 service worker for Jisho requests and context-menu actions
- isolated Shadow DOM lookup UI injected by the content script
- `chrome.storage.local` for cards, settings, and review history
- a small transparent spaced-repetition scheduler
- plain HTML/CSS modules for the dashboard, reviews, and settings

The small codebase is intentional: it is fast to load and easy to inspect.
The packaged OCR worker is loaded directly rather than through a `blob:` URL so
it remains compatible with Manifest V3's extension content security policy.
All WebAssembly core variants selected by Tesseract.js—including relaxed SIMD
variants used by newer Chromium builds—are bundled for offline execution.

## Development

Requires Node 20 or later only for validation and tests.

```bash
npm test
npm run check
```

## Roadmap

- [x] Region screenshot capture and local Japanese OCR
- [x] Attach source images to cards
- [ ] YouTube subtitle-track capture
- [ ] More reviewed Japanese–Chinese cognate and false-friend data
- [ ] CSV and Anki export
- [ ] Optional FSRS scheduler
- [ ] Optional AI explanations and N2-level question generation
- [ ] Offline JMdict dictionary package

## Dictionary note

The MVP uses Jisho's publicly accessible JSON search endpoint. It is not a
documented compatibility guarantee, so a later offline version should index
[JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)
directly and comply with its attribution requirements.

## License

[MIT](LICENSE)
