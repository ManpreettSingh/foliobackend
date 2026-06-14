export type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string;
};

export class NewsService {
  private static decodeXml(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .trim();
  }

  static async getNewsForQuery(query: string): Promise<NewsItem[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    // Focus on financial news and search by the query (e.g. BTC or company name)
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=en-IN&gl=IN&ceid=IN:en`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`Google News request failed with status: ${response.status}`);
      }

      const xml = await response.text();
      const items: NewsItem[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(xml)) !== null) {
        const itemContent = match[1];
        const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
        const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/);

        if (titleMatch && linkMatch) {
          let title = this.decodeXml(titleMatch[1]);
          const link = this.decodeXml(linkMatch[1]);
          const pubDate = pubDateMatch ? this.decodeXml(pubDateMatch[1]) : "";
          let source = sourceMatch ? this.decodeXml(sourceMatch[1]) : "";

          // Clean up title if it ends with " - Source Name"
          if (source && title.endsWith(` - ${source}`)) {
            title = title.substring(0, title.length - (source.length + 3));
          } else {
            const hyphenIdx = title.lastIndexOf(" - ");
            if (hyphenIdx > 0) {
              if (!source) {
                source = title.substring(hyphenIdx + 3);
              }
              title = title.substring(0, hyphenIdx);
            }
          }

          items.push({
            title: title.trim(),
            link: link.trim(),
            source: (source || "News").trim(),
            pubDate: pubDate.trim(),
          });
        }
      }

      // Return top 10 unique headlines
      const seen = new Set<string>();
      const uniqueItems: NewsItem[] = [];
      for (const item of items) {
        const normalizedTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seen.has(normalizedTitle)) {
          seen.add(normalizedTitle);
          uniqueItems.push(item);
        }
        if (uniqueItems.length >= 10) break;
      }

      return uniqueItems;
    } catch (err) {
      console.error(`Failed to fetch news for query "${query}":`, err);
      return [];
    }
  }
}
