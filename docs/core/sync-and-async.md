---
sidebar_position: 2
---

# Sync and Async

`milvusql` ships both from the start — not a sync client with async bolted on later. Both are built
on the same `translate.ast_to_pymilvus.build_call()` dispatch table and the same error-translation
layer; the only thing that differs between them is two lines at the call site (`await`, or not).

## Why async is a separate surface, not `async def execute()`

[PEP 249](https://peps.python.org/pep-0249/) has no async variant, by definition — `Cursor.execute()`
is a synchronous method, full stop. `milvusql.aio` is a deliberately separate, explicitly
asyncio-native pair of classes (`AsyncConnection`, `AsyncCursor`), not a second personality bolted
onto `Cursor`.

## Sync

```python
import milvusql

conn = milvusql.connect(uri="./items.db")
cur = conn.cursor()
cur.execute("SELECT id FROM items LIMIT 5")
rows = cur.fetchall()
conn.close()
```

Backed by `pymilvus.MilvusClient`.

## Async

```python
from milvusql import aio

conn = aio.connect(uri="./items.db")
cur = conn.cursor()
await cur.execute("SELECT id FROM items LIMIT 5")
rows = await cur.fetchall()
await conn.close()
```

Backed by `pymilvus.AsyncMilvusClient` — native asyncio (available since `pymilvus` 2.5.3), not a
thread-pool wrapper around the sync client. For a client whose only job is round-tripping gRPC
calls to a network service, that's a real, already-common shape (the same reason `psycopg` and
`asyncpg` both exist for Postgres) — a natural fit for FastAPI/RAG-style backends.

## What's shared, concretely

| Piece | Shared between sync and async? |
|---|---|
| `translate.ast_to_pymilvus.build_call()` — AST → "what to call" | Yes, verbatim |
| `dbapi.errors.translate()` — exception mapping | Yes, verbatim |
| The `sqlglot.parse_one()` result cache | Yes, verbatim |
| `Connection`/`AsyncConnection`, `Cursor`/`AsyncCursor` classes | No — one sync, one async, same shape |

`build_call()` never calls the network-touching `pymilvus` method itself — it returns a small
`Call(method, kwargs, postprocess)` describing what to call. `Cursor.execute()` calls it directly;
`AsyncCursor.execute()` awaits it. Neither implementation needs to know the other exists.
