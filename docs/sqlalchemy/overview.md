---
sidebar_position: 1
---

# Overview

`milvusql-sqlalchemy` registers a `"milvusql"` dialect with SQLAlchemy 2.0, built on the
[`milvusql`](../core/overview) DBAPI.

## Connecting

```python
from sqlalchemy import create_engine

# Milvus Lite -- a local file
engine = create_engine("milvusql:///items.db")          # relative path
engine = create_engine("milvusql:////abs/items.db")     # absolute path

# a real server
engine = create_engine("milvusql://root:Milvus@localhost:19530/default")
```

The Lite/server split follows the same convention SQLAlchemy's own `sqlite` dialect uses: no host
in the URL means the "database" part of the URL is a local file path, not a `db_name`. A username
and password in the URL are reassembled into Milvus's `token` parameter (which is itself a
`"user:password"` pair) rather than the password being forwarded alone.

## What works through Core, unmodified

Base SQLAlchemy `SELECT`/`INSERT`/`DELETE` rendering already matches MilvusQL — confirmed directly,
not assumed: `LIMIT n OFFSET m` and `CREATE INDEX name ON table (cols)` come out of the box exactly
as [`sqlglot-milvus`](https://github.com/Callix-Tools/sqlglot-milvus)'s grammar expects.

```python
from sqlalchemy import select, insert, MetaData, Table, Column, BigInteger, String
from milvusql_sqlalchemy.types import VECTOR

metadata = MetaData()
items = Table(
    "items", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("category", String(64)),
    Column("embedding", VECTOR(768)),
)
metadata.create_all(engine)

with engine.begin() as conn:
    conn.execute(insert(items), [{"category": "book", "embedding": [0.1] * 768}])
    rows = conn.execute(
        select(items.c.id, items.c.category)
        .order_by(items.c.embedding.l2_distance([0.1] * 768))
        .limit(5)
    ).all()
```

## What's genuinely new

| Piece | Where |
|---|---|
| `VECTOR`/`SPARSEVEC` types + distance comparators | [Types](./types) |
| `WITH (...)`/`USING <method>` DDL options | [DDL](./ddl) |
| Declarative `Mapped`/`mapped_column` models | [ORM Models](./orm-models) |
| `hybrid_search()` | [Hybrid Search](./hybrid-search) |
| `get_columns`/`get_indexes`/... reading Milvus's real schema API | [Reflection](./reflection) |
| `create_async_engine("milvusql+aio:///...")` | [Async Engine](./async-engine) |

Everything else — filtering, plain `SELECT`, `INSERT`, `DELETE`, `LIMIT`/`OFFSET` — is base
SQLAlchemy behavior, untouched.

## Transactions

`commit()`/`rollback()` at the SQLAlchemy engine level are no-ops (`do_rollback` specifically —
Milvus has no multi-statement rollback to perform, and SQLAlchemy's engine calls `do_rollback()` as
routine connection-pool bookkeeping, unrelated to a user actually asking to roll something back).
Calling `milvusql`'s own DBAPI `Connection.rollback()` *directly* still raises `NotSupportedError`
loudly — that guarantee lives one layer down, where a caller's intent is unambiguous.
