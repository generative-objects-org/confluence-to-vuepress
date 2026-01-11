/**
 * Unit tests for VuePress output generation
 */

const { ConfluenceToVuePress } = require('../src/migrator');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('VuePress Generation', () => {
  let migrator;
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-vuepress-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    migrator = new ConfluenceToVuePress({
      confluenceUrl: 'https://test.atlassian.net',
      rootPageId: '12345',
      email: 'test@example.com',
      apiToken: 'test-token',
      outputDir: tempDir,
      siteTitle: 'Test Documentation',
      siteDescription: 'Test description'
    });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('generateVuePressConfig', () => {
    beforeEach(() => {
      // Set up page map with test data
      migrator.pageMap.set('12345', {
        title: 'Root Page',
        path: 'root-page',
        slug: 'root-page',
        children: ['67890']
      });
      migrator.pageMap.set('67890', {
        title: 'Child Page',
        path: 'root-page/child-page',
        slug: 'child-page',
        children: []
      });
    });

    test('generates valid JavaScript module', () => {
      const config = migrator.generateVuePressConfig();
      expect(config).toContain('export default');
      expect(config).toContain('import { defaultTheme }');
      expect(config).toContain('import { viteBundler }');
    });

    test('includes site title', () => {
      const config = migrator.generateVuePressConfig();
      expect(config).toContain("title: 'Test Documentation'");
    });

    test('includes site description', () => {
      const config = migrator.generateVuePressConfig();
      expect(config).toContain("description: 'Test description'");
    });

    test('includes sidebar configuration', () => {
      const config = migrator.generateVuePressConfig();
      expect(config).toContain('sidebar:');
      expect(config).toContain('text: ');
      expect(config).toContain('link: ');
    });

    test('includes navigation', () => {
      const config = migrator.generateVuePressConfig();
      expect(config).toContain('nav:');
      expect(config).toContain("text: 'Home'");
    });

    test('includes viteBundler', () => {
      const config = migrator.generateVuePressConfig();
      expect(config).toContain('bundler: viteBundler()');
    });

    test('includes collapsible children', () => {
      const config = migrator.generateVuePressConfig();
      expect(config).toContain('collapsible: true');
    });

    test('generates correct link paths', () => {
      const config = migrator.generateVuePressConfig();
      // Config uses double quotes in JSON format
      expect(config).toContain('link: "/root-page"');
      expect(config).toContain('link: "/root-page/child-page"');
    });
  });

  describe('createCustomStyles', () => {
    test('creates styles directory', async () => {
      await fs.mkdir(path.join(tempDir, '.vuepress'), { recursive: true });
      await migrator.createCustomStyles();

      const stylesDir = path.join(tempDir, '.vuepress', 'styles');
      const stat = await fs.stat(stylesDir);
      expect(stat.isDirectory()).toBe(true);
    });

    test('creates index.scss file', async () => {
      await fs.mkdir(path.join(tempDir, '.vuepress'), { recursive: true });
      await migrator.createCustomStyles();

      const stylesPath = path.join(tempDir, '.vuepress', 'styles', 'index.scss');
      const content = await fs.readFile(stylesPath, 'utf-8');
      expect(content).toBeTruthy();
    });

    test('includes content width override', async () => {
      await fs.mkdir(path.join(tempDir, '.vuepress'), { recursive: true });
      await migrator.createCustomStyles();

      const stylesPath = path.join(tempDir, '.vuepress', 'styles', 'index.scss');
      const content = await fs.readFile(stylesPath, 'utf-8');
      expect(content).toContain('--content-width: 100%');
    });

    test('includes homepage width override', async () => {
      await fs.mkdir(path.join(tempDir, '.vuepress'), { recursive: true });
      await migrator.createCustomStyles();

      const stylesPath = path.join(tempDir, '.vuepress', 'styles', 'index.scss');
      const content = await fs.readFile(stylesPath, 'utf-8');
      expect(content).toContain('--homepage-width: 100%');
    });

    test('includes theme-default-content override', async () => {
      await fs.mkdir(path.join(tempDir, '.vuepress'), { recursive: true });
      await migrator.createCustomStyles();

      const stylesPath = path.join(tempDir, '.vuepress', 'styles', 'index.scss');
      const content = await fs.readFile(stylesPath, 'utf-8');
      expect(content).toContain('.theme-default-content');
      expect(content).toContain('max-width: none');
    });

    test('includes table styles', async () => {
      await fs.mkdir(path.join(tempDir, '.vuepress'), { recursive: true });
      await migrator.createCustomStyles();

      const stylesPath = path.join(tempDir, '.vuepress', 'styles', 'index.scss');
      const content = await fs.readFile(stylesPath, 'utf-8');
      expect(content).toContain('table');
      expect(content).toContain('width: 100%');
    });
  });

  describe('createHomepage', () => {
    beforeEach(() => {
      migrator.pageMap.set('12345', {
        title: 'Root Page',
        path: 'root-page',
        slug: 'root-page',
        children: []
      });
    });

    test('creates README.md file', async () => {
      await migrator.createHomepage();

      const homepagePath = path.join(tempDir, 'README.md');
      const stat = await fs.stat(homepagePath);
      expect(stat.isFile()).toBe(true);
    });

    test('includes home frontmatter', async () => {
      await migrator.createHomepage();

      const content = await fs.readFile(path.join(tempDir, 'README.md'), 'utf-8');
      expect(content).toContain('home: true');
    });

    test('includes hero text', async () => {
      await migrator.createHomepage();

      const content = await fs.readFile(path.join(tempDir, 'README.md'), 'utf-8');
      expect(content).toContain('heroText: Test Documentation');
    });

    test('includes tagline', async () => {
      await migrator.createHomepage();

      const content = await fs.readFile(path.join(tempDir, 'README.md'), 'utf-8');
      expect(content).toContain('tagline: Test description');
    });

    test('includes get started action', async () => {
      await migrator.createHomepage();

      const content = await fs.readFile(path.join(tempDir, 'README.md'), 'utf-8');
      expect(content).toContain('text: Get Started');
      expect(content).toContain('link: /root-page');
      expect(content).toContain('type: primary');
    });
  });

  describe('createPackageJson', () => {
    test('creates package.json file', async () => {
      await migrator.createPackageJson();

      const packagePath = path.join(tempDir, 'package.json');
      const stat = await fs.stat(packagePath);
      expect(stat.isFile()).toBe(true);
    });

    test('includes correct name', async () => {
      await migrator.createPackageJson();

      const content = await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.name).toBe('docs');
    });

    test('includes dev script', async () => {
      await migrator.createPackageJson();

      const content = await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.dev).toBe('vuepress dev');
    });

    test('includes build script', async () => {
      await migrator.createPackageJson();

      const content = await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.scripts.build).toBe('vuepress build');
    });

    test('includes VuePress dependency', async () => {
      await migrator.createPackageJson();

      const content = await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.devDependencies.vuepress).toBeTruthy();
    });

    test('includes vite bundler dependency', async () => {
      await migrator.createPackageJson();

      const content = await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.devDependencies['@vuepress/bundler-vite']).toBeTruthy();
    });

    test('includes default theme dependency', async () => {
      await migrator.createPackageJson();

      const content = await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.devDependencies['@vuepress/theme-default']).toBeTruthy();
    });

    test('includes sass-embedded dependency', async () => {
      await migrator.createPackageJson();

      const content = await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      expect(pkg.devDependencies['sass-embedded']).toBeTruthy();
    });
  });

  describe('validateConfig', () => {
    test('throws error when confluenceUrl is missing', () => {
      const badMigrator = new ConfluenceToVuePress({
        rootPageId: '12345',
        email: 'test@example.com',
        apiToken: 'test-token'
      });
      expect(() => badMigrator.validateConfig()).toThrow('Missing required configuration');
      expect(() => badMigrator.validateConfig()).toThrow('confluenceUrl');
    });

    test('throws error when rootPageId is missing', () => {
      const badMigrator = new ConfluenceToVuePress({
        confluenceUrl: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token'
      });
      expect(() => badMigrator.validateConfig()).toThrow('Missing required configuration');
      expect(() => badMigrator.validateConfig()).toThrow('rootPageId');
    });

    test('throws error when email is missing', () => {
      const badMigrator = new ConfluenceToVuePress({
        confluenceUrl: 'https://test.atlassian.net',
        rootPageId: '12345',
        apiToken: 'test-token'
      });
      expect(() => badMigrator.validateConfig()).toThrow('Missing required configuration');
      expect(() => badMigrator.validateConfig()).toThrow('email');
    });

    test('throws error when apiToken is missing', () => {
      const badMigrator = new ConfluenceToVuePress({
        confluenceUrl: 'https://test.atlassian.net',
        rootPageId: '12345',
        email: 'test@example.com'
      });
      expect(() => badMigrator.validateConfig()).toThrow('Missing required configuration');
      expect(() => badMigrator.validateConfig()).toThrow('apiToken');
    });

    test('does not throw when all required config is provided', () => {
      expect(() => migrator.validateConfig()).not.toThrow();
    });
  });
});
