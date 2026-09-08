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

## `JOIN`s, `.annotate()` grouping and correlated `Exists()` do work

The relational constructs Django's compiler itself renders as `JOIN`/`GROUP BY`/`HAVING`/subquery
SQL are a different story from vector search — that SQL reaches `milvusql`'s DBAPI-level relational
engine (see
[MilvusQL Concepts](../getting-started/concepts#join-group-by-and-subqueries-run-through-a-client-side-relational-engine)),
which plans it into one Milvus read per collection and evaluates the rest client-side with Polars.
No backend-side change was needed for this to work:

```python
Item.objects.filter(category__title="book")               # relation lookup -> INNER JOIN
Item.objects.values("category_id").annotate(n=Count("id")).filter(n__gt=1)  # GROUP BY + HAVING
Item.objects.filter(Exists(Category.objects.filter(pk=OuterRef("category_id"))))  # correlated EXISTS
```

Django groups and orders by *ordinal position* (`GROUP BY 1`, `ORDER BY 2 DESC`) rather than by
name, and quotes every identifier — the planner resolves both. `Exists(... OuterRef(...))` is
decorrelated into a semi join (`~Exists(...)` into an anti join); a correlated *value* per outer
row (`annotate(Subquery(... OuterRef(...)))`) is rejected by name instead, since a semi-join
rewrite can't express it.

## Scope

| Package piece | Status |
|---|---|
| `Model`/`Field` CRUD, `.filter()` | Works, through Django's normal compiler |
| `VectorField` | Works — see [Vector Field](./vector-field) |
| `TextField` | Works — Milvus's analyzer-enabled full-text input, `TEXT` in DDL (was `VARCHAR(65535)` before v1.0.0 — see [Schema & Migrations](./schema-and-migrations)) |
| Relation `.filter()`, `.values().annotate(...)`, correlated `Exists(... OuterRef(...))` | Works, through the DBAPI's relational engine — see above |
| `schema_editor().create_model()` | Works — see [Schema & Migrations](./schema-and-migrations) |
| `RemoveField`/`AlterField` | Raise `NotImplementedError` on purpose — Milvus can't do either |
| `vector_search()`/`hybrid_search()` helpers | Works — see [Search Helpers](./search-helpers) |
| `dbshell` | Not supported, always — Milvus Lite has no CLI client, and a real server's `milvus_cli` isn't bundled either |
