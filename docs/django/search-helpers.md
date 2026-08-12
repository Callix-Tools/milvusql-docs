---
sidebar_position: 4
---

# Search Helpers

`vector_search()` and `hybrid_search()` bypass Django's query compiler on purpose — the same
non-negotiable bypass every non-relational Django backend needs somewhere, scoped here to only the
parts of MilvusQL that are genuinely not relational, not the whole query surface. Plain
`Model.objects.filter(...)` still goes through Django's normal compiler, untouched.

## `vector_search()`

```python
from milvusql_django.expressions import vector_search

results = vector_search(
    Item, "embedding", query_vector,
    k=5, metric="cosine",
    category="book",   # extra kwargs become WHERE filters
)
# -> list[Item]
```

Builds MilvusQL text directly:

```sql
SELECT "id", "category", "embedding" FROM "items"
WHERE "category" = :filter_0
ORDER BY "embedding" <=> :query_vector LIMIT :limit
```

and executes it through `connection.cursor()`, materializing real model instances via
`Model.from_db()` — the same mechanism `Model.objects.raw()` uses internally.

Every interpolated identifier (`table`, `field_name`, filter column names) comes from
`model._meta` — developer-defined names, not runtime input. Every value (the query vector, filter
values, `k`) is a `:name` bind parameter, never inlined into the text — the same invariant
`milvusql` core's own filter renderer follows.

### `metric`

| `metric=` | Operator |
|---|---|
| `"l2"` | `<->` |
| `"cosine"` (default) | `<=>` |
| `"inner_product"` | `<#>` |
| `"l1"` | `<+>` |

## `hybrid_search()`

```python
from milvusql_django.expressions import hybrid_search

results = hybrid_search(
    Item,
    [
        ("embedding", "cosine", dense_query, 0.7),
        ("sparse", "inner_product", sparse_query, 0.3),
    ],
    k=10, rerank="RRF",
)
```

Each tuple is `(field_name, metric, query_vector, weight)`. Builds the same
`HYBRID SEARCH (...) RERANK ...` text the [SQLAlchemy dialect's `hybrid_search()`](../sqlalchemy/hybrid-search)
produces, with the same bind-parameter-per-arm shape.
