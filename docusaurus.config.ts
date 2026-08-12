import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'milvusql',
  tagline: 'PEP 249 DBAPI, SQLAlchemy dialect, and Django backend for Milvus',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://Callix-Tools.github.io',
  baseUrl: '/milvusql-docs/',

  organizationName: 'Callix-Tools',
  projectName: 'milvusql-docs',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/Callix-Tools/milvusql-docs/tree/main/docs/',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'milvusql',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/Callix-Tools/milvusql',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://pypi.org/project/milvusql/',
          label: 'PyPI',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Getting Started', to: '/docs/getting-started/installation'},
            {label: 'Core (DBAPI)', to: '/docs/core/overview'},
            {label: 'SQLAlchemy', to: '/docs/sqlalchemy/overview'},
            {label: 'Django', to: '/docs/django/overview'},
          ],
        },
        {
          title: 'Packages',
          items: [
            {
              label: 'milvusql',
              href: 'https://github.com/Callix-Tools/milvusql',
            },
            {
              label: 'milvusql-sqlalchemy',
              href: 'https://pypi.org/project/milvusql-sqlalchemy/',
            },
            {
              label: 'milvusql-django',
              href: 'https://pypi.org/project/milvusql-django/',
            },
          ],
        },
        {
          title: 'Links',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Callix-Tools/milvusql',
            },
            {
              label: 'sqlglot-milvus',
              href: 'https://github.com/Callix-Tools/sqlglot-milvus',
            },
            {
              label: 'Milvus',
              href: 'https://milvus.io/',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} milvusql. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['python', 'bash', 'sql', 'ini', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
