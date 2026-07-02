const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { parseMetricsFromText } = require("./metrics");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTerm(term) {
  return String(term || "")
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, " ");
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function inferType(url) {
  if (/\/reel\//i.test(url)) return "reel";
  if (/\/tv\//i.test(url)) return "video";
  return "post";
}

function trimText(value, max = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .trim();
}

function compactForMatch(value) {
  return normalizeForMatch(value).replace(/\s+/g, "");
}

function buildExpectedTerms(values) {
  const input = Array.isArray(values) ? values : [values];
  const terms = [];
  for (const value of input) {
    const normalized = normalizeTerm(value);
    if (!normalized) continue;
    terms.push(normalized);
    const compact = normalized.replace(/\s+/g, "");
    if (compact && compact !== normalized) {
      terms.push(compact);
    }
  }
  return [...new Set(terms)];
}

function matchExpectedTerms(text, expectedTerms) {
  if (!expectedTerms.length) {
    return { matched: true, matchedTerms: [] };
  }

  const normalizedText = normalizeForMatch(text);
  const compactText = compactForMatch(text);
  const matchedTerms = expectedTerms.filter((term) => {
    const normalizedTerm = normalizeForMatch(term);
    const compactTerm = compactForMatch(term);
    return normalizedText.includes(normalizedTerm) || compactText.includes(compactTerm);
  });

  return {
    matched: matchedTerms.length > 0,
    matchedTerms
  };
}

class InstagramCollector {
  constructor({ profileDir }) {
    this.profileDir = profileDir;
    this.context = null;
    this.page = null;
    this.running = false;
  }

  async openBrowser(progress = () => {}) {
    await fs.mkdir(this.profileDir, { recursive: true });

    if (this.context) {
      this.page = this.page || this.context.pages()[0] || await this.context.newPage();
      await this.page.bringToFront();
      return {
        profileDir: this.profileDir,
        url: this.page.url()
      };
    }

    progress({ level: "info", message: "브라우저를 여는 중입니다." });
    const launchOptions = {
      headless: false,
      viewport: null,
      locale: "ko-KR",
      args: ["--start-maximized"]
    };
    try {
      this.context = await chromium.launchPersistentContext(this.profileDir, launchOptions);
    } catch (error) {
      const backupDir = `${this.profileDir}.backup-${timestampForPath()}`;
      progress({
        level: "warn",
        message: `브라우저 프로필을 열 수 없어 새 프로필로 재시도합니다. 기존 프로필은 백업됩니다: ${backupDir}`
      });
      await this.closeBrowser().catch(() => {});
      await fs.rename(this.profileDir, backupDir).catch(() => {});
      await fs.mkdir(this.profileDir, { recursive: true });
      this.context = await chromium.launchPersistentContext(this.profileDir, launchOptions);
    }
    this.context.setDefaultTimeout(15000);
    this.context.setDefaultNavigationTimeout(60000);
    this.page = this.context.pages()[0] || await this.context.newPage();
    await this.page.bringToFront();
    if (!/^https:\/\/www\.instagram\.com\//i.test(this.page.url())) {
      this.page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch((error) => {
        progress({
          level: "warn",
          message: `Instagram 로딩이 지연되었습니다. 브라우저에서 직접 새로고침할 수 있습니다: ${error.message}`
        });
      });
    }
    return {
      profileDir: this.profileDir,
      url: this.page.url()
    };
  }

  async closeBrowser() {
    if (this.context) {
      await this.context.close();
    }
    this.context = null;
    this.page = null;
  }

  async getPage(progress) {
    if (!this.context || !this.page) {
      await this.openBrowser(progress);
    }
    return this.page;
  }

  async collect(options, progress = () => {}) {
    if (this.running) {
      throw new Error("이미 수집 작업이 실행 중입니다.");
    }

    this.running = true;
    try {
      const mode = options.mode || "hashtag";
      if (mode === "current") {
        const page = await this.getPage(progress);
        return await this.collectFromLoadedPage(page, {
          sourceMode: "current",
          sourceTerm: options.label || "current-page",
          collectionMode: options.collectionMode || "safe",
          expectedTerms: options.expectedTerms || [options.label],
          requireKeywordMatch: options.requireKeywordMatch,
          requirePageMatch: options.requirePageMatch,
          maxPosts: options.maxPostsPerTerm,
          scrollSteps: options.scrollSteps,
          delayMs: options.delayMs,
          collectDetails: options.collectDetails
        }, progress);
      }

      const terms = (options.terms || [])
        .map(normalizeTerm)
        .filter(Boolean);

      if (!terms.length) {
        throw new Error("수집할 키워드 또는 해시태그를 입력하세요.");
      }

      const results = [];
      for (const term of terms) {
        if (mode === "keyword") {
          results.push(...await this.collectKeyword(term, options, progress));
        } else {
          results.push(...await this.collectHashtag(term, options, progress));
        }
      }
      return results;
    } finally {
      this.running = false;
    }
  }

  async collectHashtag(term, options, progress) {
    const page = await this.getPage(progress);
    const encoded = encodeURIComponent(term.replace(/\s+/g, ""));
    const url = `https://www.instagram.com/explore/tags/${encoded}/`;
    progress({ level: "info", message: `#${term} 페이지로 이동합니다.` });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(options.delayMs);

    return await this.collectFromLoadedPage(page, {
      sourceMode: "hashtag",
      sourceTerm: term,
      collectionMode: options.collectionMode || "assisted",
      expectedTerms: options.expectedTerms || [term],
      requireKeywordMatch: options.requireKeywordMatch,
      requirePageMatch: options.requirePageMatch,
      maxPosts: options.maxPostsPerTerm,
      scrollSteps: options.scrollSteps,
      delayMs: options.delayMs,
      collectDetails: options.collectDetails
    }, progress);
  }

  async collectKeyword(term, options, progress) {
    const page = await this.getPage(progress);
    const url = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(term)}`;
    progress({ level: "info", message: `"${term}" 검색 페이지로 이동합니다.` });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(options.delayMs);

    let items = await this.collectFromLoadedPage(page, {
      sourceMode: "keyword",
      sourceTerm: term,
      collectionMode: options.collectionMode || "assisted",
      expectedTerms: options.expectedTerms || [term],
      requireKeywordMatch: options.requireKeywordMatch,
      requirePageMatch: options.requirePageMatch,
      maxPosts: options.maxPostsPerTerm,
      scrollSteps: options.scrollSteps,
      delayMs: options.delayMs,
      collectDetails: options.collectDetails
    }, progress);

    if (items.length > 0) {
      return items;
    }

    progress({
      level: "warn",
      message: `"${term}" 검색 화면에서 게시물 링크를 찾지 못했습니다. Instagram 페이지가 제대로 로드됐는지 확인한 뒤 다시 시도하세요.`
    });
    return items;
  }

  async collectFromLoadedPage(page, options, progress) {
    const maxPosts = Math.max(1, Math.min(Number(options.maxPosts || 20), 80));
    const scrollSteps = Math.max(0, Math.min(Number(options.scrollSteps || 2), 10));
    const delayMs = Math.max(800, Math.min(Number(options.delayMs || 1500), 10000));
    const collectDetails = Boolean(options.collectDetails);
    const sourcePageUrl = page.url();
    const searchedAt = new Date().toISOString();
    const collectionMode = options.collectionMode || (options.sourceMode === "current" ? "safe" : "assisted");
    const expectedTerms = buildExpectedTerms(options.expectedTerms || options.sourceTerm);
    const requireKeywordMatch = options.requireKeywordMatch === true && expectedTerms.length > 0;
    const requirePageMatch = options.requirePageMatch !== false && expectedTerms.length > 0;
    let pageKeywordMatched = expectedTerms.length === 0;

    if (expectedTerms.length) {
      const pageMatch = await this.pageContainsExpectedTerms(page, expectedTerms);
      pageKeywordMatched = pageMatch.matched;
      if (!pageMatch.matched) {
        progress({
          level: "warn",
          message: `현재 Instagram 화면에서 "${expectedTerms[0]}" 키워드를 찾지 못했습니다. 다른 검색/추천 화면을 수집 중일 수 있습니다.`
        });
        if (requirePageMatch) {
          return [];
        }
      }
    }

    const discovered = new Map();
    for (let step = 0; step <= scrollSteps; step += 1) {
      const visibleItems = await this.extractVisibleItems(page);
      for (let visibleIndex = 0; visibleIndex < visibleItems.length; visibleIndex += 1) {
        const item = visibleItems[visibleIndex];
        if (!discovered.has(item.url)) {
          const observedRank = discovered.size + 1;
          const match = matchExpectedTerms([item.previewText, item.url, sourcePageUrl].join(" "), expectedTerms);
          discovered.set(item.url, {
            ...item,
            sourceMode: options.sourceMode,
            sourceTerm: options.sourceTerm,
            collectionMode,
            searchedAt,
            observedRank,
            rankBucket: step === 0 ? "top_screen" : "extended",
            scrollStep: step,
            screenOrder: visibleIndex + 1,
            sourcePageUrl,
            pageKeywordMatched,
            collectionRule: "main_visual_media_grid",
            rawTextSnapshot: item.previewText || "",
            keywordMatched: match.matched,
            matchedTerms: match.matchedTerms
          });
        }
        if (discovered.size >= maxPosts) {
          break;
        }
      }

      progress({
        level: "info",
        message: `${options.sourceTerm}: ${discovered.size}개 링크를 찾았습니다.`
      });

      if (discovered.size >= maxPosts || step >= scrollSteps) {
        break;
      }

      if (step === 0 && discovered.size === 0) {
        const pageState = await this.detectPageState(page);
        if (pageState) {
          progress({ level: "warn", message: pageState });
        }
      }

      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(delayMs);
    }

    const items = Array.from(discovered.values()).slice(0, maxPosts);
    if (items.length === 0) {
      const pageState = await this.detectPageState(page);
      if (pageState) {
        progress({ level: "warn", message: pageState });
      }
    }

    if (!collectDetails || items.length === 0) {
      return this.applyKeywordFilter(items, expectedTerms, requireKeywordMatch, progress, options.sourceTerm);
    }

    const originalUrl = page.url();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      progress({
        level: "info",
        message: `${options.sourceTerm}: 상세 지표 확인 ${index + 1}/${items.length}`
      });
      try {
        const details = await this.collectPostDetails(page, item.url, delayMs);
        Object.assign(item, details);
        const match = matchExpectedTerms([
          item.caption,
          item.previewText,
          item.rawTextSnapshot,
          item.url,
          item.sourcePageUrl
        ].join(" "), expectedTerms);
        item.keywordMatched = match.matched;
        item.matchedTerms = match.matchedTerms;
      } catch (error) {
        item.error = error.message;
        progress({
          level: "warn",
          message: `${item.url} 상세 수집 실패: ${error.message}`
        });
      }
      await sleep(delayMs);
    }

    try {
      await page.goto(originalUrl, { waitUntil: "domcontentloaded" });
    } catch {
      // Keeping collected data is more important than restoring the page.
    }

    return this.applyKeywordFilter(items, expectedTerms, requireKeywordMatch, progress, options.sourceTerm);
  }

  async extractVisibleItems(page) {
    const records = await page.evaluate(() => {
      const root = document.querySelector("main") || document.body;
      const anchors = Array.from(root.querySelectorAll("a[href]"));
      const seen = new Map();

      for (const anchor of anchors) {
        if (anchor.closest("nav, header, footer, aside, [role='navigation'], [role='banner']")) {
          continue;
        }

        let href = anchor.href;
        if (!href || !/instagram\.com\/(p|reel|tv)\//i.test(href)) {
          continue;
        }
        try {
          const parsed = new URL(href);
          parsed.search = "";
          parsed.hash = "";
          href = parsed.toString();
        } catch {
          // Use original href.
        }

        if (seen.has(href)) {
          continue;
        }

        const rect = anchor.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          continue;
        }

        const img = anchor.querySelector("img");
        const video = anchor.querySelector("video");
        const hasVisualMedia = Boolean(img || video || anchor.querySelector("[style*='background-image']"));
        const mediaArea = rect.width * rect.height;
        const gridSized = rect.width >= 90 && rect.height >= 90 && mediaArea >= 8100;
        if (!hasVisualMedia || !gridSized) {
          continue;
        }

        const visible = rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth;
        if (!visible) {
          continue;
        }

        const textParts = [
          anchor.innerText,
          anchor.getAttribute("aria-label"),
          img ? img.getAttribute("alt") : "",
          anchor.closest("article") ? anchor.closest("article").innerText : ""
        ].filter(Boolean);

        seen.set(href, {
          url: href,
          previewText: textParts.join(" ").replace(/\s+/g, " ").trim(),
          thumbnail: img ? img.src : "",
          mediaPreview: video ? video.src : "",
          visible,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        });
      }

      return Array.from(seen.values())
        .sort((a, b) => (a.y - b.y) || (a.x - b.x));
    });

    return records.map((record) => ({
      ...record,
      url: normalizeUrl(record.url),
      type: inferType(record.url),
      previewText: trimText(record.previewText, 500)
    }));
  }

  async detectPageState(page) {
    const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (/captcha|challenge|automated|suspicious/i.test(normalized)) {
      return "Instagram 제한/인증 화면이 감지되었습니다. 우회하지 말고 브라우저에서 직접 확인하거나 수집을 중단하세요.";
    }
    if (/log in|sign up|로그인|가입|계정에 로그인/i.test(normalized)) {
      return "로그인 안내 화면이 감지되었습니다. 비로그인 상태에서는 검색 결과가 제한될 수 있습니다.";
    }
    return "";
  }

  async pageContainsExpectedTerms(page, expectedTerms) {
    const contextText = await page.evaluate(() => {
      const safeDecode = (value) => {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      };
      const inputText = Array.from(document.querySelectorAll("input, textarea"))
        .map((node) => [
          node.value,
          node.getAttribute("placeholder"),
          node.getAttribute("aria-label")
        ].filter(Boolean).join(" "))
        .join(" ");
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"))
        .map((node) => node.innerText || node.textContent || "")
        .join(" ");
      const bodyText = document.body ? document.body.innerText : "";
      return [
        window.location.href,
        safeDecode(window.location.href),
        document.title,
        inputText,
        headings,
        bodyText
      ].join(" ");
    }).catch(() => page.url());

    return matchExpectedTerms(contextText, expectedTerms);
  }

  applyKeywordFilter(items, expectedTerms, requireKeywordMatch, progress, sourceTerm) {
    if (!requireKeywordMatch || !expectedTerms.length) {
      return items;
    }

    const filtered = items.filter((item) => item.keywordMatched);
    const removedCount = items.length - filtered.length;
    if (removedCount > 0) {
      progress({
        level: filtered.length > 0 ? "info" : "warn",
        message: `${sourceTerm}: 키워드가 확인되지 않은 ${removedCount}개 항목을 제외했습니다.`
      });
    }
    if (items.length > 0 && filtered.length === 0) {
      progress({
        level: "warn",
        message: `"${expectedTerms[0]}" 키워드와 일치하는 게시글을 찾지 못했습니다. Instagram 브라우저에서 검색 결과 화면이 맞는지 확인하세요.`
      });
    }
    return filtered;
  }

  async collectPostDetails(page, url, delayMs) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(delayMs);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    const data = await page.evaluate(() => {
      const article = document.querySelector("article") || document.querySelector("main") || document.body;
      const articleText = article ? article.innerText : document.body.innerText;
      const firstHeading = article ? article.querySelector("h1") : null;
      const time = article ? article.querySelector("time") : null;
      const image = article ? article.querySelector("img[src]") : null;
      const video = article ? article.querySelector("video[src]") : null;
      const metaDescription = document.querySelector('meta[property="og:description"], meta[name="description"]');

      return {
        title: document.title || "",
        text: articleText || document.body.innerText || "",
        caption: firstHeading ? firstHeading.innerText : "",
        publishedAt: time ? time.getAttribute("datetime") : "",
        thumbnail: image ? image.src : "",
        mediaPreview: video ? video.src : "",
        description: metaDescription ? metaDescription.getAttribute("content") : ""
      };
    });

    const combinedText = [data.text, data.description, data.title].filter(Boolean).join(" ");
    const metrics = parseMetricsFromText(combinedText);
    const caption = data.caption || data.description || "";

    return {
      likeCount: metrics.likeCount,
      commentCount: metrics.commentCount,
      viewCount: metrics.viewCount,
      publishedAt: data.publishedAt || "",
      caption: trimText(caption, 1600),
      previewText: trimText(combinedText, 700),
      rawTextSnapshot: trimText(combinedText, 2000),
      thumbnail: data.thumbnail || "",
      mediaPreview: data.mediaPreview || ""
    };
  }
}

module.exports = {
  InstagramCollector,
  buildExpectedTerms,
  matchExpectedTerms
};
