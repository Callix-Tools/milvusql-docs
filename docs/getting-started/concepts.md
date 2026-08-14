---
sidebar_position: 3
---

# MilvusQL Concepts

MilvusQL is the SQL-like language [`sqlglot-milvus`](https://github.com/Callix-Tools/sqlglot-milvus)
parses and generates, and the text every layer of `milvusql` ultimately round-trips through. This
page covers the parts of the language that aren't obvious from ordinary SQL.

## Entities are called `TABLE`, not `COLLECTION`

`CREATE TABLE` / `DROP TABLE` / `LOAD TABLE` / `RELEASE TABLE` — the SQL surface uses the ordinary
SQL word. "Collection" remains the term one level down, in the `pymilvus` calls the AST is
translated into (`client.create_collection(...)`, `client.load_collection(...)`, ...).

## `ALTER TABLE` — only `ADD FIELD` and `RENAME TO`

Milvus can add a field to an existing collection or rename the collection itself
(`ALTER TABLE items RENAME TO new_items`). `ADD FIELD` also accepts the standard SQL spelling,
`ADD COLUMN` — both dispatch identically. It cannot change a field's type, change a vector's
dimension, or drop a field. Attempting any of those is a `ParseError` explaining that the
collection needs recreating — never a silent no-op:

```
ALTER TABLE items DROP COLUMN category;
                   ^ ParseError: Milvus cannot DROP a field: only ADD FIELD and RENAME are
                     supported. Changing a field's type, changing a vector's dimension and
                     dropping a field require recreating the collection.
```

## `JOIN` and `GROUP BY` are rejected, not silently wrong

Milvus has no cross-collection join and no server-side grouping. Both parse — MilvusQL's grammar is
otherwise ordinary SQL — but are rejected at translation time with a `NotSupportedError` naming the
clause, rather than being silently dropped or executed against the wrong rows:

```
SELECT a.id FROM a JOIN b ON a.id = b.id
                    ^ NotSupportedError: JOIN is not supported: Milvus has no cross-collection join

SELECT category, COUNT(*) FROM items GROUP BY category
                                      ^ NotSupportedError: GROUP BY is not supported
```

A wrapping subquery with no `JOIN`/`GROUP BY`/`ORDER BY`/`LIMIT`/`DISTINCT` of its own — the shape
`Session.query(Model).filter(...).count()` produces — is still flattened and executed normally; only
a subquery that would actually change which rows or how many reach the outer query is affected.

## Ordering or aggregating by a plain column runs client-side

`ORDER BY <vector column> <op> :q` is a real Milvus ANN search — it runs server-side. `ORDER BY` on
an ordinary scalar column, and every aggregate (`SUM`/`AVG`/`MIN`/`MAX`/`COUNT(<column>)`, everything
but a bare `COUNT(*)`) have no Milvus RPC equivalent: `milvusql` fetches every row the `WHERE` filter
matches (up to Milvus's own per-call ceiling of 16384 rows) and sorts or reduces it in Python.

If the `WHERE` filter itself matches at least that many rows, the true sort order or aggregate can no
longer be verified over every matching row — rather than silently compute it over a truncated,
arbitrary subset, `milvusql` raises `NotSupportedError` asking for a narrower filter:

```
SELECT category FROM items ORDER BY category LIMIT 10
# NotSupportedError: ORDER BY cannot be honored: the WHERE filter matches at least
# Milvus's own per-call row ceiling (16384), so the true sort order across every
# matching row cannot be verified. Narrow the WHERE filter to match fewer rows.
```

## Distance operators

Spelled exactly as [pgvector](https://github.com/pgvector/pgvector) spells them, so a pgvector
query needs no rewriting to become MilvusQL:

| Operator | Metric | Milvus `metric_type` |
|---|---|---|
| `<->` | L2 / Euclidean | `L2` |
| `<#>` | inner product | `IP` |
| `<=>` | cosine | `COSINE` |
| `<+>` | L1 / Manhattan | `L1` |

:::warning `<=>` collides with MySQL
MySQL spells null-safe equality `<=>`; MilvusQL spells cosine distance the same way. Inside
MilvusQL these four characters mean cosine distance and nothing else — generating MilvusQL from a
MySQL `NullSafeEQ` node reports an unsupported-operation error instead of silently emitting `<=>`.
:::

## Bind parameters: `:name`

```sql
SELECT id FROM items WHERE category = :cat ORDER BY embedding <-> :q LIMIT 10
```

Vectors travel as bind parameters and are **never** interpolated into query text — a 768-float
embedding is tens of kilobytes of SQL, and round-tripping the numbers through text risks precision
loss. `milvusql`'s DBAPI declares `paramstyle = "named"` for exactly this spelling.

## Hybrid search

```sql
SELECT id FROM items
HYBRID SEARCH (
    embedding <=> :dense_q WEIGHT 0.7,
    sparse_emb <#> :sparse_q WEIGHT 0.3
)
RERANK RRF(k=60)
LIMIT 10
```

One or more arms, each optionally weighted, reranked by a strategy (`RRF`, or others Milvus
supports). It sits where
`ORDER BY` would in an ordinary vector search — it *is* the ranking criterion, just for more than
one vector.

## Consistency level

```sql
SELECT id FROM items ORDER BY embedding <-> :q LIMIT 10 CONSISTENCY LEVEL Bounded
```

Milvus has no transaction isolation levels — it has *read* consistency levels (`Strong`, `Bounded`,
`Session`, `Eventually`, `Customized`), answering the same question ("how stale may the data I see
be?") with a different vocabulary. A query's own `CONSISTENCY LEVEL` clause always wins over a
connection-level default (see [Core → Consistency Level](../core/consistency-level)).

## Clause order is strict

The canonical order is:

```
HYBRID SEARCH ... LIMIT [OFFSET] SEARCH PARAMS ... CONSISTENCY LEVEL ...
```

`HYBRID SEARCH` must precede `LIMIT`/`OFFSET`; `SEARCH PARAMS` and `CONSISTENCY LEVEL` must follow
them; `SEARCH PARAMS` must precede `CONSISTENCY LEVEL`. Out-of-order clauses are a `ParseError`,
not a silent reordering — `sqlglot`'s modifier loop has no positional state and would otherwise
accept the wrong order and emit it back reordered, silently changing what the query does.

## Full-text search syntax parses, but doesn't execute yet

MilvusQL's grammar (via `sqlglot-milvus`) also recognizes `MATCH(text) AGAINST (:q)` in a `WHERE`
clause and `BM25_SCORE(text, :q)` for ranking — the language covers full-text search as well as
vector and hybrid search. `milvusql`'s translation layer doesn't implement either yet, though: a
`MATCH ... AGAINST` filter raises `NotSupportedError: unsupported filter expression: MatchAgainst`
at execution time, and `BM25_SCORE` has no dispatch path at all. Don't reach for this syntax against
a live connection until it lands — parsing successfully isn't a signal that `cursor.execute()` will.

## Migrating from pgvector

```python
import sqlglot

sqlglot.transpile(
    "SELECT id FROM items ORDER BY embedding <-> %(q)s LIMIT 5",
    read="postgres", write="milvus",
)
# ['SELECT id FROM items ORDER BY embedding <-> :q LIMIT 5']
```

Use psycopg's **`pyformat`** (`%(name)s`) source queries where you can — those carry a name and
land directly on MilvusQL's `:name`. The positional `format` style (`%s`) transpiles to `?`, which
parses but can never actually be bound (`milvusql`'s paramstyle is `named`) — give the parameter a
name before or after transpiling.
