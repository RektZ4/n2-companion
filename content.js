(() => {
  const HOST_ID = "n2-companion-root";
  let lastSelection = null;

  const isJapanese = (text) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(text || "");
  const compact = (text, max = 320) => {
    const value = (text || "").replace(/\s+/g, " ").trim();
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  };

  document.addEventListener("mouseup", (event) => {
    if (event.target?.closest?.(`#${HOST_ID}`)) return;
    setTimeout(() => captureSelection(event.clientX, event.clientY), 0);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") removeHost();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "N2_LOOKUP_TEXT") showLookup(message.text, window.innerWidth / 2, 90);
    if (message.type === "N2_LOOKUP_CURRENT_SELECTION") {
      const selection = readSelection();
      if (selection) showLookup(selection.text, window.innerWidth / 2, 90, selection.context);
    }
  });

  function readSelection() {
    const selection = window.getSelection();
    const text = compact(selection?.toString(), 100);
    if (!text || !isJapanese(text) || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;
    return { text, context: compact(container?.textContent || text), range };
  }

  function captureSelection(x, y) {
    const selected = readSelection();
    if (!selected) return removeHost();
    lastSelection = selected;
    showTrigger(x, y);
  }

  function root() {
    removeHost();
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      *{box-sizing:border-box} button{font:600 13px system-ui;cursor:pointer}
      .trigger{width:34px;height:34px;border:0;border-radius:10px;background:#e5484d;color:white;box-shadow:0 5px 18px #0004}
      .panel{width:min(390px,calc(100vw - 24px));max-height:min(540px,calc(100vh - 24px));overflow:auto;background:#fffdf8;color:#272522;border:1px solid #eadfce;border-radius:16px;box-shadow:0 18px 55px #30281840;font:14px/1.45 system-ui;padding:16px}
      .top{display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{color:#b4232c;font-weight:800;letter-spacing:.03em}.close{border:0;background:transparent;font-size:20px;color:#746b60}
      .selected{font:700 23px/1.3 system-ui;margin:8px 0 14px}.entry{border-top:1px solid #eee3d3;padding:13px 0}.word{font-size:19px;font-weight:750}.reading{color:#72685d;margin-left:7px}.meaning{margin:7px 0;color:#3f3a34}.cue{background:#fff0d9;border-left:3px solid #cf852e;padding:8px 9px;margin:8px 0;font-size:12px}.meta{font-size:11px;color:#877b6e;text-transform:uppercase}.save{width:100%;border:0;border-radius:9px;padding:9px;background:#272522;color:white}.save:hover{background:#b4232c}.saved{background:#477a5b}.status{padding:18px;text-align:center;color:#746b60}.error{color:#b4232c}
    </style>`;
    document.documentElement.appendChild(host);
    return { host, shadow };
  }

  function showTrigger(x, y) {
    const { host, shadow } = root();
    host.style.left = `${Math.min(x + 8, window.innerWidth - 50)}px`;
    host.style.top = `${Math.min(y + 8, window.innerHeight - 50)}px`;
    shadow.innerHTML += `<button class="trigger" title="Look up with N2 Companion">辞</button>`;
    shadow.querySelector("button").addEventListener("click", () => showLookup(lastSelection.text, x, y, lastSelection.context));
  }

  async function showLookup(text, x, y, context = "") {
    const selected = compact(text, 100);
    const { host, shadow } = root();
    host.style.left = `${Math.max(12, Math.min(x, window.innerWidth - 402))}px`;
    host.style.top = `${Math.max(12, Math.min(y + 10, window.innerHeight - 552))}px`;
    shadow.innerHTML += `<section class="panel"><div class="top"><span class="brand">N2 COMPANION</span><button class="close" aria-label="Close">×</button></div><div class="selected"></div><div class="status">Looking up…</div></section>`;
    shadow.querySelector(".selected").textContent = selected;
    shadow.querySelector(".close").addEventListener("click", removeHost);
    const status = shadow.querySelector(".status");
    const response = await chrome.runtime.sendMessage({ type: "N2_DICTIONARY_LOOKUP", text: selected }).catch((error) => ({ ok: false, error: error.message }));
    if (!response?.ok) {
      status.className = "status error";
      status.textContent = response?.error || "Lookup failed.";
      return;
    }
    if (!response.entries.length) {
      status.textContent = "No dictionary entries found. Try selecting a shorter expression.";
      return;
    }
    status.remove();
    const panel = shadow.querySelector(".panel");
    response.entries.forEach((entry) => {
      const section = document.createElement("article");
      section.className = "entry";
      const meanings = entry.senses.flatMap((sense) => sense.meanings).slice(0, 5);
      const parts = [...new Set(entry.senses.flatMap((sense) => sense.partsOfSpeech))].slice(0, 3);
      section.innerHTML = `<div><span class="word"></span><span class="reading"></span></div><div class="meta"></div><div class="meaning"></div><div class="cue" hidden></div><button class="save">Save contextual card</button>`;
      section.querySelector(".word").textContent = entry.term;
      section.querySelector(".reading").textContent = entry.reading ? `【${entry.reading}】` : "";
      section.querySelector(".meta").textContent = [entry.jlpt.join(" · ").toUpperCase(), ...parts].filter(Boolean).join(" · ");
      section.querySelector(".meaning").textContent = meanings.join("; ");
      const cue = section.querySelector(".cue");
      if (entry.chineseCue) { cue.textContent = entry.chineseCue; cue.hidden = false; }
      section.querySelector(".save").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        const result = await chrome.runtime.sendMessage({ type: "N2_SAVE_CARD", card: {
          term: entry.term, reading: entry.reading, meanings, partsOfSpeech: parts,
          context: context || selected, sourceUrl: location.href, sourceTitle: document.title,
          tags: entry.jlpt.length ? entry.jlpt.map((tag) => tag.toUpperCase()) : ["N2"], notes: entry.chineseCue || ""
        }});
        button.textContent = result?.duplicate ? "Already saved" : "Saved for review ✓";
        button.classList.add("saved");
      });
      panel.appendChild(section);
    });
  }

  function removeHost() {
    document.getElementById(HOST_ID)?.remove();
  }
})();
