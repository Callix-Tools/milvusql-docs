import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started/installation">
            Get Started
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            style={{marginLeft: '1rem'}}
            href="https://github.com/Callix-Tools/milvusql">
            GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

type FeatureItem = {
  title: string;
  description: string;
  badge: string;
};

const features: FeatureItem[] = [
  {
    title: 'PEP 249, sync and async',
    badge: '🔌',
    description:
      'A real DBAPI for Milvus — Cursor/Connection like any other, plus an asyncio-native client built on the same dispatch table, not bolted on afterward.',
  },
  {
    title: 'SQLAlchemy 2.0 dialect',
    badge: '🧰',
    description:
      'create_engine("milvusql://..."), Core select/insert/delete, a VECTOR type with .l2_distance()/.cosine_distance(), and DDL that maps straight to Milvus collections and indexes.',
  },
  {
    title: 'Django database backend',
    badge: '🍀',
    description:
      'Model.objects.filter(...) and .create() through Django’s normal compiler, a VectorField, and explicit vector_search()/hybrid_search() helpers for what has no relational equivalent.',
  },
];

function Feature({title, description, badge}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center" style={{fontSize: '3rem', marginBottom: '1rem'}}>
        {badge}
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="PEP 249 DBAPI, SQLAlchemy dialect, and Django backend for Milvus">
      <HomepageHeader />
      <main>
        <section className={styles.features}>
          <div className="container">
            <div className="row" style={{marginTop: '2rem', marginBottom: '2rem'}}>
              {features.map((props, idx) => (
                <Feature key={idx} {...props} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
