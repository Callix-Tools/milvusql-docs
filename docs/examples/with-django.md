---
sidebar_position: 3
---

# With Django

```python
# settings.py
DATABASES = {
    "default": {
        "ENGINE": "milvusql_django",
        "NAME": "/path/to/items.db",
    }
}
```

```python
# models.py
from django.db import models
from milvusql_django.fields import VectorField

class Item(models.Model):
    category = models.CharField(max_length=64)
    embedding = VectorField(dim=8)
```

## Creating the collection

Migrations create the collection; indexing and loading are a separate, explicit step (see
[Django → Schema & Migrations](../django/schema-and-migrations) for why):

```python
from django.db import connection
from milvusql_django.schema import create_index_and_load

with connection.schema_editor() as editor:
    editor.create_model(Item)

create_index_and_load(
    connection, Item._meta.db_table, "embedding",
    using="HNSW", metric_type="COSINE",
)
```

## CRUD through the normal ORM

```python
book = Item.objects.create(category="book", embedding=[0.1] * 8)
movie = Item.objects.create(category="movie", embedding=[0.9] * 8)

Item.objects.filter(category="book")
# <QuerySet [<Item: Item object (1)>]>

Item.objects.filter(category="movie").delete()
```

## Vector search

```python
from milvusql_django.expressions import vector_search

results = vector_search(Item, "embedding", [0.1] * 8, k=5, category="book")
for item in results:
    print(item.id, item.category, item.embedding)
```

See [Django → Search Helpers](../django/search-helpers) for `hybrid_search()` and the full
parameter list.
