/**
 * Slack AI Assistant v2 - Main Entry Point
 * 
 * This is the entry point for the advanced Slack AI Assistant with:
 * - RAG (Retrieval Augmented Generation) for semantic search
 * - mem0 Long-Term Memory for personalization
 * - MCP (Model Context Protocol) for GitHub, Notion integration
 * - Background message indexing
 * - Tool-using AI agent
 * 
 * STARTUP SEQUENCE:
 * -----------------
 * 1. Load configuration from environment
 * 2. Initialize database (SQLite for sessions)
 * 3. Initialize vector store (ChromaDB for RAG)
 * 4. Initialize memory system (mem0)
 * 5. Initialize MCP servers (GitHub, Notion)
 * 6. Start background indexer (if RAG enabled)
 * 7. Start Slack bot
 * 8. Handle graceful shutdown
 */

import { config } from './config/index.js';
import { createModuleLogger } from './utils/logger.js';
import { initializeDatabase, closeDatabase } from './memory/database.js';
import { startSlackApp, stopSlackApp } from './channels/slack.js';
import { taskScheduler } from './tools/scheduler.js';

// RAG imports
import { initializeVectorStore, startIndexer, stopIndexer, getDocumentCount } from './rag/index.js';

// Memory imports (mem0)
import { initializeMemory, isMemoryEnabled } from './memory-ai/index.js';

// MCP imports
import { initializeMCP, shutdownMCP, isMCPEnabled, getConnectedServers } from './mcp/index.js';

const logger = createModuleLogger('main');

/**
 * Initialize all services and start the application.
 */
async function main(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('Starting Slack AI Assistant v2');
  logger.info('='.repeat(50));

  try {
    // 1. Initialize SQLite database for sessions/messages
    logger.info('Initializing database...');
    initializeDatabase();
    logger.info('✅ Database initialized');

    // 2. Initialize RAG system if enabled
    if (config.rag.enabled) {
      logger.info('Initializing RAG system...');
      
      // Initialize vector store
      await initializeVectorStore();
      const docCount = await getDocumentCount();
      logger.info(`✅ Vector store initialized (${docCount} documents)`);
      
      // Start background indexer
      startIndexer();
      logger.info('✅ Background indexer started');
    } else {
      logger.info('⏭️  RAG system disabled');
    }

    // 3. Initialize memory system (mem0)
    if (config.memory.enabled) {
      logger.info('Initializing memory system (mem0)...');
      await initializeMemory();
      if (isMemoryEnabled()) {
        logger.info('✅ Memory system initialized');
      } else {
        logger.warn('⚠️  Memory system failed to initialize (will continue without memory)');
      }
    } else {
      logger.info('⏭️  Memory system disabled');
    }

    // 4. Initialize MCP servers (GitHub, Notion)
    logger.info('Initializing MCP servers...');
    await initializeMCP();
    if (isMCPEnabled()) {
      const servers = getConnectedServers();
      logger.info(`✅ MCP initialized: ${servers.join(', ')}`);
    } else {
      logger.info('⏭️  No MCP servers connected (set GITHUB_PERSONAL_ACCESS_TOKEN or NOTION_API_TOKEN)');
    }

    // 5. Start task scheduler
    logger.info('Starting task scheduler...');
    taskScheduler.start();
    logger.info('✅ Task scheduler started');

    // 6. Start Slack app (if configured)
    if (config.slack.botToken && config.slack.appToken) {
      logger.info('Starting Slack app...');
      await startSlackApp();
      logger.info('✅ Slack app started');
    } else {
      logger.info('⏭️  Slack app disabled (no tokens configured)');
    }

    // 7. Start Web server (if enabled)
    if (config.web.enabled) {
      logger.info('Starting web server...');
      const { startWebServer } = await import('./channels/web/server.js');
      await startWebServer();
      logger.info('✅ Web server started');
    } else {
      logger.info('⏭️  Web server disabled');
    }

    // Ready!
    logger.info('='.repeat(50));
    logger.info('🚀 Slack AI Assistant v2 is running!');
    logger.info('='.repeat(50));
    logger.info('Features enabled:');
    logger.info(`  • RAG (Semantic Search): ${config.rag.enabled ? '✅' : '❌'}`);
    logger.info(`  • Long-Term Memory: ${config.memory.enabled && isMemoryEnabled() ? '✅' : '❌'}`);
    logger.info(`  • MCP (GitHub/Notion): ${isMCPEnabled() ? '✅ ' + getConnectedServers().join(', ') : '❌'}`);
    logger.info(`  • Task Scheduler: ✅`);
    logger.info(`  • Slack Integration: ${config.slack.botToken && config.slack.appToken ? '✅' : '❌'}`);
    logger.info(`  • Web Interface: ${config.web.enabled ? `✅ (http://localhost:${config.web.port})` : '❌'}`);
    logger.info(`  • AI Model: ${config.ai.defaultModel}`);
    logger.info('='.repeat(50));
    logger.info('Press Ctrl+C to stop');

  } catch (error: any) {
    logger.error('Failed to start application', { error: error.message });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler.
 * Ensures all services are properly stopped.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`\n${signal} received, shutting down gracefully...`);

  try {
    // Stop Web server
    if (config.web.enabled) {
      logger.info('Stopping web server...');
      const { stopWebServer } = await import('./channels/web/server.js');
      await stopWebServer();
    }

    // Stop Slack app
    if (config.slack.botToken && config.slack.appToken) {
      logger.info('Stopping Slack app...');
      await stopSlackApp();
    }

    // Stop MCP servers
    logger.info('Stopping MCP servers...');
    await shutdownMCP();

    // Stop indexer
    if (config.rag.enabled) {
      logger.info('Stopping indexer...');
      stopIndexer();
    }

    // Stop scheduler
    logger.info('Stopping scheduler...');
    taskScheduler.stop();

    // Close database
    logger.info('Closing database...');
    closeDatabase();

    logger.info('✅ Shutdown complete');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

// Start the application
main();
