---
sidebar_position: 4
---

# Consistency Level

Milvus has no transaction isolation levels. It has *read* consistency levels — `Strong`, `Bounded`,
`Session`, `Eventually` — answering the same question ("how stale may the data I see be?") with a
different vocabulary.

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

Applied only when a `search`/`query` statement doesn't set its own `CONSISTENCY LEVEL`. `CREATE
TABLE`, `INSERT`, `DELETE`, and friends don't take a consistency level at all — the fallback only
applies to the two calls that read data.

## In SQLAlchemy

The same connection-level default rides SQLAlchemy's `isolation_level` extension point:

```python
with engine.connect().execution_options(isolation_level="Strong") as conn:
    ...
```

This is a deliberate, understood reuse of an extension point built for a different vocabulary (SQL's
five isolation levels) — SQLAlchemy itself never validates the value against that fixed set at
runtime, it only round-trips whatever `set_isolation_level()` stored. See
[SQLAlchemy → Overview](../sqlalchemy/overview) for the rest of the dialect.
