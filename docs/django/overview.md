---
sidebar_position: 1
---

# Overview

`milvusql-django` is a Django database backend built on the [`milvusql`](../core/overview) DBAPI.

## Configuration

```python
DATABASES = {
    "default": {
        "ENGINE": "milvusql_django",
        "NAME": "/path/to/items.db",   # Milvus Lite: a local file
    }
}
```

Or a real server, using Django's normal `HOST`/`PORT`/`USER`/`PASSWORD` settings:

```python
DATABASES = {
    "default": {
        "ENGINE": "milvusql_django",
        "NAME": "default",             # Milvus db_name
        "HOST": "localhost",
        "PORT": 19530,
        "USER": "root",
        "PASSWORD": "Milvus",
    }
}
```

`USER` and `PASSWORD` are reassembled into Milvus's `token` parameter (itself a `"user:password"`
pair) rather than `PASSWORD` alone being forwarded and `USER` silently dropped.

## What goes through Django's normal compiler, unmodified

Standard `Model`/`Field` CRUD and scalar filtering — everything that's genuinely SQL-shaped:

```python
from django.db import models

class Item(models.Model):
    category = models.CharField(max_length=64)

Item.objects.create(category="book")
Item.objects.filter(category="book")
Item.objects.filter(category="book").delete()
```

## What doesn't — and why

Django's `SQLCompiler` has no concept of an ANN `ORDER BY` or a `HYBRID SEARCH` clause. Teaching it
one is the path [`django-cassandra-engine`](https://github.com/r4fek/django-cassandra-engine) took
— forking Django's Model metaclass to fake `Field`/`Options` on top of a completely different query
model — and this package deliberately didn't. Milvus is a better fit for real Django integration
than Cassandra is (everything *except* vector search really is SQL-shaped here), so the fork was
avoidable: vector and hybrid search go through explicit helper functions instead, building MilvusQL
text directly and executing it through `connection.cursor()`. See [Search Helpers](./search-helpers).

## Scope

| Package piece | Status |
|---|---|
| `Model`/`Field` CRUD, `.filter()` | Works, through Django's normal compiler |
| `VectorField` | Works — see [Vector Field](./vector-field) |
| `schema_editor().create_model()` | Works — see [Schema & Migrations](./schema-and-migrations) |
| `RemoveField`/`AlterField` | Raise `NotImplementedError` on purpose — Milvus can't do either |
| `vector_search()`/`hybrid_search()` helpers | Works — see [Search Helpers](./search-helpers) |
| `dbshell` | Not supported — Milvus Lite has no CLI client |
