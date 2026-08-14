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

## Loading a collection

`LOAD TABLE`/`RELEASE TABLE` have no `Table`/`Index`-level equivalent to attach kwargs to — issue
them directly:

```python
with engine.begin() as conn:
    conn.exec_driver_sql("LOAD TABLE items")
```

## Alembic

Installing `alembic` alongside `milvusql-sqlalchemy` is enough — importing the dialect registers a
`milvusql`-specific `DefaultImpl` with Alembic automatically, no separate setup call needed. Ordinary
`alembic revision --autogenerate` / `alembic upgrade` / `alembic downgrade` work against a `milvusql`
engine the same way they do against any other dialect, compiling down to the same `CREATE TABLE`/
`ADD FIELD` DDL described above.

Migrations run without a wrapping transaction — Milvus has no multi-statement rollback (the same
reason `Connection.rollback()` and `do_rollback()` behave the way they do throughout this dialect), so
Alembic's `transactional_ddl` is `False` here rather than promising a rollback this backend can't
perform if a migration fails partway through.
