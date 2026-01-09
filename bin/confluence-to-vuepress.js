#!/usr/bin/env node

/**
 * Confluence to VuePress CLI
 */

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { ConfluenceToVuePress } = require('../src/migrator');

// Load environment variables from .env if present
try {
  require('dotenv').config();
} catch {
  // dotenv is optional
}

// Try to load config from file
function loadConfig(configPath) {
  const possiblePaths = configPath
    ? [configPath]
    : [
        '.confluencerc',
        '.confluencerc.json',
        'confluence.config.json',
        'confluence.config.js'
      ];

  for (const p of possiblePaths) {
    const fullPath = path.resolve(process.cwd(), p);
    if (fs.existsSync(fullPath)) {
      if (p.endsWith('.js')) {
        return require(fullPath);
      }
      return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    }
  }

  return {};
}

// Package info
const pkg = require('../package.json');

program
  .name('confluence-to-vuepress')
  .description('Migrate Confluence pages to VuePress static site')
  .version(pkg.version);

program
  .command('migrate')
  .description('Run the migration from Confluence to VuePress')
  .option('-u, --url <url>', 'Confluence base URL (e.g., https://yoursite.atlassian.net)')
  .option('-p, --page-id <id>', 'Root page ID to migrate')
  .option('-s, --space <key>', 'Confluence space key')
  .option('-o, --output <dir>', 'Output directory (default: ./docs)')
  .option('-e, --email <email>', 'Confluence account email')
  .option('-t, --token <token>', 'Confluence API token')
  .option('--title <title>', 'Site title (default: Documentation)')
  .option('--description <desc>', 'Site description (default: Migrated from Confluence)')
  .option('--no-external-images', 'Skip downloading external images')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const fileConfig = loadConfig(options.config);

      const config = {
        confluenceUrl: options.url || fileConfig.confluenceUrl || process.env.CONFLUENCE_URL,
        rootPageId: options.pageId || fileConfig.rootPageId || process.env.CONFLUENCE_ROOT_PAGE_ID,
        spaceKey: options.space || fileConfig.spaceKey || process.env.CONFLUENCE_SPACE_KEY,
        outputDir: options.output || fileConfig.outputDir || process.env.CONFLUENCE_OUTPUT_DIR || './docs',
        email: options.email || fileConfig.email || process.env.CONFLUENCE_EMAIL,
        apiToken: options.token || fileConfig.apiToken || process.env.CONFLUENCE_API_TOKEN,
        siteTitle: options.title || fileConfig.siteTitle || 'Documentation',
        siteDescription: options.description || fileConfig.siteDescription || 'Migrated from Confluence',
        downloadExternalImages: options.externalImages !== false,
      };

      const migrator = new ConfluenceToVuePress(config);
      const result = await migrator.migrate();

      console.log(`\n📊 Summary:`);
      console.log(`   Pages migrated: ${result.pagesProcessed}`);
      console.log(`   Output: ${result.outputDir}`);
      console.log(`\n💡 Next steps:`);
      console.log(`   cd ${result.outputDir}`);
      console.log(`   npm install`);
      console.log(`   npm run dev`);
    } catch (error) {
      console.error(`\n❌ Migration failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test connection to Confluence')
  .option('-u, --url <url>', 'Confluence base URL')
  .option('-p, --page-id <id>', 'Page ID to test')
  .option('-e, --email <email>', 'Confluence account email')
  .option('-t, --token <token>', 'Confluence API token')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const fileConfig = loadConfig(options.config);

      const config = {
        confluenceUrl: options.url || fileConfig.confluenceUrl || process.env.CONFLUENCE_URL,
        rootPageId: options.pageId || fileConfig.rootPageId || process.env.CONFLUENCE_ROOT_PAGE_ID,
        email: options.email || fileConfig.email || process.env.CONFLUENCE_EMAIL,
        apiToken: options.token || fileConfig.apiToken || process.env.CONFLUENCE_API_TOKEN,
      };

      console.log('🔗 Testing connection to Confluence...\n');

      const migrator = new ConfluenceToVuePress(config);
      const result = await migrator.testConnection();

      if (result.success) {
        console.log('✅ Connection successful!');
        console.log(`   Page title: ${result.pageTitle}`);
        if (result.spaceKey) {
          console.log(`   Space key: ${result.spaceKey}`);
        }
      } else {
        console.error(`❌ Connection failed: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Create a sample configuration file')
  .option('-f, --format <format>', 'Config format: json or env', 'json')
  .action((options) => {
    if (options.format === 'env') {
      const envContent = `# Confluence to VuePress Configuration
CONFLUENCE_URL=https://yoursite.atlassian.net
CONFLUENCE_ROOT_PAGE_ID=12345678
CONFLUENCE_SPACE_KEY=YOURSPACE
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token
`;
      fs.writeFileSync('.env.example', envContent);
      console.log('✅ Created .env.example');
      console.log('   Copy to .env and fill in your values');
    } else {
      const jsonConfig = {
        confluenceUrl: 'https://yoursite.atlassian.net',
        rootPageId: '12345678',
        spaceKey: 'YOURSPACE',
        email: '',
        apiToken: '',
        outputDir: './docs',
        siteTitle: 'My Documentation',
        siteDescription: 'Migrated from Confluence'
      };
      fs.writeFileSync('.confluencerc.json', JSON.stringify(jsonConfig, null, 2));
      console.log('✅ Created .confluencerc.json');
      console.log('   Fill in your Confluence credentials and settings');
    }
  });

program.parse();
