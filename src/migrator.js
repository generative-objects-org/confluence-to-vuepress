/**
 * Confluence to VuePress Migrator
 * Core migration logic
 */

const axios = require('axios');
const TurndownService = require('turndown');
const fs = require('fs').promises;
const path = require('path');

// Initialize Turndown for HTML to Markdown conversion
function createTurndownService() {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  });

  // Custom rules for better conversion
  turndownService.addRule('confluenceCodeBlock', {
    filter: function (node) {
      return node.nodeName === 'PRE' || (node.nodeName === 'DIV' && node.classList.contains('code'));
    },
    replacement: function (content, node) {
      const language = node.getAttribute('data-language') || '';
      return '\n```' + language + '\n' + content + '\n```\n';
    }
  });

  return turndownService;
}

// Pre-process Confluence HTML to convert special elements before Turndown
function preprocessConfluenceHtml(html, pageSlug) {
  // Convert <ac:image> with <ri:attachment> to standard <img> tags
  // Use a pattern that doesn't cross </ac:image> boundaries
  html = html.replace(
    /<ac:image[^>]*>(?:(?!<\/ac:image>).)*?<ri:attachment\s+ri:filename="([^"]+)"[^>]*\/?>(?:(?!<\/ac:image>).)*?<\/ac:image>/gi,
    (match, filename) => {
      const safeFilename = sanitizeFilename(filename);
      const imgPath = `./attachments/${pageSlug}/${safeFilename}`;
      return `<img src="${imgPath}" alt="${safeFilename}" />`;
    }
  );

  // Handle <ac:image> with <ri:url> for external images
  html = html.replace(
    /<ac:image[\s\S]*?<ri:url[\s\S]*?ri:value="([^"]+)"[\s\S]*?<\/ac:image>/gi,
    (match, url) => {
      return `<img src="${url}" alt="external-image" />`;
    }
  );

  // Remove other Confluence macros that don't convert well
  html = html.replace(/<ac:structured-macro[^>]*>[\s\S]*?<\/ac:structured-macro>/gi, '');
  html = html.replace(/<ac:parameter[^>]*>[\s\S]*?<\/ac:parameter>/gi, '');

  // Convert <ac:link> to standard links where possible
  html = html.replace(
    /<ac:link[^>]*>[\s\S]*?<ri:page\s+ri:content-title="([^"]+)"[^>]*\/>[\s\S]*?<ac:plain-text-link-body><!\[CDATA\[([^\]]+)\]\]><\/ac:plain-text-link-body>[\s\S]*?<\/ac:link>/gi,
    (match, pageTitle, linkText) => {
      const slug = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return `<a href="../${slug}/">${linkText}</a>`;
    }
  );

  return html;
}

// Utility: slugify page title for filename
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Utility: sanitize filename for Windows/cross-platform compatibility
function sanitizeFilename(filename) {
  // Replace characters invalid on Windows: < > : " / \ | ? *
  // Also replace spaces with underscores for better URL compatibility
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_');
}

// Utility: create safe directory path
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

// Helper to escape special regex characters in filenames
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Main Migrator Class
 */
class ConfluenceToVuePress {
  constructor(options = {}) {
    this.config = {
      confluenceUrl: options.confluenceUrl || process.env.CONFLUENCE_URL,
      spaceKey: options.spaceKey || process.env.CONFLUENCE_SPACE_KEY,
      rootPageId: options.rootPageId || process.env.CONFLUENCE_ROOT_PAGE_ID,
      outputDir: options.outputDir || './docs',
      email: options.email || process.env.CONFLUENCE_EMAIL,
      apiToken: options.apiToken || process.env.CONFLUENCE_API_TOKEN,
      siteTitle: options.siteTitle || 'Documentation',
      siteDescription: options.siteDescription || 'Migrated from Confluence',
      downloadExternalImages: options.downloadExternalImages !== false,
    };

    this.turndownService = createTurndownService();
    this.pageMap = new Map();

    // API client
    this.api = axios.create({
      baseURL: `${this.config.confluenceUrl}/wiki/rest/api`,
      auth: {
        username: this.config.email,
        password: this.config.apiToken
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const required = ['confluenceUrl', 'rootPageId', 'email', 'apiToken'];
    const missing = required.filter(key => !this.config[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
  }

  /**
   * Test connection to Confluence
   */
  async testConnection() {
    try {
      const response = await this.api.get(`/content/${this.config.rootPageId}`, {
        params: { expand: 'version' }
      });
      return {
        success: true,
        pageTitle: response.data.title,
        spaceKey: response.data.space?.key
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.status === 401
          ? 'Authentication failed. Check your email and API token.'
          : error.message
      };
    }
  }

  /**
   * Fetch page content and metadata
   */
  async fetchPage(pageId) {
    const response = await this.api.get(`/content/${pageId}`, {
      params: {
        expand: 'body.storage,version,metadata.labels,children.page'
      }
    });
    return response.data;
  }

  /**
   * Fetch child pages in correct order
   */
  async fetchChildPages(pageId) {
    try {
      const response = await this.api.get(`/content/${pageId}/child/page`, {
        params: {
          limit: 100,
          expand: 'extensions.position'
        }
      });
      // Sort by position to maintain Confluence page order
      const pages = response.data.results;
      pages.sort((a, b) => {
        const posA = a.extensions?.position ?? 999999;
        const posB = b.extensions?.position ?? 999999;
        return posA - posB;
      });
      return pages;
    } catch (error) {
      console.error(`Error fetching children of ${pageId}:`, error.message);
      return [];
    }
  }

  /**
   * Download attachments for a page
   */
  async downloadAttachments(pageId, pageSlug, outputDir) {
    try {
      const response = await this.api.get(`/content/${pageId}/child/attachment`, {
        params: { limit: 100, expand: 'version' }
      });

      const attachments = response.data.results;
      if (attachments.length === 0) return [];

      const attachmentDir = path.join(outputDir, 'attachments', pageSlug);
      await ensureDir(attachmentDir);

      const downloadedFiles = [];
      for (const attachment of attachments) {
        const originalFilename = attachment.title;
        const safeFilename = sanitizeFilename(originalFilename);
        const filepath = path.join(attachmentDir, safeFilename);

        try {
          const downloadUrl = `${this.config.confluenceUrl}/wiki${attachment._links.download}`;
          const fileResponse = await axios.get(downloadUrl, {
            auth: { username: this.config.email, password: this.config.apiToken },
            responseType: 'arraybuffer',
            maxRedirects: 5
          });

          await fs.writeFile(filepath, fileResponse.data);
          downloadedFiles.push({
            original: originalFilename,
            sanitized: safeFilename,
            path: `./attachments/${pageSlug}/${safeFilename}`
          });
          console.log(`  ✓ Downloaded: ${safeFilename}`);
        } catch (error) {
          console.error(`  ✗ Failed to download ${originalFilename}: ${error.response?.status || error.message}`);
        }
      }

      return downloadedFiles;
    } catch (error) {
      console.error(`Error downloading attachments for page ${pageId}:`, error.message);
      return [];
    }
  }

  /**
   * Copy missing attachments from parent pages
   */
  async copyMissingAttachments(markdown, attachmentDir, pageSlug, parentPath, indent = '') {
    const imagePattern = /!\[[^\]]*\]\(\.\/attachments\/[^/]+\/([^)]+)\)/gi;
    const matches = [...markdown.matchAll(imagePattern)];

    if (matches.length === 0) return;

    await ensureDir(attachmentDir);

    for (const match of matches) {
      const filename = match[1];
      const localPath = path.join(attachmentDir, filename);

      try {
        await fs.access(localPath);
        continue; // File exists
      } catch {
        // File doesn't exist, search parents
      }

      let searchPath = parentPath;
      let found = false;

      while (searchPath && !found) {
        const parentSlug = path.basename(searchPath);
        const parentAttachmentDir = path.join(this.config.outputDir, searchPath, 'attachments', parentSlug);
        const parentFilePath = path.join(parentAttachmentDir, filename);

        try {
          await fs.access(parentFilePath);
          await fs.copyFile(parentFilePath, localPath);
          console.log(`${indent}  ✓ Copied from parent: ${filename}`);
          found = true;
        } catch {
          searchPath = path.dirname(searchPath);
          if (searchPath === '.' || searchPath === '') {
            searchPath = null;
          }
        }
      }

      if (!found) {
        console.log(`${indent}  ⚠ Missing attachment: ${filename}`);
      }
    }
  }

  /**
   * Download external images
   */
  async downloadExternalImages(markdown, attachmentDir, pageSlug, indent = '') {
    if (!this.config.downloadExternalImages) return markdown;

    const imagePattern = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi;
    const matches = [...markdown.matchAll(imagePattern)];

    if (matches.length === 0) return markdown;

    console.log(`${indent}  Found ${matches.length} external image(s) to download...`);
    await ensureDir(attachmentDir);

    for (const match of matches) {
      const [fullMatch, altText, imageUrl] = match;

      try {
        const urlPath = new URL(imageUrl).pathname;
        let filename = path.basename(urlPath);

        if (!filename.match(/\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i)) {
          filename += '.png';
        }
        filename = filename.replace(/[<>:"/\\|?*]/g, '_');

        const filepath = path.join(attachmentDir, filename);
        const localPath = `./attachments/${pageSlug}/${filename}`;

        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        await fs.writeFile(filepath, response.data);
        console.log(`${indent}  ✓ Downloaded external image: ${filename}`);
        markdown = markdown.replace(fullMatch, `![${altText}](${localPath})`);
      } catch (error) {
        console.error(`${indent}  ✗ Failed to download: ${imageUrl.substring(0, 60)}...`);
      }
    }

    return markdown;
  }

  /**
   * Convert HTML to Markdown
   */
  convertToMarkdown(html, attachments = [], pageSlug = '') {
    html = preprocessConfluenceHtml(html, pageSlug);
    let markdown = this.turndownService.turndown(html);

    // Fix attachment links
    attachments.forEach(att => {
      const confluencePattern = new RegExp(`/wiki/download/.*?/${escapeRegex(att.original)}`, 'g');
      markdown = markdown.replace(confluencePattern, att.path);
    });

    // Escape angle brackets that look like Vue components
    markdown = markdown.replace(
      /<([A-Z][a-zA-Z]*(?:Reference|Type|Entity|Value|Field|Collection|Model|Rule|Filter|Event|Command|Parameter|Binding|Element|Container|Unit|IU|AIU|CUI)?)>/g,
      '`<$1>`'
    );

    // Escape HTML tags in text
    markdown = markdown.replace(
      /(?<!`)(<(?:div|span|form|input|button|select|textarea|label|table|tr|td|th|thead|tbody|ul|ol|li|dl|dt|dd|p|a|img|hr|br|header|footer|section|aside|nav|article|main|figure|figcaption|h[1-6])(?:\s[^>]*)?>)/gi,
      '`$1`'
    );

    markdown = markdown.replace(
      /(?<!`)(<\/(?:div|span|form|input|button|select|textarea|label|table|tr|td|th|thead|tbody|ul|ol|li|dl|dt|dd|p|a|img|hr|br|header|footer|section|aside|nav|article|main|figure|figcaption|h[1-6])>)/gi,
      '`$1`'
    );

    return markdown;
  }

  /**
   * Process a single page
   */
  async processPage(pageId, parentPath = '', level = 0) {
    const indent = '  '.repeat(level);
    console.log(`${indent}Processing: Page ID ${pageId}`);

    const page = await this.fetchPage(pageId);
    const pageTitle = page.title;
    const pageSlug = slugify(pageTitle);

    console.log(`${indent}  Title: ${pageTitle}`);

    const dirPath = path.join(this.config.outputDir, parentPath, pageSlug);
    await ensureDir(dirPath);

    console.log(`${indent}  Downloading attachments...`);
    const attachments = await this.downloadAttachments(pageId, pageSlug, dirPath);

    const htmlContent = page.body.storage.value;
    let markdownContent = this.convertToMarkdown(htmlContent, attachments, pageSlug);

    const attachmentDir = path.join(dirPath, 'attachments', pageSlug);
    markdownContent = await this.downloadExternalImages(markdownContent, attachmentDir, pageSlug, indent);
    await this.copyMissingAttachments(markdownContent, attachmentDir, pageSlug, parentPath, indent);

    // Add frontmatter
    const needsQuotes = /[:\[\]{}&*#?|\-<>=!%@`]/.test(pageTitle);
    const yamlTitle = needsQuotes ? `"${pageTitle.replace(/"/g, '\\"')}"` : pageTitle;

    const frontmatter = `---
title: ${yamlTitle}
---

# ${pageTitle}

`;
    markdownContent = frontmatter + markdownContent;

    const filepath = path.join(dirPath, 'README.md');
    await fs.writeFile(filepath, markdownContent, 'utf-8');
    console.log(`${indent}  ✓ Saved: ${filepath}`);

    let relativePath = path.join(parentPath, pageSlug).replace(/\\/g, '/');
    if (!relativePath.endsWith('/')) {
      relativePath += '/';
    }

    this.pageMap.set(pageId, {
      title: pageTitle,
      path: relativePath,
      slug: pageSlug,
      children: []
    });

    const childPages = await this.fetchChildPages(pageId);
    if (childPages.length > 0) {
      console.log(`${indent}  Found ${childPages.length} child pages`);
      for (const child of childPages) {
        await this.processPage(child.id, path.join(parentPath, pageSlug), level + 1);
        this.pageMap.get(pageId).children.push(child.id);
      }
    }
  }

  /**
   * Generate VuePress configuration
   */
  generateVuePressConfig() {
    const buildSidebar = (pageId) => {
      const page = this.pageMap.get(pageId);
      if (!page) return null;

      const result = {
        text: page.title,
        link: '/' + page.path,
      };

      if (page.children.length > 0) {
        result.children = page.children.map(childId => buildSidebar(childId)).filter(Boolean);
        result.collapsible = true;
      }

      return result;
    };

    const sidebar = buildSidebar(this.config.rootPageId);
    const sidebarJson = JSON.stringify([sidebar], null, 2);
    const sidebarJs = sidebarJson
      .replace(/"text":/g, 'text:')
      .replace(/"link":/g, 'link:')
      .replace(/"children":/g, 'children:')
      .replace(/"collapsible":/g, 'collapsible:');

    return `import { defaultTheme } from '@vuepress/theme-default'
import { viteBundler } from '@vuepress/bundler-vite'

export default {
  title: '${this.config.siteTitle}',
  description: '${this.config.siteDescription}',

  bundler: viteBundler(),

  theme: defaultTheme({
    sidebar: ${sidebarJs},

    nav: [
      { text: 'Home', link: '/' }
    ]
  })
}
`;
  }

  /**
   * Create homepage
   */
  async createHomepage() {
    const rootPage = this.pageMap.get(this.config.rootPageId);
    const homepage = `---
home: true
title: Home
heroText: ${this.config.siteTitle}
tagline: ${this.config.siteDescription}
actions:
  - text: Get Started
    link: /${rootPage?.path || ''}
    type: primary
---
`;
    await fs.writeFile(path.join(this.config.outputDir, 'README.md'), homepage, 'utf-8');
  }

  /**
   * Create VuePress package.json
   */
  async createPackageJson() {
    const packageJson = {
      name: 'docs',
      version: '1.0.0',
      scripts: {
        dev: 'vuepress dev',
        build: 'vuepress build'
      },
      devDependencies: {
        'vuepress': '^2.0.0-rc.18',
        '@vuepress/bundler-vite': '^2.0.0-rc.18',
        '@vuepress/theme-default': '^2.0.0-rc.61',
        'sass-embedded': '^1.83.0'
      }
    };
    await fs.writeFile(
      path.join(this.config.outputDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
      'utf-8'
    );
  }

  /**
   * Run the migration
   */
  async migrate() {
    console.log('🚀 Starting Confluence to VuePress migration...\n');

    this.validateConfig();

    await ensureDir(this.config.outputDir);
    await ensureDir(path.join(this.config.outputDir, '.vuepress'));

    console.log('📄 Fetching and converting pages...\n');
    await this.processPage(this.config.rootPageId);

    console.log('\n⚙️  Generating VuePress configuration...');
    const vuepressConfig = this.generateVuePressConfig();
    const configPath = path.join(this.config.outputDir, '.vuepress', 'config.js');
    await fs.writeFile(configPath, vuepressConfig, 'utf-8');
    console.log(`✓ Saved: ${configPath}`);

    console.log('\n📝 Creating homepage...');
    await this.createHomepage();
    console.log(`✓ Saved: ${path.join(this.config.outputDir, 'README.md')}`);

    console.log('\n📦 Creating package.json...');
    await this.createPackageJson();
    console.log(`✓ Saved: ${path.join(this.config.outputDir, 'package.json')}`);

    console.log('\n✅ Migration completed successfully!');

    return {
      pagesProcessed: this.pageMap.size,
      outputDir: this.config.outputDir
    };
  }
}

module.exports = { ConfluenceToVuePress, slugify };
