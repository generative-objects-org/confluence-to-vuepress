/**
 * Confluence to VuePress Migrator
 * Core migration logic
 */

const axios = require('axios');
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');
const fs = require('fs').promises;
const path = require('path');

// Initialize Turndown for HTML to Markdown conversion
function createTurndownService() {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  });

  // Add GFM plugin for tables, strikethrough, etc.
  turndownService.use(turndownPluginGfm.gfm);

  // Custom rules for better conversion
  turndownService.addRule('confluenceCodeBlock', {
    filter: function (node) {
      return node.nodeName === 'PRE' || (node.nodeName === 'DIV' && node.classList.contains('code'));
    },
    replacement: function (content, node) {
      // Check for language in data-language attribute
      let language = node.getAttribute('data-language') || '';
      // Also check for language in code element's class (language-xxx)
      if (!language && node.nodeName === 'PRE') {
        const codeEl = node.querySelector('code');
        if (codeEl) {
          const classMatch = (codeEl.className || '').match(/language-(\w+)/);
          if (classMatch) {
            language = classMatch[1];
          }
        }
      }
      // Get the text content directly (it's already escaped HTML entities)
      const codeContent = node.textContent || content;
      return '\n```' + language + '\n' + codeContent + '\n```\n';
    }
  });

  return turndownService;
}

// Pre-process Confluence HTML to convert special elements before Turndown
function preprocessConfluenceHtml(html, pageSlug, attachments = []) {
  // Build fileId to path mapping for blob images
  const fileIdMap = {};
  attachments.forEach(att => {
    if (att.fileId) {
      fileIdMap[att.fileId] = att.path;
    }
  });

  // Convert blob images with data-fileid to local paths
  html = html.replace(
    /<img[^>]*data-fileid="([^"]+)"[^>]*>/gi,
    (match, fileId) => {
      const localPath = fileIdMap[fileId];
      if (localPath) {
        const altMatch = match.match(/alt="([^"]*)"/);
        const alt = altMatch ? altMatch[1] : 'image';
        return `<img src="${localPath}" alt="${alt}" />`;
      }
      return match;
    }
  );

  // Remove SVG elements (icons, decorations)
  html = html.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');

  // Remove heading anchor buttons and wrappers
  html = html.replace(/<span[^>]*class="[^"]*heading-anchor-wrapper[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
  html = html.replace(/<button[^>]*data-testid="anchor-button"[^>]*>[\s\S]*?<\/button>/gi, '');
  html = html.replace(/<span[^>]*data-testid="visually-hidden[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');

  // Convert Atlassian Editor panels to blockquotes
  // Extract content from ak-editor-panel and convert to blockquote with type prefix
  html = html.replace(
    /<div[^>]*class="[^"]*ak-editor-panel[^"]*"[^>]*data-panel-type="([^"]*)"[^>]*>[\s\S]*?<div[^>]*class="[^"]*ak-editor-panel__content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
    (match, panelType, content) => {
      const prefix = panelType ? `**${panelType.toUpperCase()}:** ` : '';
      return `<blockquote>${prefix}${content}</blockquote>`;
    }
  );

  // Remove panel icon divs that might remain
  html = html.replace(/<div[^>]*class="[^"]*ak-editor-panel__icon[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

  // Remove data-loadable wrapper spans (keep content)
  html = html.replace(/<span[^>]*data-loadable-vc-wrapper[^>]*>([\s\S]*?)<\/span>/gi, '$1');

  // Convert <ac:image> to standard <img> tags
  // Handle both ri:attachment (local files) and ri:url (external images)
  html = html.replace(/<ac:image[^>]*>([\s\S]*?)<\/ac:image>/gi, (match, inner) => {
    // Check for ri:attachment with filename
    const filenameMatch = inner.match(/ri:filename="([^"]+)"/);
    if (filenameMatch) {
      const filename = filenameMatch[1];
      const safeFilename = sanitizeFilename(filename);
      const imgPath = `./attachments/${pageSlug}/${safeFilename}`;
      return `<img src="${imgPath}" alt="${safeFilename}" />`;
    }
    // Check for ri:url with external link
    const urlMatch = inner.match(/ri:value="([^"]+)"/);
    if (urlMatch) {
      return `<img src="${urlMatch[1]}" alt="external-image" />`;
    }
    return match;
  });

  // Convert Confluence info/note/warning/tip panels to blockquotes
  // These are ac:structured-macro with ac:name="info|note|warning|tip"
  html = html.replace(
    /<ac:structured-macro[^>]*ac:name="(info|note|warning|tip)"[^>]*>[\s\S]*?<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    (match, panelType, content) => {
      const prefix = `**${panelType.toUpperCase()}:** `;
      return `<blockquote>${prefix}${content}</blockquote>`;
    }
  );

  // Convert Confluence code macros to HTML pre/code blocks
  // These are ac:structured-macro with ac:name="code" containing ac:plain-text-body with CDATA
  // Helper function to convert code content to pre/code HTML
  const convertCodeBlock = (codeContent, language = '') => {
    // Convert tabs to newlines to ensure proper code block formatting
    // (Confluence sometimes uses tabs as line separators in CDATA)
    let code = codeContent.replace(/\t/g, '\n');
    // Escape any HTML-like content in the code to prevent parsing issues
    const escapedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<pre><code class="language-${language}">${escapedCode}</code></pre>`;
  };

  // First handle code macros WITH language parameter
  html = html.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:parameter[^>]*ac:name="language"[^>]*>([^<]*)<\/ac:parameter>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    (match, language, codeContent) => convertCodeBlock(codeContent, language)
  );

  // Then handle code macros WITHOUT language parameter (or language comes after plain-text-body)
  html = html.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    (match, codeContent) => convertCodeBlock(codeContent)
  );

  // Remove self-closing Confluence macros (like TOC)
  html = html.replace(/<ac:structured-macro[^>]*\/>/gi, '');

  // Remove other Confluence macros with closing tags, BUT preserve any img tags inside them
  html = html.replace(/<ac:structured-macro[^>]*>[\s\S]*?<\/ac:structured-macro>/gi, (match) => {
    // Extract any img tags inside this macro to preserve them
    const imgTags = match.match(/<img[^>]*>/gi);
    if (imgTags && imgTags.length > 0) {
      return imgTags.join('\n');
    }
    return '';
  });

  html = html.replace(/<ac:parameter[^>]*>[\s\S]*?<\/ac:parameter>/gi, '');

  // Clean up table HTML for better markdown conversion
  // Remove colgroup/col elements that confuse Turndown
  html = html.replace(/<colgroup>[\s\S]*?<\/colgroup>/gi, '');
  // Remove data attributes from table elements
  html = html.replace(/<table[^>]*>/gi, '<table>');
  // Strip <p> tags from inside table cells (keep content)
  // Note: Match <p> or <p with space/attributes, NOT <pre> or <param> etc
  html = html.replace(/(<t[hd][^>]*>)\s*<p(?:\s[^>]*)?>([\s\S]*?)<\/p>\s*(<\/t[hd]>)/gi, '$1$2$3');
  // Handle cells with multiple <p> tags or lists - convert to breaks
  html = html.replace(/<\/p>\s*<p(?:\s[^>]*)?>/gi, '<br/>');
  // Clean remaining <p> tags in cells
  html = html.replace(/(<t[hd][^>]*>)\s*<p(?:\s[^>]*)?>/gi, '$1');
  html = html.replace(/<\/p>\s*(<\/t[hd]>)/gi, '$1');
  // Clean up attributes on th/td (but not thead/tbody)
  html = html.replace(/<(th|td)\s+[^>]*>/gi, '<$1>');
  // Move header row (containing <th>) from tbody to thead for proper markdown conversion
  html = html.replace(
    /<table>\s*<tbody>\s*(<tr>(?:\s*<th>[\s\S]*?<\/th>\s*)+<\/tr>)/gi,
    '<table><thead>$1</thead><tbody>'
  );

  // Convert <ac:link> to standard links - handle multiple formats
  // Format 1: <ac:link-body>text</ac:link-body>
  html = html.replace(
    /<ac:link[^>]*>[\s\S]*?<ri:page\s+ri:content-title="([^"]+)"[^>]*\/>[\s\S]*?<ac:link-body>([^<]*)<\/ac:link-body>[\s\S]*?<\/ac:link>/gi,
    (match, pageTitle, linkText) => {
      const slug = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return `<a href="CONFLUENCE_LINK:${slug}">${linkText || pageTitle}</a>`;
    }
  );

  // Format 2: <ac:plain-text-link-body><![CDATA[text]]></ac:plain-text-link-body>
  html = html.replace(
    /<ac:link[^>]*>[\s\S]*?<ri:page\s+ri:content-title="([^"]+)"[^>]*\/>[\s\S]*?<ac:plain-text-link-body><!\[CDATA\[([^\]]+)\]\]><\/ac:plain-text-link-body>[\s\S]*?<\/ac:link>/gi,
    (match, pageTitle, linkText) => {
      const slug = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return `<a href="CONFLUENCE_LINK:${slug}">${linkText || pageTitle}</a>`;
    }
  );

  // Format 3: Just ri:page without explicit link body - use page title as link text
  html = html.replace(
    /<ac:link[^>]*>[\s\S]*?<ri:page\s+ri:content-title="([^"]+)"[^>]*\/>[\s\S]*?<\/ac:link>/gi,
    (match, pageTitle) => {
      const slug = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return `<a href="CONFLUENCE_LINK:${slug}">${pageTitle}</a>`;
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
        params: { limit: 100, expand: 'version,extensions.fileId' }
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
            path: `./attachments/${pageSlug}/${safeFilename}`,
            fileId: attachment.extensions?.fileId || null
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
   * Copy missing attachments from parent or sibling pages
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
        // File doesn't exist, search elsewhere
      }

      let found = false;

      // Search parent hierarchy
      let searchPath = parentPath;
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
          // Also search sibling folders at this level
          try {
            const parentDir = path.join(this.config.outputDir, searchPath);
            const siblings = await fs.readdir(parentDir, { withFileTypes: true });
            for (const sibling of siblings) {
              if (sibling.isDirectory() && !found) {
                const siblingAttachmentDir = path.join(parentDir, sibling.name, 'attachments', sibling.name);
                const siblingFilePath = path.join(siblingAttachmentDir, filename);
                try {
                  await fs.access(siblingFilePath);
                  await fs.copyFile(siblingFilePath, localPath);
                  console.log(`${indent}  ✓ Copied from sibling: ${filename}`);
                  found = true;
                } catch {
                  // Not in this sibling
                }
              }
            }
          } catch {
            // Can't read parent directory
          }

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
    html = preprocessConfluenceHtml(html, pageSlug, attachments);

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

    // Escape HTML tags that appear as text references (not part of HTML structure)
    // First, protect fenced code blocks from escaping
    const codeBlockPlaceholders = [];
    markdown = markdown.replace(/```[\s\S]*?```/g, (match) => {
      codeBlockPlaceholders.push(match);
      return `__CODE_BLOCK_${codeBlockPlaceholders.length - 1}__`;
    });

    // Protect HTML tables from escaping (they should render as HTML in VuePress)
    const tablePlaceholders = [];
    markdown = markdown.replace(/<table[\s\S]*?<\/table>/gi, (match) => {
      tablePlaceholders.push(match);
      return `__TABLE_${tablePlaceholders.length - 1}__`;
    });

    // HTML tags to escape when they appear as text (excluding table-related tags which are protected)
    const htmlTagNames = 'div|span|form|input|button|select|textarea|label|ul|ol|li|p|br|img|dl|dt|dd|a|hr|header|footer|section|aside|nav|article|main|figure|figcaption|h[1-6]';

    // Escape ALL matching HTML tags (not just those in text context)
    // Use negative lookahead (?!`) to prevent re-escaping already-escaped tags
    const escapeOpeningTags = () => {
      return markdown.replace(
        new RegExp(`(<(?:${htmlTagNames})(?:\\s[^>]*)?>)(?!\`)`, 'gi'),
        '`$1`'
      );
    };

    const escapeClosingTags = () => {
      return markdown.replace(
        new RegExp(`(<\\/(?:${htmlTagNames})>)(?!\`)`, 'gi'),
        '`$1`'
      );
    };

    // Run multiple passes to catch all tags
    for (let i = 0; i < 3; i++) {
      const before = markdown;
      markdown = escapeOpeningTags();
      markdown = escapeClosingTags();
      if (markdown === before) break; // No more changes
    }

    // Restore tables
    tablePlaceholders.forEach((table, i) => {
      markdown = markdown.replace(`__TABLE_${i}__`, table);
    });

    // Restore code blocks
    codeBlockPlaceholders.forEach((block, i) => {
      markdown = markdown.replace(`__CODE_BLOCK_${i}__`, block);
    });

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
   * Create custom VuePress styles for full-width content
   */
  async createCustomStyles() {
    const stylesDir = path.join(this.config.outputDir, '.vuepress', 'styles');
    await ensureDir(stylesDir);

    const styles = `// Custom styles for full-width content (like Confluence)
// Override the default theme's CSS variables

:root {
  // Set content width to use available space
  --content-width: 100%;
  --homepage-width: 100%;
}

// Additional overrides for full-width layout
.theme-default-content {
  max-width: none !important;
  padding: 0 2rem;
}

.page {
  padding-left: 1rem;
  padding-right: 1rem;
}

// Ensure tables can use full width
table {
  display: table;
  width: 100%;
}

// Adjust code blocks for wider content
div[class*="language-"] {
  max-width: none;
}

// Sidebar adjustment for wider content
.sidebar {
  width: 280px;
}
`;

    await fs.writeFile(path.join(stylesDir, 'index.scss'), styles, 'utf-8');
  }

  /**
   * Fix Confluence links in all generated markdown files
   */
  async fixConfluenceLinks() {
    // Build slug to path mapping
    const slugToPath = new Map();
    for (const [pageId, pageInfo] of this.pageMap) {
      const slug = slugify(pageInfo.title);
      slugToPath.set(slug, pageInfo.path);
    }

    // Pattern to match our placeholder links: [text](CONFLUENCE_LINK:slug)
    const placeholderPattern = /\[([^\]]+)\]\(CONFLUENCE_LINK:([^)]+)\)/g;

    // Pattern to match Confluence page URLs (for links that weren't converted)
    // Format: /wiki/spaces/XXX/pages/PAGEID
    const confluenceUrlPattern = /\[([^\]]+)\]\(((?:https?:\/\/[^\/]+)?\/wiki\/spaces\/[^\/]+\/pages\/(\d+)[^)]*)\)/g;

    // Alternative format: /wiki/pages/viewpage.action?pageId=PAGEID
    const viewPagePattern = /\[([^\]]+)\]\(((?:https?:\/\/[^\/]+)?\/wiki\/pages\/viewpage\.action\?pageId=(\d+)[^)]*)\)/g;

    let fixedCount = 0;

    // Build page ID to path mapping for URL-based links
    const pageIdToPath = new Map();
    for (const [pageId, pageInfo] of this.pageMap) {
      pageIdToPath.set(pageId, pageInfo.path);
    }

    // Process all markdown files
    for (const [pageId, pageInfo] of this.pageMap) {
      const mdPath = path.join(this.config.outputDir, pageInfo.path, 'README.md');

      try {
        let content = await fs.readFile(mdPath, 'utf-8');
        let modified = false;

        // Fix placeholder links
        content = content.replace(placeholderPattern, (match, linkText, targetSlug) => {
          const targetPath = slugToPath.get(targetSlug);
          if (targetPath) {
            const currentParts = pageInfo.path.split('/').filter(Boolean);
            const targetParts = targetPath.split('/').filter(Boolean);
            const ups = currentParts.length;
            const relativePath = '../'.repeat(ups) + targetParts.join('/') + '/';
            modified = true;
            fixedCount++;
            return `[${linkText}](${relativePath})`;
          }
          // Link to page not in migration - remove the placeholder but keep as text
          modified = true;
          return linkText;
        });

        // Fix Confluence URL links (both formats)
        const fixUrlLink = (match, linkText, fullUrl, targetPageId) => {
          const targetPath = pageIdToPath.get(targetPageId);
          if (targetPath) {
            const currentParts = pageInfo.path.split('/').filter(Boolean);
            const targetParts = targetPath.split('/').filter(Boolean);
            const ups = currentParts.length;
            const relativePath = '../'.repeat(ups) + targetParts.join('/') + '/';
            modified = true;
            fixedCount++;
            return `[${linkText}](${relativePath})`;
          }
          return match;
        };

        content = content.replace(confluenceUrlPattern, fixUrlLink);
        content = content.replace(viewPagePattern, fixUrlLink);

        if (modified) {
          await fs.writeFile(mdPath, content, 'utf-8');
        }
      } catch (error) {
        // File might not exist, skip
      }
    }

    console.log(`✓ Fixed ${fixedCount} internal links`);
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

    console.log('\n🔗 Fixing internal links...');
    await this.fixConfluenceLinks();

    console.log('\n⚙️  Generating VuePress configuration...');
    const vuepressConfig = this.generateVuePressConfig();
    const configPath = path.join(this.config.outputDir, '.vuepress', 'config.js');
    await fs.writeFile(configPath, vuepressConfig, 'utf-8');
    console.log(`✓ Saved: ${configPath}`);

    console.log('\n🎨 Creating custom styles...');
    await this.createCustomStyles();
    console.log(`✓ Saved: ${path.join(this.config.outputDir, '.vuepress', 'styles', 'index.scss')}`);

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
