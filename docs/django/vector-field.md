---
sidebar_position: 2
---

# VectorField

```python
from django.db import models
from milvusql_django.fields import VectorField

class Item(models.Model):
    category = models.CharField(max_length=64)
    embedding = VectorField(dim=768)
```

A standard Django `Field` subclass — not a fake `Column` shim. It only needs to round-trip
`list[float] <-> VECTOR(n)` DDL text; `milvusql`'s DBAPI already carries the Python list through as
a real bind value, so there's no encoding to do on the Python side either (`get_prep_value`/
`to_python`/`from_db_value` are all effectively pass-through).

```python
item = Item.objects.create(category="book", embedding=[0.1] * 768)
item.embedding
# [0.1, 0.1, ..., 0.1]
```

## `dim`

```python
VectorField(dim=768)
```

Renders as `VECTOR(768)` in DDL. Omitting `dim` renders a bare `VECTOR` — allowed by MilvusQL's
grammar, but Milvus itself requires a fixed dimension for a `FLOAT_VECTOR` field in practice, so in
almost every real model you'll want to set it.

## Querying

`VectorField` doesn't add `.filter()`-level distance lookups — Django's ORM has no expression for
"nearest neighbor," so there's nothing to add a lookup for. Vector search goes through
[`vector_search()`](./search-helpers) instead.
