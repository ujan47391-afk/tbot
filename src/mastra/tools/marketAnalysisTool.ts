import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";

const fetchMarketOverview = async ({ logger }: { logger?: IMastraLogger }) => {
  try {
    logger?.info('🔧 [MarketAnalysisTool] Starting market overview fetch');
    
    // Get global market data from CoinGecko
    const response = await fetch('https://api.coingecko.com/api/v3/global');

    if (!response.ok) {
      throw new Error(`CoinGecko Global API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    logger?.info('📝 [MarketAnalysisTool] Raw global data received');

    const globalData = data.data;
    
    const marketOverview = {
      totalMarketCap: globalData.total_market_cap?.usd || 0,
      totalVolume24h: globalData.total_volume?.usd || 0,
      marketCapChange24h: globalData.market_cap_change_percentage_24h_usd || 0,
      bitcoinDominance: globalData.market_cap_percentage?.btc || 0,
      ethereumDominance: globalData.market_cap_percentage?.eth || 0,
      activeCryptocurrencies: globalData.active_cryptocurrencies || 0,
      totalExchanges: globalData.markets || 0,
      fearGreedIndex: await getFearGreedIndex(logger),
      lastUpdated: new Date().toISOString(),
    };

    logger?.info('✅ [MarketAnalysisTool] Market overview compiled successfully');
    return marketOverview;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger?.error('❌ [MarketAnalysisTool] Error fetching market overview', { error: errorMessage });
    throw error;
  }
};

const getFearGreedIndex = async (logger?: IMastraLogger): Promise<number> => {
  try {
    // Alternative Fear & Greed Index API (free, no key required)
    const response = await fetch('https://api.alternative.me/fng/');
    
    if (!response.ok) {
      logger?.warn('⚠️ [MarketAnalysisTool] Fear & Greed Index API unavailable');
      return 50; // Neutral fallback
    }

    const data = await response.json();
    const index = data.data?.[0]?.value;
    
    return index ? parseInt(index) : 50;
  } catch (error) {
    logger?.warn('⚠️ [MarketAnalysisTool] Fear & Greed Index fetch failed, using neutral value');
    return 50; // Neutral fallback
  }
};

const analyzeTrendingCoins = async ({ limit, logger }: { limit: number; logger?: IMastraLogger }) => {
  try {
    logger?.info('🔧 [MarketAnalysisTool] Starting trending analysis', { limit });
    
    // Get trending coins from CoinGecko
    const trendingResponse = await fetch('https://api.coingecko.com/api/v3/search/trending');

    if (!trendingResponse.ok) {
      throw new Error(`CoinGecko Trending API error: ${trendingResponse.status} ${trendingResponse.statusText}`);
    }

    const trendingData = await trendingResponse.json();
    logger?.info('📝 [MarketAnalysisTool] Trending data received', { count: trendingData.coins?.length });

    const trendingCoins = trendingData.coins.slice(0, limit).map((coin: any) => ({
      id: coin.item.id,
      name: coin.item.name,
      symbol: coin.item.symbol,
      rank: coin.item.market_cap_rank,
      smallLogo: coin.item.small,
      priceChange24h: coin.item.data?.price_change_percentage_24h?.usd || null,
      sparkline: coin.item.data?.sparkline || null,
      marketCap: coin.item.data?.market_cap || null,
      totalVolume: coin.item.data?.total_volume || null,
    }));

    logger?.info('✅ [MarketAnalysisTool] Trending analysis completed', { processedCoins: trendingCoins.length });
    return { trendingCoins };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger?.error('❌ [MarketAnalysisTool] Error analyzing trending coins', { error: errorMessage });
    throw error;
  }
};

const analyzeTopMovers = async ({ timeframe, limit, logger }: { timeframe: string; limit: number; logger?: IMastraLogger }) => {
  try {
    logger?.info('🔧 [MarketAnalysisTool] Starting top movers analysis', { timeframe, limit });
    
    // Get top coins with price change data
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit * 3}&page=1&sparkline=false&price_change_percentage=${timeframe}`);

    if (!response.ok) {
      throw new Error(`CoinGecko Markets API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    logger?.info('📝 [MarketAnalysisTool] Market data received for movers analysis');

    // Sort by price change and get top gainers and losers
    const priceChangeKey = `price_change_percentage_${timeframe}_in_currency`;
    const validCoins = data.filter((coin: any) => coin[priceChangeKey] !== null);
    
    validCoins.sort((a: any, b: any) => (b[priceChangeKey] || 0) - (a[priceChangeKey] || 0));
    
    const topGainers = validCoins.slice(0, limit).map((coin: any) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      currentPrice: coin.current_price,
      priceChange: coin[priceChangeKey],
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      rank: coin.market_cap_rank,
    }));

    const topLosers = validCoins.slice(-limit).reverse().map((coin: any) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      currentPrice: coin.current_price,
      priceChange: coin[priceChangeKey],
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      rank: coin.market_cap_rank,
    }));

    logger?.info('✅ [MarketAnalysisTool] Top movers analysis completed', { 
      gainersCount: topGainers.length, 
      losersCount: topLosers.length 
    });

    return {
      timeframe,
      topGainers,
      topLosers,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger?.error('❌ [MarketAnalysisTool] Error analyzing top movers', { error: errorMessage });
    throw error;
  }
};

const generateMarketInsights = async ({ logger }: { logger?: IMastraLogger }) => {
  try {
    logger?.info('🔧 [MarketAnalysisTool] Starting market insights generation');
    
    const [marketOverview, trending, movers] = await Promise.all([
      fetchMarketOverview({ logger }),
      analyzeTrendingCoins({ limit: 5, logger }),
      analyzeTopMovers({ timeframe: '24h', limit: 3, logger }),
    ]);

    // Generate insights based on the data
    const insights = [];

    // Market cap insights
    if (marketOverview.marketCapChange24h > 5) {
      insights.push({
        type: 'bullish',
        message: `Strong bullish momentum with ${marketOverview.marketCapChange24h.toFixed(2)}% market cap increase in 24h`,
        confidence: 'high',
      });
    } else if (marketOverview.marketCapChange24h < -5) {
      insights.push({
        type: 'bearish',
        message: `Market showing bearish pressure with ${marketOverview.marketCapChange24h.toFixed(2)}% market cap decline in 24h`,
        confidence: 'high',
      });
    }

    // Bitcoin dominance insights
    if (marketOverview.bitcoinDominance > 50) {
      insights.push({
        type: 'neutral',
        message: `Bitcoin dominance at ${marketOverview.bitcoinDominance.toFixed(1)}% suggests flight to quality`,
        confidence: 'medium',
      });
    } else if (marketOverview.bitcoinDominance < 40) {
      insights.push({
        type: 'altcoin',
        message: `Low Bitcoin dominance (${marketOverview.bitcoinDominance.toFixed(1)}%) indicates altcoin season potential`,
        confidence: 'medium',
      });
    }

    // Fear & Greed insights
    if (marketOverview.fearGreedIndex > 75) {
      insights.push({
        type: 'warning',
        message: `Extreme greed (${marketOverview.fearGreedIndex}) detected - potential correction risk`,
        confidence: 'medium',
      });
    } else if (marketOverview.fearGreedIndex < 25) {
      insights.push({
        type: 'opportunity',
        message: `Extreme fear (${marketOverview.fearGreedIndex}) might present buying opportunities`,
        confidence: 'medium',
      });
    }

    logger?.info('✅ [MarketAnalysisTool] Market insights generated', { insightsCount: insights.length });

    return {
      marketOverview,
      trending: trending.trendingCoins,
      topMovers: movers,
      insights,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger?.error('❌ [MarketAnalysisTool] Error generating market insights', { error: errorMessage });
    throw error;
  }
};

export const marketAnalysisTool = createTool({
  id: "market-analysis-tool",
  description: `Perform comprehensive cryptocurrency market analysis including market overview, trending coins, top gainers/losers, and generate trading insights. Perfect for understanding current market conditions and identifying opportunities.`,
  inputSchema: z.object({
    analysisType: z.enum(["overview", "trending", "movers", "insights"]).describe("Type of market analysis to perform"),
    timeframe: z.enum(["1h", "24h", "7d", "14d", "30d"]).optional().default("24h").describe("Timeframe for price change analysis (for movers)"),
    limit: z.number().optional().default(5).describe("Number of results to return (1-20)").refine(val => val >= 1 && val <= 20),
  }),
  outputSchema: z.union([
    // Market Overview
    z.object({
      totalMarketCap: z.number(),
      totalVolume24h: z.number(),
      marketCapChange24h: z.number(),
      bitcoinDominance: z.number(),
      ethereumDominance: z.number(),
      activeCryptocurrencies: z.number(),
      totalExchanges: z.number(),
      fearGreedIndex: z.number(),
      lastUpdated: z.string(),
    }),
    // Trending Coins
    z.object({
      trendingCoins: z.array(z.object({
        id: z.string(),
        name: z.string(),
        symbol: z.string(),
        rank: z.number().nullable(),
        smallLogo: z.string(),
        priceChange24h: z.number().nullable(),
        sparkline: z.string().nullable(),
        marketCap: z.string().nullable(),
        totalVolume: z.string().nullable(),
      })),
    }),
    // Top Movers
    z.object({
      timeframe: z.string(),
      topGainers: z.array(z.object({
        id: z.string(),
        name: z.string(),
        symbol: z.string(),
        currentPrice: z.number(),
        priceChange: z.number(),
        marketCap: z.number(),
        volume24h: z.number(),
        rank: z.number(),
      })),
      topLosers: z.array(z.object({
        id: z.string(),
        name: z.string(),
        symbol: z.string(),
        currentPrice: z.number(),
        priceChange: z.number(),
        marketCap: z.number(),
        volume24h: z.number(),
        rank: z.number(),
      })),
    }),
    // Comprehensive Insights
    z.object({
      marketOverview: z.object({
        totalMarketCap: z.number(),
        totalVolume24h: z.number(),
        marketCapChange24h: z.number(),
        bitcoinDominance: z.number(),
        ethereumDominance: z.number(),
        activeCryptocurrencies: z.number(),
        totalExchanges: z.number(),
        fearGreedIndex: z.number(),
        lastUpdated: z.string(),
      }),
      trending: z.array(z.object({
        id: z.string(),
        name: z.string(),
        symbol: z.string(),
        rank: z.number().nullable(),
        smallLogo: z.string(),
        priceChange24h: z.number().nullable(),
        sparkline: z.string().nullable(),
        marketCap: z.string().nullable(),
        totalVolume: z.string().nullable(),
      })),
      topMovers: z.object({
        timeframe: z.string(),
        topGainers: z.array(z.object({
          id: z.string(),
          name: z.string(),
          symbol: z.string(),
          currentPrice: z.number(),
          priceChange: z.number(),
          marketCap: z.number(),
          volume24h: z.number(),
          rank: z.number(),
        })),
        topLosers: z.array(z.object({
          id: z.string(),
          name: z.string(),
          symbol: z.string(),
          currentPrice: z.number(),
          priceChange: z.number(),
          marketCap: z.number(),
          volume24h: z.number(),
          rank: z.number(),
        })),
      }),
      insights: z.array(z.object({
        type: z.string(),
        message: z.string(),
        confidence: z.string(),
      })),
      generatedAt: z.string(),
    }),
  ]),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { analysisType, timeframe = '24h', limit = 5 } = context;

    logger?.info('🔧 [MarketAnalysisTool] Starting execution', context);

    switch (analysisType) {
      case "overview":
        return await fetchMarketOverview({ logger });
      
      case "trending":
        return await analyzeTrendingCoins({ limit, logger });
      
      case "movers":
        return await analyzeTopMovers({ timeframe, limit, logger });
      
      case "insights":
        return await generateMarketInsights({ logger });
      
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }
  },
});