// Chat page logic. All model text is inserted with textContent, never as HTML.
(() => {
  const cfg = window.CHAT_CONFIG || {};
  const log = document.getElementById("log");
  const form = document.getElementById("form");
  const input = document.getElementById("q");
  const send = document.getElementById("send");
  const WELCOME = log.innerHTML;
  /** Last few turns, sent so follow-up questions make sense. */
  let history = [];

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  function addUser(text) {
    const m = el("div", "msg user");
    m.appendChild(el("div", "bubble")).appendChild(el("p", "", text));
    log.appendChild(m);
    scrollDown();
  }

  function addTyping() {
    const m = el("div", "msg bot");
    const b = el("div", "bubble");
    const t = el("span", "typing");
    t.setAttribute("aria-label", "Thinking");
    t.append(el("i"), el("i"), el("i"));
    b.appendChild(t);
    m.appendChild(b);
    log.appendChild(m);
    scrollDown();
    return m;
  }

  function sourceBlock(sources) {
    const d = el("details", "sources");
    d.appendChild(el("summary", "", `Sources (${sources.length})`));
    for (const s of sources) {
      const box = el("div", "source");
      const title = el("b", "", `${s.docTitle} > ${s.heading}`);
      box.appendChild(title);
      if (/archived|superseded/i.test(s.docStatus || "")) box.appendChild(el("span", "tag-archived", "Archived document"));
      box.appendChild(el("small", "", s.snippet));
      d.appendChild(box);
    }
    return d;
  }

  function addBot(r) {
    const m = el("div", "msg bot");
    const b = el("div", "bubble");
    b.appendChild(el("p", "", r.answer));
    m.appendChild(b);

    if (r.abstained) {
      const n = el("div", "notice");
      n.appendChild(el("strong", "", "I don't know this one"));
      n.appendChild(document.createTextNode("A consultant can help. Phone 012 555 0142 or email hello@marularidge.example."));
      m.appendChild(n);
    } else {
      const badges = el("div", "badges");
      const label = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" }[r.confidence];
      if (label) badges.appendChild(el("span", `badge ${r.confidence}`, label));
      if (r.needsHuman) badges.appendChild(el("span", "badge flag", "Flagged for a consultant"));
      m.appendChild(badges);
      if (r.needsHuman) {
        const n = el("div", "notice");
        n.appendChild(el("strong", "", "Please check this with a consultant"));
        n.appendChild(document.createTextNode("This answer is general information. A consultant should review your own situation."));
        m.appendChild(n);
      }
      if (r.sources && r.sources.length) m.appendChild(sourceBlock(r.sources));
    }
    log.appendChild(m);
    scrollDown();
  }

  function addError(text) {
    const m = el("div", "msg bot");
    const b = el("div", "bubble");
    b.appendChild(el("p", "", text));
    m.appendChild(b);
    log.appendChild(m);
    scrollDown();
  }

  async function ask(question) {
    if (!cfg.CHAT_URL) {
      addError("This page is not connected to a chat service yet. Set CHAT_URL in config.js.");
      return;
    }
    send.disabled = true;
    addUser(question);
    const typing = addTyping();
    try {
      const headers = { "content-type": "application/json" };
      if (cfg.SUPABASE_ANON_KEY) {
        headers.apikey = cfg.SUPABASE_ANON_KEY;
        headers.authorization = `Bearer ${cfg.SUPABASE_ANON_KEY}`;
      }
      const res = await fetch(cfg.CHAT_URL, { method: "POST", headers, body: JSON.stringify({ question, history }) });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok) {
        addError(data.message || "Something went wrong. Please try again.");
        return;
      }
      addBot(data);
      history.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
      history = history.slice(-4);
    } catch {
      typing.remove();
      addError("I could not reach the service. Check your connection and try again.");
    } finally {
      send.disabled = false;
      input.focus();
    }
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || send.disabled) return;
    input.value = "";
    autosize();
    ask(q);
  });

  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  document.getElementById("chips").addEventListener("click", (e) => {
    if (e.target.classList.contains("chip") && !send.disabled) ask(e.target.textContent);
  });

  document.getElementById("reset").addEventListener("click", () => {
    history = [];
    log.innerHTML = WELCOME;
    input.focus();
  });
})();
