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

## `ALTER TABLE` — only `ADD FIELD`

Milvus can add a field to an existing collection. `ADD FIELD` also accepts the standard SQL
spelling, `ADD COLUMN` — both dispatch identically. It cannot change a field's type, change a
vector's dimension, drop a field, or rename the collection — `RENAME TO` parses (`sqlglot-milvus`
accepts the standard SQL grammar) but has no execution path and raises `NotSupportedError`.
Attempting a `DROP` is a `ParseError` explaining that the collection needs recreating — never a
silent no-op:

```
ALTER TABLE items DROP COLUMN category;
                   ^ ParseError: Milvus cannot DROP a field: only ADD FIELD and RENAME are
                     supported. Changing a field's type, changing a vector's dimension and
                     dropping a field require recreating the collection.
```

## Column types

| MilvusQL | Milvus field type | Notes |
|---|---|---|
| `BIGINT` / `INT` / `SMALLINT` / `TINYINT` | `INT64` / `INT32` / `INT16` / `INT8` | `PRIMARY KEY [AUTO_INCREMENT]` only on `BIGINT`/`VARCHAR` |
| `FLOAT` / `DOUBLE` / `BOOLEAN` / `JSON` | the matching scalar type | JSON paths filter server-side — see [Arrays and JSON](#arrays-and-json-filter-server-side) |
| `VARCHAR(n)` | `VARCHAR` | |
| `TEXT` | `VARCHAR(65535)` with `enable_analyzer` and `enable_match` on | full-text input — see [Full-text search](#full-text-search-bm25-and-match--against) |
| `ARRAY<T>(capacity)` | `ARRAY` | `T` must be one of the scalar types above (not another `ARRAY`, not a vector type); `capacity` defaults to 4096 if omitted |
| `VECTOR(dim)` | `FLOAT_VECTOR` | |
| `SPARSEVEC` | `SPARSE_FLOAT_VECTOR` | also the required type of a `GENERATED ALWAYS AS (BM25(text_col))` column |
| `BINARYVEC(dim)` / `FLOAT16VEC(dim)` / `BFLOAT16VEC(dim)` / `INT8VEC(dim)` | `BINARY_VECTOR` / `FLOAT16_VECTOR` / `BFLOAT16_VECTOR` / `INT8_VECTOR` | bind values as `bytes` / a numpy array of the matching dtype — passed through untouched |

Anything not in this table (a UUID type, `DECIMAL`, ...) is a `NotSupportedError` naming the type,
never a silent guess at the nearest Milvus equivalent. `DESCRIBE <table>` (see
[Introspection](#introspection-show-describe-databases-drop-index) below) prints a column back in
exactly this spelling for every type in this table **except `TEXT`**: a `TEXT` column is stored as
an analyzer-enabled `VARCHAR`, so `DESCRIBE` prints it as `VARCHAR(65535)` — re-running that
spelling gives a plain `VARCHAR` without `enable_analyzer`/`enable_match`, not the original `TEXT`
column.

## `JOIN`, `GROUP BY` and subqueries run through a client-side relational engine

Milvus reads one collection per RPC — it has no cross-collection join and no server-side grouping.
`milvusql` doesn't pretend otherwise: a statement that needs more than one collection, a grouped
aggregate, or a subquery is **planned** into one Milvus read per collection, and the relational part
(the join, `GROUP BY`/`HAVING`, ordering, window functions, set operations) is evaluated
client-side with [Polars](https://pola.rs).

```sql
SELECT c.title, COUNT(*) AS n, AVG(i.price) AS avg_price
FROM items AS i
JOIN categories AS c ON i.cat_id = c.id
WHERE i.price > :floor
GROUP BY c.title
HAVING COUNT(*) > 1
ORDER BY n DESC
LIMIT 10
```

What reaches Milvus, and what's evaluated client-side:

| Pushed to Milvus | Evaluated client-side |
|---|---|
| Every `WHERE` conjunct naming a single collection (`i.price > 20`) | Predicates spanning two collections (`i.price > c.budget`) |
| Only the columns the statement actually references (projection pushdown) | `JOIN` (`INNER`/`LEFT`/`RIGHT`/`FULL`/`CROSS`, `ON` or `USING`) |
| `ORDER BY <vector> <op> :q LIMIT k` as a real ANN `search` | `GROUP BY`, `HAVING`, aggregates, window functions |
| Equi-join keys learned from an earlier scan, pushed into the next one as `key in [...]` | `WITH` (CTEs), `UNION`/`INTERSECT`/`EXCEPT`, subqueries, scalar `ORDER BY`, `DISTINCT`, `LIMIT`/`OFFSET` |

Also supported through this engine: `ROW_NUMBER()`/`RANK()`/`DENSE_RANK()` and aggregate functions
`OVER (PARTITION BY ... [ORDER BY ...])` — top-*k*-per-group over a search's own hits, which an ANN
index cannot answer directly (the `ORDER BY` inside `OVER (...)` takes exactly one key; a composite
ordering such as `ORDER BY score DESC, id ASC` raises `NotSupportedError`); `WITH` CTEs (each visible
to the ones declared after it, same as SQL);
`UNION`/`UNION ALL`/`INTERSECT`/`EXCEPT` (not `INTERSECT ALL`/`EXCEPT ALL` — see below); and
`SELECT *`, including a qualified `t.*` and a star across a join, where it means what it says —
each side is asked for
`output_fields=["*"]`, so every field of every collection comes back, **vectors included**. Naming
the columns is the difference between moving a few scalars and moving every embedding.

The key pushdown is what keeps this usable: an ANN search returning 50 hits joined against a
million-row collection reads 50 rows from it, not a million.

Three things worth knowing before relying on this:

- **`ORDER BY <vector> ... LIMIT k` in a joined query means "Milvus's top-k from *that* collection,
  then join"** — not "top-k of the joined result." The two only differ when the join or a
  cross-collection predicate drops rows; ranking after the join would mean reading the whole vector
  collection, the one thing an ANN index exists to avoid.
- **Columns must be unambiguous.** With more than one collection in scope, a bare column name
  raises `ProgrammingError` asking you to qualify it with its table — output fields are requested
  from Milvus before any row comes back, so there's no schema at that point to resolve a bare name
  against.
- **A wrapping subquery with none of its own `JOIN`/`GROUP BY`/`ORDER BY`/`LIMIT`/`DISTINCT`** — the
  shape `Session.query(Model).filter(...).count()` produces — is still flattened and executed as a
  single read; only a subquery that would actually change which rows or how many reach the outer
  query needs this engine.

Correlated `[NOT] EXISTS` — what SQLAlchemy's `.any()`/`.has()` and Django's
`Exists(... OuterRef(...))` compile to — is decorrelated into a semi/anti join rather than rejected,
provided the correlation is a plain equality; SQL's own `NULL` semantics are kept (a null key never
matches `EXISTS`, always survives `NOT EXISTS`).

Not supported, and rejected by name rather than mistranslated or silently wrong:

- **Correlated subqueries beyond `EXISTS` equality** — a correlated scalar annotation (Django's
  `Subquery(... OuterRef(...))` in the `SELECT` list) or a non-equi `EXISTS` correlation. The error
  names the outer table the subquery references.
- **`WITH RECURSIVE`** (re-reads until a fixpoint), **`INTERSECT ALL`/`EXCEPT ALL`**
  (duplicate-count semantics a semi/anti join can't express), **window frame clauses**
  (`ROWS`/`RANGE BETWEEN`), **`LAG`/`LEAD`/`NTILE`**, **`JOIN ... USING` past two sources** (no
  schema at translate time says which already-joined side owns the key), and **`SELECT *` inside a
  subquery that joins** (two collections can own the same column name, and nothing at translate
  time says which).

Anything that doesn't need any of this — a filter `SELECT`, a vector search, a hybrid search, a bare
`COUNT(*)` — is still exactly one RPC and never builds a DataFrame.

## `ORDER BY`/aggregates on a plain column run client-side, and now page past the row ceiling

`ORDER BY <vector column> <op> :q` is a real Milvus ANN search — it runs server-side. `ORDER BY` on
an ordinary scalar column, and every aggregate (`SUM`/`AVG`/`MIN`/`MAX`/`COUNT(<column>)`, everything
but a bare `COUNT(*)`), have no Milvus RPC equivalent: `milvusql` fetches every row the `WHERE`
filter matches and sorts or reduces it in Python.

Milvus's own `query`/`search` RPCs cap a single call at 16384 rows. **A read that hits that ceiling
no longer raises** — it continues with primary-key-cursor pages, the same `iterator` protocol
`pymilvus`'s own `QueryIterator` speaks, so a join, a grouped aggregate, a client-side `ORDER BY`,
an `UPDATE`, or a bare `SELECT` with no `LIMIT` all cover *every* matching row, on both the sync and
async cursors. No snapshot spans the pages — a row written between two pages may or may not appear,
exactly as with `pymilvus`'s own iterator.

:::warning Milvus Lite doesn't order iterator pages
Milvus Lite's `query` ignores the `iterator` flag and returns rows in arbitrary order, so paging
past the ceiling there would silently lose rows. `milvusql` checks that every page it reads is
actually primary-key-ordered, and raises rather than continuing silently when it isn't:

```
SELECT category FROM items ORDER BY category LIMIT 10
# NotSupportedError: cannot read past Milvus's per-call row ceiling (16384): this
# server does not return primary-key-ordered pages for iterator reads (Milvus Lite
# does not), so paging through the remaining rows would silently skip some. Narrow
# the WHERE filter, or run against a full Milvus server.
```

This is the one server where the ceiling is still a hard stop — everywhere else on this page holds
unchanged.
:::

## Arrays and JSON filter server-side

`ARRAY<T>(capacity)` and `JSON` columns both filter server-side, translated into Milvus's own
filter-expression syntax rather than evaluated client-side:

```sql
SELECT id FROM items WHERE meta['brand']['name'] = :name

SELECT id FROM items WHERE ARRAY_CONTAINS(tags, :tag)
SELECT id FROM items WHERE ARRAY_CONTAINS_ALL(tags, :tags)
SELECT id FROM items WHERE ARRAY_CONTAINS_ANY(tags, :tags)
SELECT id FROM items WHERE ARRAY_LENGTH(tags) > :n

SELECT id FROM items WHERE JSON_CONTAINS(meta, :v)
SELECT id FROM items WHERE JSON_CONTAINS_ALL(meta, :v)
SELECT id FROM items WHERE JSON_CONTAINS_ANY(meta, :v)
```

`meta['a']['b']` (bracket-path access, chained for nested JSON) and array-element access both use
the same bracket syntax Milvus's filter DSL itself uses, so it renders structurally rather than as
passed-through text.

`TEXT_MATCH(field, "words")` and `PHRASE_MATCH(field, "phrase")` are also available directly as
filter functions — `MATCH ... AGAINST` below is `TEXT_MATCH` under SQL-standard syntax.

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
MilvusQL these three characters mean cosine distance and nothing else — generating MilvusQL from a
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

One or more arms, each optionally weighted, reranked by a strategy — `RRF` (optionally
`RRF(k=...)`, default `k=60`) or `WEIGHTED` (uses each arm's `WEIGHT`); any other name is a
`NotSupportedError`. It sits where `ORDER BY` would in an ordinary vector search — it *is* the
ranking criterion, just for more than
one vector. `BM25_SCORE(...)` (see [Full-text search](#full-text-search-bm25-and-match--against)
below) can be one of the arms, fusing a dense vector search with full-text relevance.

## Consistency level

```sql
SELECT id FROM items ORDER BY embedding <-> :q LIMIT 10 CONSISTENCY LEVEL Bounded
```

Milvus has no transaction isolation levels — it has *read* consistency levels (`Strong`, `Bounded`,
`Session`, `Eventually`, `Customized`), answering the same question ("how stale may the data I see
be?") with a different vocabulary. A query's own `CONSISTENCY LEVEL` clause wins over a
connection-level default on a vector search and on anything routed through the relational engine —
see [Core → Consistency Level](../core/consistency-level) for the precedence details and the
gap (plain filter `SELECT`, scalar `ORDER BY`, bare aggregates, and `HYBRID SEARCH`).

## Clause order is strict

The canonical order is:

```
HYBRID SEARCH ... LIMIT [OFFSET] SEARCH PARAMS ... CONSISTENCY LEVEL ...
```

`HYBRID SEARCH` must precede `LIMIT`/`OFFSET`; `SEARCH PARAMS` and `CONSISTENCY LEVEL` must follow
them; `SEARCH PARAMS` must precede `CONSISTENCY LEVEL`. Out-of-order clauses are a `ParseError`,
not a silent reordering — `sqlglot`'s modifier loop has no positional state and would otherwise
accept the wrong order and emit it back reordered, silently changing what the query does.

## Full-text search: BM25 and `MATCH ... AGAINST`

A `TEXT` column is Milvus's full-text input (see [Column types](#column-types) above). Pair it with
a `SPARSEVEC` column generated from it, and Milvus computes the BM25 sparse vector server-side:

```sql
CREATE TABLE docs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    content TEXT,
    content_sparse SPARSEVEC GENERATED ALWAYS AS (BM25(content)),
    embedding VECTOR(768)
);

CREATE INDEX idx_fts ON docs (content_sparse)
USING SPARSE_INVERTED_INDEX WITH (metric_type='BM25');
```

`BM25(<column>)` is the one generated-column expression Milvus computes server-side (both
`GENERATED ALWAYS AS (...)` and the shorter `AS (...)` parse identically) — anything else in that
position is a `NotSupportedError` naming the expression, and the generated column itself must be
declared `SPARSEVEC`.

**Keyword filtering** — `MATCH(text) AGAINST (:q)` renders to Milvus's own `TEXT_MATCH(field,
"words")` filter function:

```sql
SELECT id, content FROM docs WHERE MATCH(content) AGAINST (:q)
```

**BM25-ranked retrieval** — `BM25_SCORE(sparse_col, :q)` runs as a real Milvus `search` against the
generated sparse field with `metric_type='BM25'` and the query text as the search data:

```sql
SELECT id, content FROM docs
ORDER BY BM25_SCORE(content_sparse, :q) DESC
LIMIT 10
```

## Introspection: `SHOW`, `DESCRIBE`, databases, `DROP INDEX`

```sql
SHOW TABLES;      -- list_collections()
SHOW DATABASES;   -- list_databases()
```

Only the bare forms are supported — a qualifier like `SHOW TABLES LIKE 'x%'` or
`SHOW TABLES FROM other` raises `NotSupportedError` naming it, rather than silently dropping the
qualifier and returning the current database's full, unfiltered listing.

```sql
DESCRIBE docs;
```

Reads Milvus's own `describe_collection` and prints each column in exactly the spelling documented
in [Column types](#column-types) above, including a generated BM25 column (called out in its own
`Extra` cell as `generated by BM25(content)`) — so `DESCRIBE`'s output round-trips into a
`CREATE TABLE` statement unchanged, with the `TEXT`/`VARCHAR(65535)` exception noted above.

```sql
CREATE DATABASE tenant_a;
USE tenant_a;
DROP DATABASE tenant_a;
DROP INDEX idx_fts ON docs;
```

`DROP INDEX` needs the collection — Milvus scopes index names to a collection, so a bare
`DROP INDEX idx` (which the grammar parses) is a `ProgrammingError` asking for the `ON <table>`.

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
