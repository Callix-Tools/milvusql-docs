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

## Full-text search: no helper needed, but the sparse column isn't a model field

Unlike vector/hybrid search, BM25 full-text retrieval needs no explicit helper — a `models.TextField()`
is Milvus's analyzer-enabled full-text input (`TEXT` in DDL — see
[Schema & Migrations](./schema-and-migrations)), and ordering by a generic `models.Func(...,
function="BM25_SCORE")` compiles through Django's normal `SQLCompiler` into a real Milvus `search`,
**once the generated `SPARSEVEC` column it scores against exists**:

```python
from django.db import models

Item.objects.annotate(
    score=models.Func(
        models.F("content_sparse"),
        models.Value("how do i tune hnsw"),
        function="BM25_SCORE",
        output_field=models.TextField(),
    )
).order_by("-score").values("id")[:10]
```

`content_sparse` here is **not** a `VectorField` (or any other) model field — `milvusql-django` has
no field type for a `GENERATED ALWAYS AS (BM25(...))` column, and the schema editor's column-list
builder doesn't special-case one either, so `create_model()`/migrations cannot create it. It has to
be part of the table's DDL from the start, issued as raw SQL through `connection.cursor()` instead
of through `create_model()`, the same way the package's own integration test does it:

```python
with connection.cursor() as cursor:
    cursor.execute(
        "CREATE TABLE items ("
        "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
        "content TEXT, "
        "content_sparse SPARSEVEC GENERATED ALWAYS AS (BM25(content))"
        ") WITH (consistency_level='Strong')"
    )
    cursor.execute(
        "CREATE INDEX idx_items_sparse ON items (content_sparse) "
        "USING SPARSE_INVERTED_INDEX WITH (metric_type='BM25')"
    )
```

Adding it to a table `create_model()` already made isn't a safe fallback either: `milvusql`'s
`ALTER TABLE ... ADD FIELD` translator only reads the new column's type, not any
`GENERATED ALWAYS AS (...)` constraint on it, so an `ALTER TABLE items ADD FIELD content_sparse
SPARSEVEC GENERATED ALWAYS AS (BM25(content))` issued the same way silently drops the BM25
relationship instead of rejecting it outright — see
[Schema & Migrations](./schema-and-migrations#generated-bm25-columns-arent-a-model-field). Declare
the generated column as part of `CREATE TABLE` from the start, as above, not added later.
`models.F("content_sparse")` in the `.annotate()` above then resolves fine regardless of how the
column was created, because Django's ORM addresses columns by name, not by declared field.

Keyword filtering goes through raw SQL — `MATCH(content) AGAINST (:q)` has no `.filter()` lookup —
via `connection.cursor()`, the same escape hatch [vector search](#vector_search) itself uses. See
[MilvusQL Concepts → Full-text search](../getting-started/concepts#full-text-search-bm25-and-match--against)
for what `TEXT`/`BM25_SCORE`/`MATCH ... AGAINST` do at the MilvusQL level.
