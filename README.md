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
- Save the surrounding sentence, page title, URL, and dictionary result as one card.
- Warn about a curated set of common Japanese–Chinese false friends.
- Select text in Chrome's PDF viewer, right-click, and open an automatic lookup window.
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

Chrome does not inject extensions into already-open tabs. Refresh existing tabs
once after installation. Browser-internal pages such as `chrome://` cannot be
modified by extensions.

## PDFs, images, and video

Normal page text needs no OCR. For selectable PDFs, select a term and choose
**Look up Japanese** from the right-click menu. Scanned PDFs, manga, screenshots, and burned-in video
subtitles contain pixels rather than selectable characters and therefore need
OCR. Region capture, local Japanese OCR, and storing a source frame with a card
are planned for the next milestone.

## Architecture

This MVP deliberately has no framework, bundler, server, or runtime dependency:

- Manifest V3 service worker for Jisho requests and context-menu actions
- isolated Shadow DOM lookup UI injected by the content script
- `chrome.storage.local` for cards, settings, and review history
- a small transparent spaced-repetition scheduler
- plain HTML/CSS modules for the dashboard, reviews, and settings

The small codebase is intentional: it is fast to load and easy to inspect.

## Development

Requires Node 20 or later only for validation and tests.

```bash
npm test
npm run check
```

## Roadmap

- [ ] Region screenshot capture and local Japanese OCR
- [ ] Attach source images to cards
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
