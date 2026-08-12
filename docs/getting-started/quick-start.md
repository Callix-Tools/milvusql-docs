---
sidebar_position: 2
---

# Quick Start

This walks through the core DBAPI directly against [Milvus Lite](https://milvus.io/docs/milvus_lite.md)
— no server to stand up. The same statements work unchanged against a real Milvus deployment; only
the `uri` passed to `connect()` changes (see [Core → Overview](../core/overview)).

## Connect

```python
import milvusql

conn = milvusql.connect(uri="./quickstart.db")  # a local file = Milvus Lite
cur = conn.cursor()
```

## Create a collection

```python
cur.execute("""
    CREATE TABLE items (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        embedding VECTOR(8),
        category VARCHAR(64)
    ) WITH (shards=1, consistency_level='Bounded')
""")

cur.execute("""
    CREATE INDEX idx_emb ON items (embedding) USING HNSW
    WITH (metric_type='COSINE', M=16, ef_construction=200)
""")

cur.execute("LOAD TABLE items")
```

`id` is `BIGINT` (Milvus's primary key must be `INT64` or `VARCHAR`) and is created *before* the
index — Milvus needs an index on a vector field before the collection can be loaded and searched.

## Insert

Vectors are bind parameters, never inlined into the SQL text:

```python
cur.execute(
    "INSERT INTO items (embedding, category) VALUES (:emb, :cat)",
    {"emb": [0.1] * 8, "cat": "book"},
)
cur.execute(
    "INSERT INTO items (embedding, category) VALUES (:emb, :cat)",
    {"emb": [0.9] * 8, "cat": "movie"},
)
```

## Search

```python
cur.execute(
    """
    SELECT id, category FROM items
    WHERE category = :cat
    ORDER BY embedding <-> :q
    LIMIT 5
    SEARCH PARAMS (ef_search=64)
    """,
    {"cat": "book", "q": [0.1] * 8},
)
print(cur.fetchall())
# [(1, 'book')]
```

`<->` is L2 distance, spelled exactly as [pgvector](https://github.com/pgvector/pgvector) spells
it — see [MilvusQL Concepts](./concepts) for the full operator table.

## Delete

```python
cur.execute("DELETE FROM items WHERE category = :cat", {"cat": "movie"})
print(cur.rowcount)  # 1
```

## The same thing, async

```python
import asyncio
from milvusql import aio

async def main():
    conn = aio.connect(uri="./quickstart.db")
    cur = conn.cursor()
    await cur.execute("SELECT id, category FROM items LIMIT 5")
    print(await cur.fetchall())
    await conn.close()

asyncio.run(main())
```

`milvusql.aio` isn't PEP 249 (a coroutine can't be, by definition) — it's a separate, asyncio-native
surface built over `pymilvus.AsyncMilvusClient` and the exact same dispatch table as the sync
`Cursor`. See [Core → Sync and Async](../core/sync-and-async).

## Next steps

- [MilvusQL Concepts](./concepts) — the language itself: operators, bind params, clause order
- [SQLAlchemy](../sqlalchemy/overview) — if you'd rather work through Core/ORM
- [Django](../django/overview) — if you're wiring this into a Django project
