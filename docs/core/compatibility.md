---
sidebar_position: 5
---

# Compatibility

`milvusql` targets Milvus 2.6.x (including Milvus Lite) today. Milvus 3.0 is explicitly **not**
supported yet.

| milvusql | pymilvus | Milvus server | Status |
|---|---|---|---|
| 1.x | `>=2.6,<3` | 2.6.x | Tested — CI runs standalone via testcontainers |
| 1.x | `>=2.6,<3` | Milvus Lite | Tested — reads past 16384 rows raise `NotSupportedError` rather than truncate |
| 1.x | `3.0.x` | 3.0.x | **Not supported** |

## Why 3.0 isn't supported yet

Milvus 3.0 moves work into the engine that `milvusql` currently does on the client:

- **`ORDER BY`** gets a per-segment sort with merge-sort across query nodes, in-kernel.
- **`GROUP BY`** with `COUNT`/`SUM`/`AVG`/`MIN`/`MAX`, computed in-kernel — but only for a single
  collection.
- **`TEXT`** becomes a first-class field type, rather than an analyzer-enabled `VARCHAR`.

`milvusql` evaluates the first two client-side with [Polars](https://pola.rs) (see
[MilvusQL Concepts → JOIN, GROUP BY and subqueries](../getting-started/concepts)) and maps `TEXT`
onto an analyzer-enabled `VARCHAR(65535)` (see
[MilvusQL Concepts → Column types](../getting-started/concepts)). Delegating to the server where
3.0 supports it natively is tracked as future work.

Whether the 16384-row per-call ceiling still applies on 3.0 is unverified — the paging behavior
documented throughout these docs (transparent primary-key-cursor pages past that ceiling) is what
2.6.x and Milvus Lite do.

## What still requires the client-side engine, even on 3.0

Milvus — at 2.6.x and, as far as `milvusql` has verified, at 3.0 — never spans more than one
collection per RPC. `JOIN`s, subqueries, correlated `EXISTS`, and grouped aggregates **across
collections** stay planned into one Milvus read per collection with the relational part evaluated
client-side, regardless of server version. Only *single-collection* `ORDER BY`/`GROUP BY` moves
into the 3.0 kernel.
