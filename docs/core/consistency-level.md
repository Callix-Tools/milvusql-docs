---
sidebar_position: 4
---

# Consistency Level

Milvus has no transaction isolation levels. It has *read* consistency levels — `Strong`, `Bounded`,
`Session`, `Eventually`, `Customized` — answering the same question ("how stale may the data I see
be?") with a different vocabulary.

## Query-level: the `CONSISTENCY LEVEL` clause

```python
cur.execute("""
    SELECT id FROM items
    ORDER BY embedding <-> :q
    LIMIT 10
    CONSISTENCY LEVEL Bounded
""", {"q": query_vector})
```

This always wins — it's checked directly in `Cursor.execute()`/`AsyncCursor.execute()` before any
connection-level default is considered.

## Connection-level default

```python
conn = milvusql.connect(uri="./items.db", consistency_level="Session")
```

Applied only when a `search`/`query`/`hybrid_search` statement doesn't set its own
`CONSISTENCY LEVEL`. `INSERT`, `DELETE`, and friends don't take a consistency level at all — the
fallback only applies to the three calls that read data.

`CREATE TABLE ... WITH (consistency_level=...)` is a separate, third mechanism: it sets the
*collection's own* default consistency level, passed straight through to
`MilvusClient.create_collection(...)`, and is independent of both the query-level clause and the
connection-level fallback described here.

## In SQLAlchemy

The same connection-level default rides SQLAlchemy's `isolation_level` extension point:

```python
with engine.connect().execution_options(isolation_level="Strong") as conn:
    ...
```

This is a deliberate, understood reuse of an extension point built for a different vocabulary (SQL's
five isolation levels) — SQLAlchemy itself never validates the value against that fixed set at
runtime, it only round-trips whatever `set_isolation_level()` stored. `milvusql-sqlalchemy` does its
own validation instead, against exactly the five title-case Milvus consistency levels above —
`isolation_level="strong"` or any other spelling `pymilvus`'s case-sensitive lookup wouldn't accept
raises `sqlalchemy.exc.ArgumentError` at the point it's set, not a confusing failure deep inside the
next query. See [SQLAlchemy → Overview](../sqlalchemy/overview) for the rest of the dialect.
