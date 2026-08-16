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

## `JOIN`, `GROUP BY`, subqueries and correlated `EXISTS`

None of this needed dialect-side work — it's inherited from the DBAPI's relational engine (see
[MilvusQL Concepts](../getting-started/concepts#join-group-by-and-subqueries-run-through-a-client-side-relational-engine)),
which plans a statement that needs more than one collection, a grouped aggregate, or a subquery
into one Milvus read per collection and evaluates the rest client-side with Polars. The ordinary
Core/ORM constructs that compile down to this now run:

```python
select(Item.id, func.count()).select_from(Item).join(Category, Item.category_id == Category.id) \
    .group_by(Category.title).having(func.count() > 1)

select(Category.id).where(Category.items.any(Item.price > 20))   # correlated EXISTS
```

`.join()`/`.outerjoin()`, `.group_by()`/`.having()`, `col.in_(select(...))`, and relationship
`.any()`/`.has()` (decorrelated into a semi/anti join) all plan through it; `Query.count()` stays a
server-side `count(*)` with no rows fetched. What's rejected — a correlated subquery beyond `EXISTS`
equality, `WITH RECURSIVE`, `INTERSECT ALL`/`EXCEPT ALL`, window frame clauses, `LAG`/`LEAD`/`NTILE`
— is documented in [Concepts](../getting-started/concepts) alongside everything that *is* supported
(window functions, CTEs, `UNION`/`INTERSECT`/`EXCEPT`, `SELECT *` across a join).

## Full-text search

A `sa.Text` column is Milvus's analyzer-enabled full-text input, no dialect-specific type needed —
pair it with a `SPARSEVEC` column and SQLAlchemy's own `Computed()` for the BM25-generated field,
and rank with a plain `func.BM25_SCORE(...)`:

```python
from sqlalchemy import BigInteger, Column, Computed, Table, Text, func, select
from milvusql_sqlalchemy.types import SPARSEVEC, VECTOR

docs = Table(
    "docs", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("content", Text),
    Column("content_sparse", SPARSEVEC(), Computed("BM25(content)")),
    Column("embedding", VECTOR(768)),
)

select(docs.c.content).order_by(
    func.BM25_SCORE(docs.c.content_sparse, "vector similarity search").desc()
).limit(2)
```

`MATCH(...) AGAINST (...)` has no `Comparator` method of its own — reach for `text()`/
`exec_driver_sql()` for the raw filter form. See
[Concepts → Full-text search](../getting-started/concepts#full-text-search-bm25-and-match--against)
for what `TEXT`/`BM25_SCORE`/`MATCH ... AGAINST` do at the MilvusQL level.

## Transactions

`commit()`/`rollback()` at the SQLAlchemy engine level are no-ops (`do_rollback` specifically —
Milvus has no multi-statement rollback to perform, and SQLAlchemy's engine calls `do_rollback()` as
routine connection-pool bookkeeping, unrelated to a user actually asking to roll something back).
Calling `milvusql`'s own DBAPI `Connection.rollback()` *directly* still raises `NotSupportedError`
loudly — that guarantee lives one layer down, where a caller's intent is unambiguous.
