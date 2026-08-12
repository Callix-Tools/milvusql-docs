---
sidebar_position: 4
---

# Hybrid Search

`hybrid_search()` is the one genuinely new Core-level construct this dialect adds.

## Why a function, not a `Comparator` method

Hybrid search takes two or more weighted arms — there's no single column to hang a method call on
the way `l2_distance`/`cosine_distance` (see [Types](./types)) hang off one.

## Why `.order_by(hybrid_search(...))`, not `.where(...)`

In MilvusQL's own grammar, `HYBRID SEARCH ... RERANK ...` sits exactly where `ORDER BY` would in a
plain vector search — it *is* the ranking criterion, just for more than one vector. The compiler's
`order_by_clause` override renders it there directly, without the literal `ORDER BY` keyword
MilvusQL doesn't use for this clause.

## Usage

```python
from milvusql_sqlalchemy.hybrid import hybrid_search, weighted

stmt = (
    select(Item.id)
    .order_by(hybrid_search(
        weighted(Item.embedding.cosine_distance(dense_query), 0.7),
        weighted(Item.sparse.max_inner_product(sparse_query), 0.3),
        rerank="RRF", k=60,
    ))
    .limit(10)
)
```

Compiles to:

```sql
SELECT items.id FROM items
HYBRID SEARCH (items.embedding <=> :embedding_1 WEIGHT 0.7, items.sparse <#> :sparse_1 WEIGHT 0.3)
RERANK RRF(k=60)
 LIMIT :param_1
```

— verified to round-trip through `sqlglot-milvus`'s parser byte for byte, arm order and all.

## `weighted()`

```python
weighted(distance_expr, weight: float) -> SearchArm
```

Wraps any comparator-produced distance expression (`.cosine_distance(...)`, `.max_inner_product(...)`,
...) with a weight. Each arm becomes one `<column> <op> :param WEIGHT <weight>` clause.
