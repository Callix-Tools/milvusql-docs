---
sidebar_position: 3
---

# DDL

MilvusQL's `CREATE TABLE ... WITH (...)` and `CREATE INDEX ... USING <method> WITH (...)` have no
base-SQL equivalent, so they're exposed through SQLAlchemy's standard mechanism for
dialect-specific DDL options — the same `<dialect>_<option>` prefixed-kwarg pattern
`mysql_engine=...` uses.

## Table options

```python
from sqlalchemy import Table, Column, BigInteger, String

items = Table(
    "items", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("category", String(64)),
    milvusql_shards=1,
    milvusql_consistency_level="Bounded",
    milvusql_partition_key="category",
)
```

Renders `WITH (shards=1, consistency_level='Bounded', partition_key='category')` on `CREATE TABLE`.

A single-column primary key with `autoincrement=True` renders with an inline `PRIMARY KEY
AUTO_INCREMENT` keyword on the column, *in addition to* the standard trailing `PRIMARY KEY (id)`
constraint SQLAlchemy's base DDL compiler always emits — both are present in the output. This is
unconditional, not configurable.

## Index options

```python
from sqlalchemy import Index

Index(
    "idx_emb", items.c.embedding,
    milvusql_using="HNSW",
    milvusql_with={"metric_type": "COSINE", "M": 16, "ef_construction": 200},
)
```

Renders `CREATE INDEX idx_emb ON items (embedding) USING HNSW WITH (metric_type='COSINE', M=16, ef_construction=200)`.

String values in `WITH (...)` are single-quoted — MilvusQL follows ANSI SQL here, where `"..."`
means a quoted *identifier* and `'...'` means a string literal. (A double-quoted value in a
property parses as `exp.Var`, not `exp.Literal` — confirmed directly against `sqlglot-milvus`.)

## BM25 full-text: `Computed()` for the generated `SPARSEVEC`

`GENERATED ALWAYS AS (BM25(<text column>))` — the one server-side generated column Milvus
supports — needs no dialect-specific construct: SQLAlchemy's own `Computed()` already renders it,
since the base `DDLCompiler` appends a generated-column clause to any column carrying one:

```python
from sqlalchemy import BigInteger, Column, Computed, Table, Text
from milvusql_sqlalchemy.types import SPARSEVEC, VECTOR

docs = Table(
    "docs", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("content", Text),
    Column("content_sparse", SPARSEVEC(), Computed("BM25(content)")),
    Column("embedding", VECTOR(768)),
)
Index(
    "idx_fts", docs.c.content_sparse,
    milvusql_using="SPARSE_INVERTED_INDEX",
    milvusql_with={"metric_type": "BM25"},
)
```

A plain `sa.Text` column is Milvus's analyzer-enabled full-text input (`TEXT` in MilvusQL) — see
[MilvusQL Concepts → Full-text search](../getting-started/concepts#full-text-search-bm25-and-match--against)
for what `TEXT`/`BM25_SCORE`/`MATCH ... AGAINST` do underneath.

## Loading a collection

`LOAD TABLE`/`RELEASE TABLE` have no `Table`/`Index`-level equivalent to attach kwargs to — issue
them directly:

```python
with engine.begin() as conn:
    conn.exec_driver_sql("LOAD TABLE items")
```

## Alembic

Importing the dialect registers a `milvusql`-specific `DefaultImpl` with Alembic automatically, no
separate setup call needed — this turns Alembic's otherwise-opaque `KeyError` for an unregistered
dialect into a working engine.

:::warning Alembic migrations still cannot run end to end against Milvus
Alembic's own `alembic_version` bookkeeping table (`version_num VARCHAR(32) PRIMARY KEY`) has no
vector column, and Milvus refuses to create a collection with zero vector fields. `alembic upgrade`,
`alembic downgrade` and `alembic revision --autogenerate` therefore all fail with

```
NotSupportedError: CREATE TABLE 'alembic_version' has no VECTOR/SPARSEVEC column --
Milvus requires at least one vector field per collection.
```

raised client-side before any RPC. This is a Milvus limitation, surfaced as an explicit error rather
than papered over with a hidden pad column. (`milvusql-django` takes the opposite approach for its
own bookkeeping table — see
[Django → Schema & Migrations](../django/schema-and-migrations#what-create_model-does-not-do).)
:::

Migrations run without a wrapping transaction — Milvus has no multi-statement rollback (the same
reason `Connection.rollback()` and `do_rollback()` behave the way they do throughout this dialect), so
Alembic's `transactional_ddl` is `False` here rather than promising a rollback this backend can't
perform if a migration fails partway through.
