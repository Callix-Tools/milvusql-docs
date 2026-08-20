---
sidebar_position: 7
---

# Async Engine

`milvusql-sqlalchemy` registers a second dialect, `"milvusql+aio"`, for
[`create_async_engine`](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html). It wraps
[`milvusql.aio`](../core/sync-and-async) (built on `pymilvus.AsyncMilvusClient`) rather than the sync
DBAPI — a genuinely async network path, not a thread-pooled sync one.

## Connecting

```python
from sqlalchemy.ext.asyncio import create_async_engine

# Milvus Lite -- a local file
engine = create_async_engine("milvusql+aio:///items.db")

# a real server
engine = create_async_engine("milvusql+aio://root:Milvus@localhost:19530/default")
```

Same URL rules as the sync `"milvusql"` dialect (Lite vs. server, `user:password` → `token`) — only
the scheme's driver suffix (`+aio`) changes.

## Usage

Everything reachable through `AsyncConnection`/`AsyncSession` works normally:

```python
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

async def main():
    engine = create_async_engine("milvusql+aio:///items.db")

    async with engine.begin() as conn:
        await conn.execute(text(
            "CREATE TABLE items (id INT64 PRIMARY KEY, category VARCHAR(64), "
            "embedding VECTOR(768))"
        ))
        await conn.execute(text("LOAD TABLE items"))

    async with engine.begin() as conn:
        await conn.execute(
            text("INSERT INTO items (id, category, embedding) VALUES (:id, :category, :embedding)"),
            {"id": 1, "category": "book", "embedding": [0.1] * 768},
        )

    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT id, category FROM items"))
        print(result.fetchall())

    await engine.dispose()

asyncio.run(main())
```

`AsyncSession` (the ORM async surface, including `Mapped`/`mapped_column` declarative models from
[ORM Models](./orm-models)) works the same way any other async dialect does — nothing
`milvusql`-specific to know beyond connecting through `milvusql+aio`.

## What makes this work, briefly

`milvusql.aio.AsyncConnection`/`AsyncCursor` are adapted onto SQLAlchemy's own
`AsyncAdapt_dbapi_connection` — the same generic bridge `asyncmy`'s and `asyncpg`'s dialects use — so
no custom connection/cursor subclass was needed. Two details worth knowing if something looks
surprising:

- The pool defaults to `AsyncAdaptedQueuePool` (SQLAlchemy's `QueuePool` cannot back an async engine —
  every async dialect sets this explicitly, `milvusql+aio` included).
- `do_rollback` is a no-op at this layer for the same reason as the sync dialect (see
  [Transactions](./overview#transactions)) — Milvus has no multi-statement rollback to perform.
