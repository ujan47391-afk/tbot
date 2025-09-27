import { createTool } from "@mastra/core/tools";
import type { IMastraLogger } from "@mastra/core/logger";
import { z } from "zod";

const fetchCryptoPrice = async ({
  symbol,
  vsCurrency,
  logger,
}: {
  symbol: string;
  vsCurrency: string;
  logger?: IMastraLogger;
}) => {
  try {
    logger?.info('🔧 [CryptoPriceTool] Starting price fetch', { symbol, vsCurrency });
    
    // Using CoinGecko API - free tier, no API key required
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=${vsCurrency}&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    logger?.info('📝 [CryptoPriceTool] Raw API response', data);

    if (!data[symbol]) {
      throw new Error(`Cryptocurrency "${symbol}" not found`);
    }

    const coinData = data[symbol];
    const result = {
      symbol: symbol.toUpperCase(),
      price: coinData[vsCurrency],
      marketCap: coinData[`${vsCurrency}_market_cap`],
      volume24h: coinData[`${vsCurrency}_24h_vol`],
      change24h: coinData[`${vsCurrency}_24h_change`],
      lastUpdated: new Date(coinData.last_updated_at * 1000).toISOString(),
      currency: vsCurrency.toUpperCase(),
    };

    logger?.info('✅ [CryptoPriceTool] Successfully fetched price data', result);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger?.error('❌ [CryptoPriceTool] Error fetching crypto price', { error: errorMessage });
    throw error;
  }
};

const fetchMultipleCryptoPrices = async ({
  symbols,
  vsCurrency,
  logger,
}: {
  symbols: string[];
  vsCurrency: string;
  logger?: IMastraLogger;
}) => {
  try {
    logger?.info('🔧 [CryptoPriceTool] Starting multiple price fetch', { symbols, vsCurrency });
    
    const symbolsStr = symbols.join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${symbolsStr}&vs_currencies=${vsCurrency}&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    logger?.info('📝 [CryptoPriceTool] Multiple prices fetched', data);

    const results = symbols.map(symbol => {
      if (!data[symbol]) {
        return {
          symbol: symbol.toUpperCase(),
          error: `Cryptocurrency "${symbol}" not found`,
        };
      }

      const coinData = data[symbol];
      return {
        symbol: symbol.toUpperCase(),
        price: coinData[vsCurrency],
        marketCap: coinData[`${vsCurrency}_market_cap`],
        volume24h: coinData[`${vsCurrency}_24h_vol`],
        change24h: coinData[`${vsCurrency}_24h_change`],
        lastUpdated: new Date(coinData.last_updated_at * 1000).toISOString(),
        currency: vsCurrency.toUpperCase(),
      };
    });

    logger?.info('✅ [CryptoPriceTool] Successfully fetched multiple prices', { count: results.length });
    return { cryptos: results };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger?.error('❌ [CryptoPriceTool] Error fetching multiple crypto prices', { error: errorMessage });
    throw error;
  }
};

export const cryptoPriceTool = createTool({
  id: "crypto-price-tool",
  description: `Get real-time cryptocurrency prices, market cap, volume, and 24h changes. Use this for current market data and price checks. Supports both single and multiple cryptocurrencies.`,
  inputSchema: z.object({
    action: z.enum(["single", "multiple"]).describe("Whether to fetch a single crypto or multiple cryptos"),
    symbol: z.string().optional().describe("Single cryptocurrency symbol/ID (e.g., 'bitcoin', 'ethereum'). Required for single action."),
    symbols: z.array(z.string()).optional().describe("Array of cryptocurrency symbols/IDs. Required for multiple action."),
    vsCurrency: z.string().default("usd").describe("Currency to show prices in (usd, eur, btc, etc.)"),
  }),
  outputSchema: z.union([
    z.object({
      symbol: z.string(),
      price: z.number(),
      marketCap: z.number(),
      volume24h: z.number(),
      change24h: z.number(),
      lastUpdated: z.string(),
      currency: z.string(),
    }),
    z.object({
      cryptos: z.array(z.union([
        z.object({
          symbol: z.string(),
          price: z.number(),
          marketCap: z.number(),
          volume24h: z.number(),
          change24h: z.number(),
          lastUpdated: z.string(),
          currency: z.string(),
        }),
        z.object({
          symbol: z.string(),
          error: z.string(),
        })
      ]))
    })
  ]),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { action, symbol, symbols, vsCurrency } = context;

    logger?.info('🔧 [CryptoPriceTool] Starting execution', context);

    if (action === "single") {
      if (!symbol) {
        throw new Error("Symbol is required for single crypto price fetch");
      }
      return await fetchCryptoPrice({ symbol: symbol.toLowerCase(), vsCurrency, logger });
    } else {
      if (!symbols || symbols.length === 0) {
        throw new Error("Symbols array is required for multiple crypto price fetch");
      }
      return await fetchMultipleCryptoPrices({ 
        symbols: symbols.map(s => s.toLowerCase()), 
        vsCurrency, 
        logger 
      });
    }
  },
});