import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'intro',
      label: 'Introduction',
    },
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/concepts',
      ],
    },
    {
      type: 'category',
      label: 'Core (DBAPI)',
      items: [
        'core/overview',
        'core/sync-and-async',
        'core/errors',
        'core/consistency-level',
      ],
    },
    {
      type: 'category',
      label: 'SQLAlchemy',
      items: [
        'sqlalchemy/overview',
        'sqlalchemy/types',
        'sqlalchemy/ddl',
        'sqlalchemy/orm-models',
        'sqlalchemy/hybrid-search',
        'sqlalchemy/reflection',
        'sqlalchemy/async-engine',
      ],
    },
    {
      type: 'category',
      label: 'Django',
      items: [
        'django/overview',
        'django/vector-field',
        'django/schema-and-migrations',
        'django/search-helpers',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: [
        'examples/basic',
        'examples/with-sqlalchemy',
        'examples/with-django',
      ],
    },
  ],
};

export default sidebars;
