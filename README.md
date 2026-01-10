# Confluence to VuePress

Migrate your Confluence wiki pages to a VuePress static documentation site.

> A CLI tool and Node.js library for migrating Atlassian Confluence Cloud wikis to VuePress 2 static sites. Converts Confluence pages to Markdown, downloads attachments, and generates a ready-to-use VuePress project.

## Features

- Converts Confluence pages to Markdown format
- Preserves page hierarchy and navigation structure
- Downloads and organizes attachments (images, files)
- Downloads external images referenced in pages
- Handles Confluence-specific elements (macros, links, code blocks)
- Generates VuePress configuration with sidebar navigation
- Creates a ready-to-use VuePress project
- Escapes HTML-like content to prevent Vue component conflicts

## Installation

### Global Installation (recommended)

```bash
npm install -g confluence-to-vuepress
```

### Local Installation

```bash
npm install confluence-to-vuepress
```

### From Source

```bash
git clone https://github.com/generative-objects-org/confluence-to-vuepress.git
cd confluence-to-vuepress
npm install
npm link  # Optional: makes the CLI available globally
```

## Quick Start

1. **Create a configuration file:**

   ```bash
   confluence-to-vuepress init
   ```

   This creates a `.confluencerc.json` file. Edit it with your Confluence details.

2. **Test your connection:**

   ```bash
   confluence-to-vuepress test
   ```

3. **Run the migration:**

   ```bash
   confluence-to-vuepress migrate
   ```

4. **Start the VuePress dev server:**

   ```bash
   cd docs
   npm install
   npm run dev
   ```

## Configuration

### Using a Config File

Create a `.confluencerc.json` file in your project root:

```json
{
  "confluenceUrl": "https://yoursite.atlassian.net",
  "rootPageId": "12345678",
  "spaceKey": "YOURSPACE",
  "email": "your-email@example.com",
  "apiToken": "your-api-token",
  "outputDir": "./docs",
  "siteTitle": "My Documentation",
  "siteDescription": "Migrated from Confluence"
}
```

### Using Environment Variables

Create a `.env` file:

```bash
CONFLUENCE_URL=https://yoursite.atlassian.net
CONFLUENCE_ROOT_PAGE_ID=12345678
CONFLUENCE_SPACE_KEY=YOURSPACE
CONFLUENCE_EMAIL=your-email@example.com
CONFLUENCE_API_TOKEN=your-api-token
```

### Using CLI Arguments

```bash
confluence-to-vuepress migrate \
  --url https://yoursite.atlassian.net \
  --page-id 12345678 \
  --email your-email@example.com \
  --token your-api-token \
  --output ./docs
```

## Getting Your Confluence API Token

1. Log in to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a label and click "Create"
4. Copy the token (you won't be able to see it again)

## Finding Your Page ID

The page ID is visible in the URL when viewing a Confluence page:

```
https://yoursite.atlassian.net/wiki/spaces/SPACE/pages/12345678/Page+Title
                                                        ^^^^^^^^
                                                        This is the page ID
```

## CLI Commands

### `migrate`

Run the migration from Confluence to VuePress.

```bash
confluence-to-vuepress migrate [options]
```

Options:
- `-u, --url <url>` - Confluence base URL
- `-p, --page-id <id>` - Root page ID to migrate
- `-s, --space <key>` - Confluence space key
- `-o, --output <dir>` - Output directory (default: ./docs)
- `-e, --email <email>` - Confluence account email
- `-t, --token <token>` - Confluence API token
- `--title <title>` - Site title
- `--description <desc>` - Site description
- `--no-external-images` - Skip downloading external images
- `-c, --config <path>` - Path to config file

### `test`

Test the connection to Confluence.

```bash
confluence-to-vuepress test [options]
```

### `init`

Create a sample configuration file.

```bash
confluence-to-vuepress init [options]
```

Options:
- `-f, --format <format>` - Config format: `json` or `env` (default: json)

## Programmatic Usage

You can also use the migrator as a library:

```javascript
const { ConfluenceToVuePress } = require('confluence-to-vuepress');

const migrator = new ConfluenceToVuePress({
  confluenceUrl: 'https://yoursite.atlassian.net',
  rootPageId: '12345678',
  email: 'your-email@example.com',
  apiToken: 'your-api-token',
  outputDir: './docs',
  siteTitle: 'My Documentation'
});

migrator.migrate()
  .then(result => {
    console.log(`Migrated ${result.pagesProcessed} pages`);
  })
  .catch(err => {
    console.error('Migration failed:', err);
  });
```

## Output Structure

After migration, your output directory will look like this:

```
docs/
├── .vuepress/
│   └── config.js          # VuePress configuration
├── README.md              # Homepage
└── your-root-page/
    ├── README.md          # Page content
    ├── attachments/
    │   └── your-root-page/
    │       ├── image1.png
    │       └── document.pdf
    └── child-page/
        ├── README.md
        └── attachments/
            └── child-page/
                └── image2.png
```

## What Gets Migrated

| Content Type | Status |
|--------------|--------|
| Page content | Converted to Markdown |
| Page hierarchy | Preserved as folder structure |
| Page ordering | Maintained using Confluence position metadata |
| Images & attachments | Downloaded locally |
| External images | Downloaded locally |
| Code blocks | Preserved with syntax highlighting |
| Tables | Converted to Markdown tables |
| Internal links | Converted to relative links |
| External links | Preserved |

## Confluence Elements Handled

The tool handles various Confluence-specific elements and edge cases:

### Images & Attachments

| Element | Handling |
|---------|----------|
| `<ac:image>` with `<ri:attachment>` | Converted to local image path |
| `<ac:image>` with `<ri:url>` | External images downloaded locally |
| Blob images (`data-fileid`) | Mapped to downloaded attachments |
| Filenames with invalid characters | Sanitized (colons, spaces replaced with underscores) |
| Attachments from parent pages | Automatically copied to child pages |
| Attachments from sibling pages | Searched and copied when referenced |

### Panels & Macros

| Element | Handling |
|---------|----------|
| Info panels (`ac:name="info"`) | Converted to blockquote with **INFO:** prefix |
| Note panels (`ac:name="note"`) | Converted to blockquote with **NOTE:** prefix |
| Warning panels (`ac:name="warning"`) | Converted to blockquote with **WARNING:** prefix |
| Tip panels (`ac:name="tip"`) | Converted to blockquote with **TIP:** prefix |
| Other `ac:structured-macro` | Removed (content not preservable) |

### Links

| Element | Handling |
|---------|----------|
| `<ac:link>` with page title | Converted to relative markdown links |
| External links | Preserved as-is |
| Confluence download URLs | Converted to local paths |

### VuePress Compatibility

| Issue | Handling |
|-------|----------|
| Type-like tags (`<Type>`, `<Entity>`) | Escaped with backticks to prevent Vue errors |
| HTML tags in text (`<div>`, `<span>`) | Escaped with backticks |
| YAML special characters in titles | Properly quoted in frontmatter |
| SVG icons | Removed (decorative) |
| Heading anchor buttons | Removed (navigation clutter) |
| Atlassian Editor wrapper spans | Removed, content preserved |

### Generated Output

| Output | Description |
|--------|-------------|
| VuePress config | Sidebar with collapsible navigation |
| Homepage | VuePress home layout with hero section |
| package.json | Ready-to-use with VuePress dependencies |
| Folder structure | Mirrors Confluence page hierarchy |

## Limitations

- Some Confluence macros are stripped (those without preservable content)
- Complex layouts may not preserve exact formatting
- Comments and page history are not migrated
- Permissions are not migrated
- Embedded content from third-party integrations not supported

## Troubleshooting

### Authentication Failed

- Verify your email is correct
- Generate a new API token
- Ensure you have read access to the pages

### Missing Images

- Check if images are attached to parent pages (handled automatically)
- External images require internet access during migration

### Vue Component Errors

If you see errors about missing end tags for elements like `<Type>` or `<Entity>`, the migrator automatically escapes these. If you encounter new patterns, please open an issue.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [VuePress](https://vuepress.vuejs.org/) - Vue-powered static site generator
- [Turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown converter
- [Confluence REST API](https://developer.atlassian.com/cloud/confluence/rest/)
