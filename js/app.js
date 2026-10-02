(function () {
  const site = window.SITE;
  const posts = (site.posts || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const KIND = { post: "博客", note: "笔记", paper: "博客" };
  let query = "";
  let lastHash = null;
  const hero = document.querySelector(".hero");

  const main = document.getElementById("main");
  const input = document.getElementById("q");

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function countWords(text) {
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = (text.match(/[A-Za-z]+/g) || []).length;
    return cjk + words;
  }

  function runtime(iso) {
    const start = new Date(iso + "T00:00:00");
    const now = new Date();
    if (Number.isNaN(start.getTime()) || now < start) return "0 天";
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();
    if (days < 0) {
      months -= 1;
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    const parts = [];
    if (years > 0) parts.push(years + "年");
    if (months > 0) parts.push(months + "个月");
    parts.push(days + "天");
    return parts.join("");
  }

  function renderMarkdown(src) {
    const held = [];
    const hold = (value) => {
      const token = `HOLD${held.length}TOKEN`;
      held.push(value);
      return token;
    };
    let text = String(src || "").replace(/```[\s\S]*?```/g, (block) => hold(block));
    text = text.replace(/`[^`\n]+`/g, (span) => hold(span));
    const math = (tex, display) => hold(katex.renderToString(tex.trim(), {
      displayMode: display,
      throwOnError: false
    }));
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => math(tex, true));
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => math(tex, true));
    text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => math(tex, false));
    text = text.replace(/(^|[^\\])\$(?!\$)([^$\n]+?)\$(?!\$)/g, (all, pre, tex) => pre + math(tex, false));
    text = text.replace(/HOLD(\d+)TOKEN/g, (_, index) => {
      const value = held[Number(index)];
      if (value.startsWith("```") || value.startsWith("`")) return value;
      return `HOLD${index}TOKEN`;
    });
    let html = marked.parse(text);
    html = html.replace(/HOLD(\d+)TOKEN/g, (_, index) => held[Number(index)]);
    return html;
  }

  function highlight(root) {
    root.querySelectorAll("pre code").forEach((block) => {
      try {
        hljs.highlightElement(block);
      } catch (err) {
        /* 未知语言时保留等宽纯文本 */
      }
    });
  }

  function parseRoute() {
    const parts = (location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
    if (parts[0] === "paper") return { name: "paper" };
    if (parts[0] === "note") return { name: "note" };
    if (parts[0] === "tools") return { name: "tools" };
    if (parts[0] === "read" && parts[1]) return { name: "read", id: decodeURIComponent(parts[1]) };
    return { name: "home" };
  }

  function inView(post, name) {
    if (name === "paper") return post.type === "paper";
    if (name === "note") return post.type === "note" || post.type === "post";
    return true;
  }

  function matches(post, q) {
    const parts = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = [post.title, post.summary, post.abstract, post.body, post.journal, (post.tags || []).join(" ")]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return parts.every((part) => hay.includes(part));
  }

  function entryHtml(post) {
    const kind = KIND[post.type] || "";
    const tags = (post.tags || []).length ? `<p class="tags">${esc(post.tags.join("  "))}</p>` : "";
    const head = `<time datetime="${esc(post.date)}">${esc(post.date)}</time>`;
    if (post.type === "paper") {
      const journal = post.journal ? `<p class="journal">${esc(post.journal)}</p>` : "";
      const link = post.url ? `<p><a class="paper-link" href="${esc(post.url)}">原文</a></p>` : "";
      return `<article class="entry">${head}<div><p class="kind">${kind}</p><h2>${esc(post.title)}</h2>${journal}<div class="abstract">${renderMarkdown(post.abstract || "")}</div>${link}${tags}</div></article>`;
    }
    return `<a class="entry" href="#/read/${encodeURIComponent(post.id)}">${head}<div><p class="kind">${kind}</p><h2>${esc(post.title)}</h2><p class="summary">${esc(post.summary || "")}</p>${tags}</div></a>`;
  }

  function renderList(name) {
    const items = posts.filter((post) => inView(post, name));
    const label = name === "paper" ? "paper" : name === "note" ? "note" : "首页";
    if (!items.length) {
      main.innerHTML = `<h1 class="sr-only">${label}</h1><p class="empty">这里还没有文章。</p>`;
      return;
    }
    main.innerHTML = `<h1 class="sr-only">${label}</h1><div class="feed">${items.map(entryHtml).join("")}</div>`;
  }

  function renderResults(q) {
    const items = posts.filter((post) => matches(post, q));
    const title = items.length ? `找到 ${items.length} 篇` : "没有匹配的文章";
    const body = items.length
      ? `<div class="feed">${items.map(entryHtml).join("")}</div>`
      : `<p class="empty">没有和「${esc(q)}」有关的文章。换个词，或者清空搜索。</p>`;
    main.innerHTML = `<h1 class="result-title">${title}</h1>${body}`;
  }

  function renderArticle(id) {
    const post = posts.find((item) => item.id === id);
    if (!post || post.type === "paper") {
      main.innerHTML = `<p class="empty">没有这篇文章。</p><p><a href="#/">回首页</a></p>`;
      return;
    }
    const back = post.type === "note" ? "#/note" : "#/";
    main.innerHTML = `<article class="reader"><a class="back" href="${back}">返回</a><h1>${esc(post.title)}</h1><p class="when">${esc(KIND[post.type] || "")} ${esc(post.date)}</p><div class="prose">${renderMarkdown(post.body || "")}</div></article>`;
    highlight(main);
  }

  function setNav(name) {
    document.querySelectorAll(".nav a").forEach((link) => {
      if (link.dataset.nav === name) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function renderSide() {
    const words = posts.reduce((sum, post) => {
      return sum + countWords([post.title, post.body, post.abstract, post.journal].filter(Boolean).join("\n"));
    }, 0);
    const last = site.updated || posts.reduce((max, post) => (post.date > max ? post.date : max), "");
    const blog = posts.filter((post) => post.type === "post" || post.type === "paper").length;
    const note = posts.filter((post) => post.type === "note").length;
    const links = [];
    if (site.github) links.push(`<a href="${esc(site.github)}" target="_blank" rel="noopener noreferrer"><img class="link-icon" src="assets/github.svg" alt="">GitHub</a>`);
    if (site.email) links.push(`<a class="mail" href="mailto:${esc(site.email)}"><img class="link-icon" src="assets/mail.svg" alt="">${esc(site.email)}</a>`);
    document.getElementById("side").innerHTML = `
      <section class="profile">
        <div class="avatar-frame"><img src="assets/avatar.png" alt=""></div>
        <h2>${esc(site.name)}</h2>
        <p class="bio">${esc(site.bio)}</p>
        <div class="counts">
          <div><strong>${blog}</strong><span>博客</span></div>
          <div><strong>${note}</strong><span>笔记</span></div>
        </div>
        <p class="profile-links">${links.join("")}</p>
      </section>
      <section>
        <h2>公告</h2>
        <p>${esc(site.announcement)}</p>
      </section>
      <section>
        <h2>网站资讯</h2>
        <dl class="info">
          <dt>文章数目</dt><dd>${posts.length}</dd>
          <dt>已运行时间</dt><dd>${esc(runtime(site.launched))}</dd>
          <dt>本站总字数</dt><dd>${words.toLocaleString("zh-CN")}</dd>
          <dt>最后更新时间</dt><dd>${esc(last)}</dd>
        </dl>
      </section>`;
  }

  function render() {
    const route = parseRoute();
    const q = query.trim();
    if (location.hash !== lastHash) {
      lastHash = location.hash;
      window.scrollTo(0, 0);
    }
    document.body.classList.toggle("is-home", route.name === "home" && !q);
    syncHeader();
    let nav = route.name === "read" ? "note" : route.name;
    if (route.name === "read") {
      const post = posts.find((item) => item.id === route.id);
      if (!post || post.type === "paper") nav = "home";
      else if (post.type === "post") nav = "home";
      else nav = "note";
    }
    setNav(nav);
    if (route.name === "read") {
      const post = posts.find((item) => item.id === route.id);
      document.title = post && post.type !== "paper" ? `${post.title} · LiferAl` : "LiferAl";
      renderArticle(route.id);
      return;
    }
    if (q) {
      document.title = "搜索 · LiferAl";
      renderResults(q);
      return;
    }
    if (route.name === "tools") {
      document.title = "工具链接 · LiferAl";
      renderTools();
      return;
    }
    document.title = route.name === "home" ? "LiferAl" : `${route.name} · LiferAl`;
    renderList(route.name);
  }

  function renderTools() {
    const items = site.tools || [];
    if (!items.length) {
      main.innerHTML = `<h1 class="sr-only">工具链接</h1><p class="empty">还没有网址。在 js/site.js 的 tools 里写上名称和链接。</p>`;
      return;
    }
    const body = items.map((item) => {
      const desc = item.desc ? `<p>${esc(item.desc)}</p>` : "";
      return `<a class="tool" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><h2>${esc(item.title || item.url)}</h2>${desc}<p class="tool-url">${esc(item.url)}</p></a>`;
    }).join("");
    main.innerHTML = `<h1 class="sr-only">工具链接</h1><div class="tools">${body}</div>`;
  }

  document.querySelector(".search").addEventListener("submit", (event) => {
    event.preventDefault();
  });
  input.addEventListener("input", () => {
    query = input.value;
    if (query.trim() && parseRoute().name === "read") {
      if ((location.hash || "#/") !== "#/") location.hash = "#/";
      else render();
      return;
    }
    render();
  });
  document.querySelectorAll(".nav a, .brand").forEach((link) => {
    link.addEventListener("click", () => {
      if (!input.value) return;
      input.value = "";
      query = "";
      window.setTimeout(render, 0);
    });
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("scroll", syncHeader, { passive: true });
  playTyped(hero.querySelector(".hero-typed-text"), hero.querySelector(".typed-cursor"));

  function playTyped(textEl, cursorEl) {
    const sentence = "Life is a soup, and I'm a fork";
    if (!textEl || !cursorEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      textEl.textContent = sentence;
      return;
    }
    const typeSpeed = 150;
    const backSpeed = 50;
    const startDelay = 300;
    const backDelay = 700;
    const humanizer = (speed) => Math.round((Math.random() * speed) / 2) + speed;
    let pos = 0;

    const blink = (on) => cursorEl.classList.toggle("typed-cursor--blink", on);

    function typewrite() {
      window.setTimeout(() => {
        blink(false);
        if (pos >= sentence.length) {
          blink(true);
          window.setTimeout(backspace, backDelay);
          return;
        }
        pos += 1;
        textEl.textContent = sentence.slice(0, pos);
        typewrite();
      }, humanizer(typeSpeed));
    }

    function backspace() {
      blink(false);
      window.setTimeout(() => {
        textEl.textContent = sentence.slice(0, pos);
        if (pos > 0) {
          pos -= 1;
          backspace();
          return;
        }
        window.setTimeout(typewrite, startDelay);
      }, humanizer(backSpeed));
    }

    blink(false);
    window.setTimeout(typewrite, startDelay);
  }

  function syncHeader() {
    const threshold = document.body.classList.contains("is-home")
      ? Math.max(0, hero.offsetHeight - 72)
      : 24;
    document.body.classList.toggle("is-scrolled", window.scrollY > threshold);
  }

  renderSide();
  render();
})();
