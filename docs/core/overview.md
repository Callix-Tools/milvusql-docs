---
sidebar_position: 1
---

# Overview

`milvusql` is the PEP 249 layer everything else in this project is built on. It owns three things:

1. **The DBAPI surface** — `connect()`, `Cursor`, the module-level `apilevel`/`threadsafety`/`paramstyle`
   attributes every DBAPI module is expected to expose.
2. **The dispatch table** — `translate.ast_to_pymilvus`, one function turning a parsed MilvusQL AST
   into "what to call on a `pymilvus` client." Shared, unchanged, by the sync `Cursor` and the async
   `aio` client.
3. **The error hierarchy** — the full PEP 249 exception tree, and the translation from `sqlglot`/
   `pymilvus`/`grpc` exceptions onto it (see [Errors](./errors)).

## Connecting

```python
import milvusql

# Milvus Lite -- a local file, embedded, no server
conn = milvusql.connect(uri="./items.db")

# a real server
conn = milvusql.connect(
    uri="http://localhost:19530",
    token="root:Milvus",       # or user="root", password="Milvus"
    db_name="default",
)
```

Every keyword `pymilvus.MilvusClient` accepts passes straight through `connect()` — this layer
doesn't reinvent Milvus's own connection parameters.

## Executing

```python
cur = conn.cursor()
cur.execute("SELECT id FROM items WHERE category = :cat LIMIT 10", {"cat": "book"})
rows = cur.fetchall()
```

`Cursor` implements the usual PEP 249 surface: `execute`, `executemany`, `fetchone`, `fetchmany`,
`fetchall`, `description`, `rowcount`, `lastrowid` (populated from Milvus's `auto_id`-assigned
primary key after an `INSERT` — the standard `sqlite3`/`MySQLdb` convention), and iteration.

## What it does *not* do

- **No implicit `LOAD TABLE`.** Searching an unloaded collection raises `ProgrammingError` naming
  the collection, rather than silently loading it — that's a potentially slow operation an
  innocuous-looking `SELECT` shouldn't trigger behind your back.
- **No real transactions.** `commit()` is a no-op (every mutation is already applied the moment
  `pymilvus` returns); `rollback()` raises `NotSupportedError` — Milvus has no multi-statement
  rollback, and a silent no-op here would read as "rolled back" to code that trusts it.
- **No `ALTER TABLE` beyond `ADD FIELD`.** Enforced at the MilvusQL parser level
  ([`sqlglot-milvus`](https://github.com/Callix-Tools/sqlglot-milvus)), not here.

## Beyond a single collection

`JOIN`, `GROUP BY`, `HAVING`, subqueries, window functions, CTEs, set operations and correlated
`EXISTS` all execute too — `translate.ast_to_pymilvus` routes anything that needs more than one
Milvus read into a second dispatch table, `translate.relational`, which plans one read per
collection and evaluates the rest client-side with [Polars](https://pola.rs). See
[MilvusQL Concepts](../getting-started/concepts#join-group-by-and-subqueries-run-through-a-client-side-relational-engine)
for what's pushed to Milvus versus evaluated client-side, and what's still rejected by name
(`WITH RECURSIVE`, `INTERSECT ALL`/`EXCEPT ALL`, window frame clauses, ...).

Full-text search (`TEXT` columns, `BM25_SCORE`, `MATCH ... AGAINST`), `ARRAY`/`JSON` filter
functions, and introspection (`SHOW TABLES`/`SHOW DATABASES`, `DESCRIBE`, `CREATE`/`DROP DATABASE`,
`USE`, `DROP INDEX`) are ordinary statements through the same `Cursor.execute()` — nothing at the
DBAPI surface changes to support them. See [MilvusQL Concepts](../getting-started/concepts) for the
full language reference.

## Next

- [Sync and Async](./sync-and-async) — the same dispatch table, two call-site layers
- [Errors](./errors) — the PEP 249 hierarchy and what maps to what
- [Consistency Level](./consistency-level) — query-level vs. connection-level defaults
