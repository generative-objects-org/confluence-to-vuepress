/**
 * Unit tests for Markdown conversion and HTML tag escaping
 */

const { ConfluenceToVuePress, createTurndownService } = require('../src/migrator');

describe('convertToMarkdown', () => {
  let migrator;

  beforeEach(() => {
    migrator = new ConfluenceToVuePress({
      confluenceUrl: 'https://test.atlassian.net',
      rootPageId: '12345',
      email: 'test@example.com',
      apiToken: 'test-token'
    });
  });

  describe('Vue component escaping', () => {
    // Note: In real Confluence content, these tags would be HTML-escaped (&lt;Type&gt;)
    // Turndown strips unknown HTML tags, so we test with escaped entities
    test('escapes Type-like tags when HTML-escaped', () => {
      const html = '<p>The &lt;Type&gt; element is used here</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<Type>`');
    });

    test('escapes Entity-like tags when HTML-escaped', () => {
      const html = '<p>Use &lt;Entity&gt; for data</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<Entity>`');
    });

    test('escapes Reference-like tags when HTML-escaped', () => {
      const html = '<p>The &lt;EntityReference&gt; points to data</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<EntityReference>`');
    });

    test('escapes Collection-like tags when HTML-escaped', () => {
      const html = '<p>Use &lt;EntityCollection&gt; for lists</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<EntityCollection>`');
    });

    test('escapes Model-like tags when HTML-escaped', () => {
      const html = '<p>The &lt;DomainModel&gt; defines the schema</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<DomainModel>`');
    });

    test('escapes IU-like tags when HTML-escaped', () => {
      const html = '<p>An &lt;AbstractIU&gt; is the base class</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<AbstractIU>`');
    });

    test('escapes CUI/AUI tags when HTML-escaped', () => {
      const html = '<p>The &lt;CUI&gt; and &lt;AUI&gt; models interact</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<CUI>`');
      expect(result).toContain('`<AUI>`');
    });
  });

  describe('HTML tag escaping', () => {
    // Note: In real Confluence content, HTML tags as text would be HTML-escaped
    // Turndown strips/interprets raw HTML tags, so we test with escaped entities
    test('escapes standalone div tags when HTML-escaped', () => {
      const html = '<p>Use &lt;div&gt; for containers</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<div>`');
    });

    test('escapes standalone ul/li tags when HTML-escaped', () => {
      const html = '<p>Use &lt;ul&gt; and &lt;li&gt; for lists</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<ul>`');
      expect(result).toContain('`<li>`');
    });

    test('escapes adjacent tags like <ol><li> when HTML-escaped', () => {
      const html = '<p>Use &lt;ol&gt;&lt;li&gt; for ordered lists</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<ol>`');
      expect(result).toContain('`<li>`');
    });

    test('escapes closing tags when HTML-escaped', () => {
      const html = '<p>Close with &lt;/div&gt; tag</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`</div>`');
    });

    test('escapes form-related tags when HTML-escaped', () => {
      const html = '<p>Use &lt;form&gt;, &lt;input&gt;, &lt;button&gt;, &lt;select&gt;, &lt;textarea&gt;, &lt;label&gt;</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<form>`');
      expect(result).toContain('`<input>`');
      expect(result).toContain('`<button>`');
      expect(result).toContain('`<select>`');
      expect(result).toContain('`<textarea>`');
      expect(result).toContain('`<label>`');
    });

    test('escapes semantic HTML tags when HTML-escaped', () => {
      const html = '<p>Use &lt;header&gt;, &lt;footer&gt;, &lt;section&gt;, &lt;article&gt;, &lt;nav&gt;, &lt;aside&gt;</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<header>`');
      expect(result).toContain('`<footer>`');
      expect(result).toContain('`<section>`');
      expect(result).toContain('`<article>`');
      expect(result).toContain('`<nav>`');
      expect(result).toContain('`<aside>`');
    });

    test('escapes heading tags h1-h6 when HTML-escaped', () => {
      const html = '<p>Use &lt;h1&gt; through &lt;h6&gt; for headings</p>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('`<h1>`');
      expect(result).toContain('`<h6>`');
    });
  });

  describe('Code block protection', () => {
    test('does not escape tags inside fenced code blocks', () => {
      // Use escaped HTML entities as they would come from Confluence
      const html = '<pre><code class="language-html">&lt;div&gt;content&lt;/div&gt;</code></pre>';
      const result = migrator.convertToMarkdown(html);
      // The code block should contain the tags
      expect(result).toContain('```html');
      // Content should be preserved (may be entity-decoded by turndown)
      expect(result).toMatch(/<div>|&lt;div&gt;/);
    });

    test('preserves code blocks with JavaScript', () => {
      const html = '<pre><code class="language-javascript">const el = document.querySelector("div");</code></pre>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('```javascript');
    });
  });

  describe('Table protection', () => {
    test('preserves HTML tables', () => {
      const html = '<table><tr><td>Cell content</td></tr></table>';
      const result = migrator.convertToMarkdown(html);
      // Tables should be preserved as HTML, not escaped
      expect(result).toContain('<table>');
      expect(result).toContain('<td>');
      expect(result).not.toContain('`<table>`');
    });

    test('preserves complex tables with lists inside', () => {
      const html = '<table><tr><td><ul><li>Item 1</li><li>Item 2</li></ul></td></tr></table>';
      const result = migrator.convertToMarkdown(html);
      expect(result).toContain('<table>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
    });

    test('preserves actual tables while escaping div tags mentioned in text', () => {
      // Note: table tags are protected and not escaped since we want actual tables to render
      // We test with div which IS in the escape list
      const html = '<p>Use &lt;div&gt; for layout</p><table><tbody><tr><td>Cell</td></tr></tbody></table>';
      const result = migrator.convertToMarkdown(html);
      // The div mention should be escaped
      expect(result).toMatch(/`<div>`/);
      // But the actual table structure should be preserved
      expect(result).toContain('<td>Cell</td>');
    });
  });

  describe('Attachment link fixing', () => {
    test('replaces Confluence download URLs with local paths', () => {
      const html = '<p><a href="/wiki/download/attachments/123/test.png">Image</a></p>';
      const attachments = [{ original: 'test.png', sanitized: 'test.png', path: './attachments/my-page/test.png' }];
      const result = migrator.convertToMarkdown(html, attachments, 'my-page');
      expect(result).toContain('./attachments/my-page/test.png');
    });

    test('handles filenames with spaces when URL-decoded', () => {
      // The original filename needs to match what's in the URL (decoded)
      const html = '<p><a href="/wiki/download/attachments/123/test image.png">Image</a></p>';
      const attachments = [{ original: 'test image.png', sanitized: 'test_image.png', path: './attachments/my-page/test_image.png' }];
      const result = migrator.convertToMarkdown(html, attachments, 'my-page');
      expect(result).toContain('./attachments/my-page/test_image.png');
    });
  });
});

describe('Turndown service', () => {
  let turndownService;

  beforeEach(() => {
    turndownService = createTurndownService();
  });

  test('converts headings to ATX style', () => {
    const result = turndownService.turndown('<h1>Heading 1</h1>');
    expect(result).toBe('# Heading 1');
  });

  test('converts h2 headings', () => {
    const result = turndownService.turndown('<h2>Heading 2</h2>');
    expect(result).toBe('## Heading 2');
  });

  test('converts paragraphs', () => {
    const result = turndownService.turndown('<p>Paragraph text</p>');
    expect(result).toBe('Paragraph text');
  });

  test('converts bold text', () => {
    const result = turndownService.turndown('<p><strong>Bold text</strong></p>');
    expect(result).toBe('**Bold text**');
  });

  test('converts italic text', () => {
    const result = turndownService.turndown('<p><em>Italic text</em></p>');
    expect(result).toBe('_Italic text_');
  });

  test('converts links', () => {
    const result = turndownService.turndown('<a href="https://example.com">Link text</a>');
    expect(result).toBe('[Link text](https://example.com)');
  });

  test('converts unordered lists', () => {
    const result = turndownService.turndown('<ul><li>Item 1</li><li>Item 2</li></ul>');
    // Turndown adds extra spaces for formatting
    expect(result).toMatch(/\*\s+Item 1/);
    expect(result).toMatch(/\*\s+Item 2/);
  });

  test('converts ordered lists', () => {
    const result = turndownService.turndown('<ol><li>First</li><li>Second</li></ol>');
    // Turndown adds extra spaces for formatting
    expect(result).toMatch(/1\.\s+First/);
    expect(result).toMatch(/2\.\s+Second/);
  });

  test('converts blockquotes', () => {
    const result = turndownService.turndown('<blockquote>Quote text</blockquote>');
    expect(result).toBe('> Quote text');
  });

  test('converts code blocks with language', () => {
    const result = turndownService.turndown('<pre><code class="language-javascript">const x = 1;</code></pre>');
    expect(result).toContain('```javascript');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('```');
  });

  test('converts code blocks without language', () => {
    const result = turndownService.turndown('<pre><code>plain code</code></pre>');
    expect(result).toContain('```');
    expect(result).toContain('plain code');
  });

  test('converts inline code', () => {
    const result = turndownService.turndown('<p>Use <code>inline code</code> here</p>');
    expect(result).toBe('Use `inline code` here');
  });

  test('converts images', () => {
    const result = turndownService.turndown('<img src="image.png" alt="Alt text" />');
    expect(result).toBe('![Alt text](image.png)');
  });

  test('converts simple tables to GFM', () => {
    const html = '<table><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table>';
    const result = turndownService.turndown(html);
    expect(result).toContain('Header 1');
    expect(result).toContain('Header 2');
    expect(result).toContain('Cell 1');
    expect(result).toContain('---');
  });
});
