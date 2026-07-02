function parseCompactNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let text = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[,，]/g, "")
    .replace(/[개회]/g, "");

  if (!text) {
    return null;
  }

  const suffixMultipliers = [
    [/^([0-9]+(?:\.[0-9]+)?)(억)$/i, 100000000],
    [/^([0-9]+(?:\.[0-9]+)?)(만)$/i, 10000],
    [/^([0-9]+(?:\.[0-9]+)?)(천)$/i, 1000],
    [/^([0-9]+(?:\.[0-9]+)?)(b)$/i, 1000000000],
    [/^([0-9]+(?:\.[0-9]+)?)(m)$/i, 1000000],
    [/^([0-9]+(?:\.[0-9]+)?)(k)$/i, 1000]
  ];

  for (const [pattern, multiplier] of suffixMultipliers) {
    const match = text.match(pattern);
    if (match) {
      return Math.round(Number(match[1]) * multiplier);
    }
  }

  const numeric = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function firstMetric(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const parsed = parseCompactNumber(match[1]);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  return null;
}

function parseMetricsFromText(rawText) {
  const text = String(rawText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    likeCount: firstMetric(text, [
      /좋아요\s*([0-9,.]+(?:\.[0-9]+)?\s*(?:천|만|억|[KMBkmb])?)\s*개?/,
      /([0-9,.]+(?:\.[0-9]+)?\s*(?:[KMBkmb])?)\s+likes?/i
    ]),
    commentCount: firstMetric(text, [
      /댓글\s*([0-9,.]+(?:\.[0-9]+)?\s*(?:천|만|억|[KMBkmb])?)\s*개/,
      /댓글\s*([0-9,.]+(?:\.[0-9]+)?\s*(?:천|만|억|[KMBkmb])?)\s*개?\s*모두\s*보기/,
      /View\s+all\s+([0-9,.]+(?:\.[0-9]+)?\s*(?:[KMBkmb])?)\s+comments?/i,
      /([0-9,.]+(?:\.[0-9]+)?\s*(?:[KMBkmb])?)\s+comments?/i
    ]),
    viewCount: firstMetric(text, [
      /조회\s*([0-9,.]+(?:\.[0-9]+)?\s*(?:천|만|억|[KMBkmb])?)\s*회?/,
      /재생\s*([0-9,.]+(?:\.[0-9]+)?\s*(?:천|만|억|[KMBkmb])?)\s*회?/,
      /([0-9,.]+(?:\.[0-9]+)?\s*(?:[KMBkmb])?)\s+views?/i,
      /([0-9,.]+(?:\.[0-9]+)?\s*(?:[KMBkmb])?)\s+plays?/i
    ])
  };
}

module.exports = {
  parseCompactNumber,
  parseMetricsFromText
};

