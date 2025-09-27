import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";

const fetchCryptoNews = async ({
  category,
  limit,
  logger,
}: {
  category: string;
  limit: number;
  logger?: IMastraLogger;
}) => {
  try {
    logger?.info('🔧 [CryptoNewsTool] Starting news fetch', { category, limit });
    
    // Using CoinGecko news API - free tier, no API key required
    let url = `https://api.coingecko.com/api/v3/news`;
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`CoinGecko News API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    logger?.info('📝 [CryptoNewsTool] Raw news response', { count: data.data?.length || 0 });

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid news data format");
    }

    // Filter and process news based on category
    let filteredNews = data.data;
    
    if (category !== 'all') {
      // Filter by category keywords
      const categoryKeywords = {
        bitcoin: ['bitcoin', 'btc'],
        ethereum: ['ethereum', 'eth', 'ether'],
        defi: ['defi', 'decentralized', 'lending', 'yield', 'liquidity'],
        nft: ['nft', 'non-fungible', 'collectible', 'art', 'opensea'],
        trading: ['trading', 'exchange', 'binance', 'coinbase', 'trade'],
        regulation: ['regulation', 'regulatory', 'sec', 'government', 'legal'],
        market: ['market', 'price', 'bull', 'bear', 'analysis']
      };

      const keywords = categoryKeywords[category as keyof typeof categoryKeywords] || [];
      if (keywords.length > 0) {
        filteredNews = data.data.filter((article: any) => {
          const title = article.title?.toLowerCase() || '';
          const description = article.description?.toLowerCase() || '';
          return keywords.some(keyword => 
            title.includes(keyword) || description.includes(keyword)
          );
        });
      }
    }

    // Limit results
    const limitedNews = filteredNews.slice(0, limit);

    const processedNews = limitedNews.map((article: any) => ({
      id: article.id,
      title: article.title,
      description: article.description,
      url: article.url,
      source: article.news_site,
      publishedAt: article.created_at,
      thumb: article.thumb_2x || article.thumb || null,
    }));

    logger?.info('✅ [CryptoNewsTool] Successfully processed news', { 
      total: data.data.length, 
      filtered: filteredNews.length,
      returned: processedNews.length 
    });

    return {
      category,
      totalFound: filteredNews.length,
      articles: processedNews,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger?.error('❌ [CryptoNewsTool] Error fetching crypto news', { error: errorMessage });
    throw error;
  }
};

const searchCryptoNews = async ({
  query,
  limit,
  logger,
}: {
  query: string;
  limit: number;
  logger?: IMastraLogger;
}) => {
  try {
    logger?.info('🔧 [CryptoNewsTool] Starting news search', { query, limit });
    
    // For search functionality, we'll fetch all news and filter locally
    const response = await fetch('https://api.coingecko.com/api/v3/news');

    if (!response.ok) {
      throw new Error(`CoinGecko News API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid news data format");
    }

    // Search in title and description
    const searchTerms = query.toLowerCase().split(' ');
    const searchResults = data.data.filter((article: any) => {
      const title = article.title?.toLowerCase() || '';
      const description = article.description?.toLowerCase() || '';
      const content = `${title} ${description}`;
      
      return searchTerms.some(term => content.includes(term));
    });

    const limitedResults = searchResults.slice(0, limit);
    
    const processedResults = limitedResults.map((article: any) => ({
      id: article.id,
      title: article.title,
      description: article.description,
      url: article.url,
      source: article.news_site,
      publishedAt: article.created_at,
      thumb: article.thumb_2x || article.thumb || null,
      relevanceScore: calculateRelevance(article, query),
    }));

    // Sort by relevance
    processedResults.sort((a: any, b: any) => b.relevanceScore - a.relevanceScore);

    logger?.info('✅ [CryptoNewsTool] Successfully searched news', { 
      query,
      totalFound: searchResults.length,
      returned: processedResults.length 
    });

    return {
      query,
      totalFound: searchResults.length,
      articles: processedResults,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger?.error('❌ [CryptoNewsTool] Error searching crypto news', { error: errorMessage });
    throw error;
  }
};

const calculateRelevance = (article: any, query: string): number => {
  const title = article.title?.toLowerCase() || '';
  const description = article.description?.toLowerCase() || '';
  const searchTerms = query.toLowerCase().split(' ');
  
  let score = 0;
  
  searchTerms.forEach(term => {
    // Title matches are worth more
    if (title.includes(term)) score += 3;
    if (description.includes(term)) score += 1;
  });
  
  return score;
};

export const cryptoNewsTool = createTool({
  id: "crypto-news-tool",
  description: `Get the latest cryptocurrency news and market updates. Can fetch news by category (bitcoin, ethereum, defi, nft, trading, regulation, market) or search for specific topics. Perfect for staying updated on crypto market trends and developments.`,
  inputSchema: z.object({
    action: z.enum(["category", "search"]).describe("Whether to fetch news by category or search for specific topics"),
    category: z.enum(["all", "bitcoin", "ethereum", "defi", "nft", "trading", "regulation", "market"]).optional().describe("News category to fetch. Required for category action."),
    query: z.string().optional().describe("Search query for news articles. Required for search action."),
    limit: z.number().default(5).describe("Maximum number of articles to return (1-20)").refine(val => val >= 1 && val <= 20),
  }),
  outputSchema: z.union([
    z.object({
      category: z.string(),
      totalFound: z.number(),
      articles: z.array(z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        url: z.string(),
        source: z.string(),
        publishedAt: z.string(),
        thumb: z.string().nullable(),
      })),
    }),
    z.object({
      query: z.string(),
      totalFound: z.number(),
      articles: z.array(z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        url: z.string(),
        source: z.string(),
        publishedAt: z.string(),
        thumb: z.string().nullable(),
        relevanceScore: z.number(),
      })),
    })
  ]),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { action, category, query, limit } = context;

    logger?.info('🔧 [CryptoNewsTool] Starting execution', context);

    if (action === "category") {
      if (!category) {
        throw new Error("Category is required for category news fetch");
      }
      return await fetchCryptoNews({ category, limit, logger });
    } else {
      if (!query) {
        throw new Error("Query is required for news search");
      }
      return await searchCryptoNews({ query, limit, logger });
    }
  },
});