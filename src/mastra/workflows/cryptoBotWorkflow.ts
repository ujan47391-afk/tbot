import { createWorkflow, createStep } from "../inngest";
import { cryptoTradingAgent } from "../agents/cryptoTradingAgent";
import { z } from "zod";

// Step 1: Use the crypto trading agent to generate a response
const useAgentStep = createStep({
  id: "use-crypto-agent",
  description: "Process user message through the crypto trading agent",
  inputSchema: z.object({
    message: z.string().describe("The user's message content"),
    threadId: z.string().describe("Unique thread identifier for conversation continuity"),
    chatId: z.number().describe("Telegram chat ID"),
  }),
  outputSchema: z.object({
    response: z.string().describe("The agent's response text"),
    threadId: z.string().describe("Thread identifier passed through"),
    chatId: z.number().describe("Chat ID passed through"),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { message, threadId, chatId } = inputData;

    logger?.info('🔧 [CryptoBotWorkflow] Starting agent execution', { 
      messageLength: message.length,
      threadId,
      chatId 
    });

    try {
      // Use the crypto trading agent to generate a response
      const { text } = await cryptoTradingAgent.generate([
        { role: "user", content: message }
      ], {
        resourceId: "crypto-bot",
        threadId: threadId,
        maxSteps: 5, // Allow multiple tool calls if needed
      });

      logger?.info('✅ [CryptoBotWorkflow] Agent response generated successfully', { 
        responseLength: text.length,
        threadId,
        chatId 
      });

      return {
        response: text,
        threadId,
        chatId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger?.error('❌ [CryptoBotWorkflow] Error generating agent response', { 
        error: errorMessage,
        threadId,
        chatId 
      });
      
      return {
        response: "❌ Sorry, I encountered an error while processing your request. Please try again in a moment.",
        threadId,
        chatId,
      };
    }
  }
});

// Step 2: Send the response back to Telegram
const sendTelegramResponseStep = createStep({
  id: "send-telegram-response", 
  description: "Send the agent's response back to Telegram",
  inputSchema: z.object({
    response: z.string().describe("The response text to send"),
    threadId: z.string().describe("Thread identifier"),
    chatId: z.number().describe("Telegram chat ID"),
  }),
  outputSchema: z.object({
    sent: z.boolean().describe("Whether the message was sent successfully"),
    messageId: z.number().optional().describe("Telegram message ID if sent successfully"),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { response, chatId, threadId } = inputData;

    logger?.info('🔧 [CryptoBotWorkflow] Starting Telegram message send', { 
      chatId, 
      threadId, 
      responseLength: response.length 
    });

    try {
      // Send message via Telegram Bot API
      const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: response,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });

      if (!telegramResponse.ok) {
        const errorData = await telegramResponse.text();
        throw new Error(`Telegram API error: ${telegramResponse.status} - ${errorData}`);
      }

      const telegramData = await telegramResponse.json();
      
      logger?.info('✅ [CryptoBotWorkflow] Message sent to Telegram successfully', { 
        messageId: telegramData.result?.message_id,
        chatId,
        threadId 
      });

      return {
        sent: true,
        messageId: telegramData.result?.message_id,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger?.error('❌ [CryptoBotWorkflow] Error sending Telegram message', { 
        error: errorMessage,
        chatId,
        threadId 
      });

      // Try to send a simple error message as fallback
      try {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: "⚠️ Sorry, I'm experiencing technical difficulties. Please try again later.",
          }),
        });
      } catch (fallbackError) {
        logger?.error('❌ [CryptoBotWorkflow] Fallback error message also failed', { 
          fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown error' 
        });
      }

      return {
        sent: false,
      };
    }
  }
});

export const cryptoBotWorkflow = createWorkflow({
  id: "crypto-bot-workflow",
  description: "Professional crypto trading Telegram bot workflow",
  inputSchema: z.object({
    message: z.string().describe("User message from Telegram"),
    threadId: z.string().describe("Unique conversation thread ID"),
    chatId: z.number().describe("Telegram chat ID"),
  }),
  outputSchema: z.object({
    sent: z.boolean().describe("Whether the message was sent successfully"),
    messageId: z.number().optional().describe("Telegram message ID if sent"),
  }),
})
  .then(useAgentStep)
  .then(sendTelegramResponseStep)
  .commit();