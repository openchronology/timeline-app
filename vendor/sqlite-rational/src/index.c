#include "internal.h"
#define MAX_DEPTH 128
#define TRY(expression) do { rc = (expression); if (rc != SQLITE_OK) goto done; } while (0)
typedef struct {
  sqlite3_int64 id, left, right, weight, count, size, first_id;
  int height;
  mpq_t key, first, last, gap;
} Node;
typedef struct {
  sqlite3_vtab base;
  sqlite3 *db;
  char *nodes, *meta;
  sqlite3_stmt *get, *save, *erase, *root_get, *root_set, *insert, *payload, *change;
} Index;
typedef struct {
  sqlite3_int64 id, count, size;
  mpq_t first, last, gap;
} Row;
typedef struct {
  sqlite3_vtab_cursor base;
  Row *rows;
  int length, capacity, position;
  int has_lower, has_upper, include_lower, include_upper, summarize, neighbors, empty;
  sqlite3_int64 visited, consumed;
  mpq_t lower, upper, threshold;
} Cursor;
static void node_free(Node *n) {
  if (n) { mpq_clears(n->key, n->first, n->last, n->gap, NULL); sqlite3_free(n); }
}
static int node_get(Index *v, sqlite3_int64 id, Node **out) {
  sqlite3_stmt *s = v->get;
  Node *n = NULL;
  int rc, i;
  mpq_ptr fields[4];
  *out = NULL;
  if (!id) return SQLITE_OK;
  sqlite3_bind_int64(s, 1, id);
  rc = sqlite3_step(s);
  if (rc != SQLITE_ROW) { sqlite3_reset(s); return rc == SQLITE_DONE ? SQLITE_CORRUPT : rc; }
  n = sqlite3_malloc64(sizeof(*n));
  if (!n) { sqlite3_reset(s); return SQLITE_NOMEM; }
  memset(n, 0, sizeof(*n));
  mpq_inits(n->key, n->first, n->last, n->gap, NULL);
  n->id = id; n->weight = sqlite3_column_int64(s, 1);
  n->left = sqlite3_column_int64(s, 2); n->right = sqlite3_column_int64(s, 3);
  n->height = sqlite3_column_int(s, 4); n->count = sqlite3_column_int64(s, 7);
  n->size = sqlite3_column_int64(s, 8); n->first_id = sqlite3_column_int64(s, 10);
  fields[0] = n->key; fields[1] = n->first; fields[2] = n->last; fields[3] = n->gap;
  for (i = 0; i < 4; i++) {
    int col = i == 0 ? 0 : i == 1 ? 5 : i == 2 ? 6 : 9;
    rc = q_parse(fields[i], (const char *)sqlite3_column_text(s, col), sqlite3_column_bytes(s, col));
    if (rc != SQLITE_OK) break;
  }
  sqlite3_reset(s);
  if (rc != SQLITE_OK || n->height <= 0 || n->height > MAX_DEPTH || n->weight <= 0 ||
      n->left == id || n->right == id || n->count < n->weight || n->size <= 0) {
    node_free(n); return rc == SQLITE_NOMEM ? rc : SQLITE_CORRUPT;
  }
  *out = n; return SQLITE_OK;
}
static int bind_q(sqlite3_stmt *s, int column, const mpq_t q) {
  char *text = q_text(q);
  if (!text) return SQLITE_NOMEM;
  return sqlite3_bind_text(s, column, text, -1, sqlite3_free);
}
static int finish(sqlite3_stmt *s) {
  int rc = sqlite3_step(s);
  sqlite3_reset(s); sqlite3_clear_bindings(s);
  return rc == SQLITE_DONE ? SQLITE_OK : rc;
}
static int checked_add(sqlite3_int64 a, sqlite3_int64 b, sqlite3_int64 *out) {
  if (a < 0 || b < 0 || a > INT64_MAX - b) return SQLITE_TOOBIG;
  *out = a + b; return SQLITE_OK;
}
static int save(Index *v, Node *n) {
  Node *l = NULL, *r = NULL;
  sqlite3_stmt *s = v->save;
  mpq_t gap;
  int rc = SQLITE_OK;
  mpq_init(gap);
  TRY(node_get(v, n->left, &l)); TRY(node_get(v, n->right, &r));
  n->height = 1 + ((l ? l->height : 0) > (r ? r->height : 0) ? (l ? l->height : 0) : (r ? r->height : 0));
  n->count = n->weight; n->size = 1;
  mpq_set(n->first, l ? l->first : n->key); mpq_set(n->last, r ? r->last : n->key);
  n->first_id = l ? l->first_id : n->id; mpq_set_ui(n->gap, 0, 1);
  if (l) {
    TRY(checked_add(n->count, l->count, &n->count)); TRY(checked_add(n->size, l->size, &n->size));
    mpq_set(n->gap, l->gap); mpq_sub(gap, n->key, l->last);
    if (mpq_cmp(gap, n->gap) > 0) mpq_set(n->gap, gap);
  }
  if (r) {
    TRY(checked_add(n->count, r->count, &n->count)); TRY(checked_add(n->size, r->size, &n->size));
    if (mpq_cmp(r->gap, n->gap) > 0) mpq_set(n->gap, r->gap);
    mpq_sub(gap, r->first, n->key);
    if (mpq_cmp(gap, n->gap) > 0) mpq_set(n->gap, gap);
  }
  sqlite3_bind_int64(s, 1, n->left); sqlite3_bind_int64(s, 2, n->right);
  sqlite3_bind_int(s, 3, n->height);
  TRY(bind_q(s, 4, n->first)); TRY(bind_q(s, 5, n->last));
  sqlite3_bind_int64(s, 6, n->count); sqlite3_bind_int64(s, 7, n->size);
  TRY(bind_q(s, 8, n->gap));
  sqlite3_bind_int64(s, 9, n->first_id); sqlite3_bind_int64(s, 10, n->id);
  TRY(finish(s));
done:
  sqlite3_reset(s); sqlite3_clear_bindings(s); node_free(l); node_free(r); mpq_clear(gap); return rc;
}
static int rotate(Index *v, Node *n, int leftward, sqlite3_int64 *root) {
  Node *p = NULL;
  int rc = SQLITE_OK;
  TRY(node_get(v, leftward ? n->right : n->left, &p));
  if (!p) { rc = SQLITE_CORRUPT; goto done; }
  if (leftward) { n->right = p->left; p->left = n->id; }
  else { n->left = p->right; p->right = n->id; }
  TRY(save(v, n)); TRY(save(v, p)); *root = p->id;
done:
  node_free(p); return rc;
}
static int rebalance(Index *v, Node *n, sqlite3_int64 *root) {
  Node *l = NULL, *r = NULL, *a = NULL, *b = NULL;
  int rc = SQLITE_OK, difference;
  TRY(save(v, n));
  TRY(node_get(v, n->left, &l)); TRY(node_get(v, n->right, &r));
  difference = (l ? l->height : 0) - (r ? r->height : 0);
  if (difference > 1) {
    TRY(node_get(v, l->left, &a)); TRY(node_get(v, l->right, &b));
    if ((a ? a->height : 0) < (b ? b->height : 0)) TRY(rotate(v, l, 1, &n->left));
    TRY(rotate(v, n, 0, root));
  } else if (difference < -1) {
    TRY(node_get(v, r->left, &a)); TRY(node_get(v, r->right, &b));
    if ((b ? b->height : 0) < (a ? a->height : 0)) TRY(rotate(v, r, 0, &n->right));
    TRY(rotate(v, n, 1, root));
  } else *root = n->id;
done:
  node_free(l); node_free(r); node_free(a); node_free(b); return rc;
}
static int insert_tree(Index *v, sqlite3_int64 id, sqlite3_int64 fresh, const mpq_t key,
  sqlite3_int64 *root, int depth) {
  Node *n = NULL;
  int rc = SQLITE_OK, c;
  if (depth > MAX_DEPTH) return SQLITE_CORRUPT;
  if (!id) { *root = fresh; return SQLITE_OK; }
  TRY(node_get(v, id, &n)); c = mpq_cmp(key, n->key);
  if (c < 0) TRY(insert_tree(v, n->left, fresh, key, &n->left, depth + 1));
  else if (c > 0) TRY(insert_tree(v, n->right, fresh, key, &n->right, depth + 1));
  else if (id != fresh) { rc = SQLITE_CONSTRAINT; goto done; }
  TRY(rebalance(v, n, root));
done:
  node_free(n); return rc;
}
static int detach_min(Index *v, sqlite3_int64 id, Node **minimum, sqlite3_int64 *root, int depth) {
  Node *n = NULL;
  int rc = SQLITE_OK;
  if (depth > MAX_DEPTH) return SQLITE_CORRUPT;
  TRY(node_get(v, id, &n));
  if (!n) { rc = SQLITE_CORRUPT; goto done; }
  if (!n->left) { *minimum = n; *root = n->right; n = NULL; }
  else { TRY(detach_min(v, n->left, minimum, &n->left, depth + 1)); TRY(rebalance(v, n, root)); }
done:
  node_free(n); return rc;
}
static int delete_tree(Index *v, sqlite3_int64 id, const mpq_t key, sqlite3_int64 *root, int depth) {
  Node *n = NULL, *successor = NULL;
  int rc = SQLITE_OK, c;
  if (depth > MAX_DEPTH) return SQLITE_CORRUPT;
  if (!id) return SQLITE_CORRUPT;
  TRY(node_get(v, id, &n)); c = mpq_cmp(key, n->key);
  if (c < 0) { TRY(delete_tree(v, n->left, key, &n->left, depth + 1)); TRY(rebalance(v, n, root)); }
  else if (c > 0) { TRY(delete_tree(v, n->right, key, &n->right, depth + 1)); TRY(rebalance(v, n, root)); }
  else {
    if (!n->left || !n->right) *root = n->left ? n->left : n->right;
    else {
      sqlite3_int64 new_right;
      TRY(detach_min(v, n->right, &successor, &new_right, depth + 1));
      successor->left = n->left; successor->right = new_right;
      TRY(rebalance(v, successor, root));
    }
    sqlite3_bind_int64(v->erase, 1, n->id); TRY(finish(v->erase));
  }
done:
  node_free(n); node_free(successor); return rc;
}
static int find(Index *v, sqlite3_int64 id, const mpq_t key, sqlite3_int64 *found) {
  Node *n = NULL;
  int rc = SQLITE_OK, depth = 0;
  *found = 0;
  while (id) {
    int c;
    if (++depth > MAX_DEPTH) return SQLITE_CORRUPT;
    TRY(node_get(v, id, &n)); c = mpq_cmp(key, n->key);
    if (!c) { *found = id; node_free(n); return SQLITE_OK; }
    id = c < 0 ? n->left : n->right; node_free(n); n = NULL;
  }
done:
  node_free(n); return rc;
}
static int roots(Index *v, sqlite3_int64 *root, sqlite3_int64 *next) {
  int rc = sqlite3_step(v->root_get);
  if (rc == SQLITE_ROW) {
    *root = sqlite3_column_int64(v->root_get, 0); *next = sqlite3_column_int64(v->root_get, 1);
    rc = *root >= 0 && *next > 0 ? SQLITE_OK : SQLITE_CORRUPT;
  } else if (rc == SQLITE_DONE || rc == SQLITE_OK) rc = SQLITE_CORRUPT;
  sqlite3_reset(v->root_get); return rc;
}
static int below(Cursor *c, const mpq_t key) {
  int r;
  if (!c->has_lower) return 0;
  r = mpq_cmp(key, c->lower); return r < 0 || (r == 0 && !c->include_lower);
}
static int above(Cursor *c, const mpq_t key) {
  int r;
  if (!c->has_upper) return 0;
  r = mpq_cmp(key, c->upper); return r > 0 || (r == 0 && !c->include_upper);
}
static void rows_clear(Cursor *c) {
  int i;
  for (i = 0; i < c->length; i++) mpq_clears(c->rows[i].first, c->rows[i].last, c->rows[i].gap, NULL);
  sqlite3_free(c->rows); c->rows = NULL; c->length = c->capacity = c->position = 0;
}
static int append(Cursor *c, const mpq_t first, const mpq_t last, const mpq_t gap,
  sqlite3_int64 count, sqlite3_int64 size, sqlite3_int64 id, int merge) {
  Row *r;
  int rc = SQLITE_OK;
  mpq_t boundary;
  mpq_init(boundary);
  if (merge && c->length) {
    r = &c->rows[c->length - 1]; mpq_sub(boundary, first, r->last);
    if (mpq_cmp(boundary, c->threshold) < 0) {
      TRY(checked_add(r->count, count, &r->count)); TRY(checked_add(r->size, size, &r->size));
      mpq_set(r->last, last);
      if (mpq_cmp(boundary, r->gap) > 0) mpq_set(r->gap, boundary);
      if (mpq_cmp(gap, r->gap) > 0) mpq_set(r->gap, gap);
      goto done;
    }
  }
  if (c->length == c->capacity) {
    int capacity;
    Row *rows;
    if (c->capacity > INT_MAX / 2) { rc = SQLITE_TOOBIG; goto done; }
    capacity = c->capacity ? c->capacity * 2 : 16;
    rows = sqlite3_realloc64(c->rows, (sqlite3_uint64)capacity * sizeof(*rows));
    if (!rows) { rc = SQLITE_NOMEM; goto done; }
    c->rows = rows; c->capacity = capacity;
  }
  r = &c->rows[c->length++]; mpq_inits(r->first, r->last, r->gap, NULL);
  mpq_set(r->first, first); mpq_set(r->last, last); mpq_set(r->gap, gap);
  r->count = count; r->size = size; r->id = id;
done:
  mpq_clear(boundary); return rc;
}
/* Aggregation folds consume whole nodes; payload values are never loaded here. */
static int walk(Index *v, Cursor *c, sqlite3_int64 id, int fold, int depth) {
  Node *n = NULL;
  mpq_t zero;
  int rc = SQLITE_OK, full;
  if (!id) return SQLITE_OK;
  if (depth > MAX_DEPTH) return SQLITE_CORRUPT;
  mpq_init(zero); c->visited++;
  TRY(node_get(v, id, &n));
  if (below(c, n->last) || above(c, n->first)) goto done;
  full = !below(c, n->first) && !above(c, n->last);
  if (full && (fold || (c->summarize && c->neighbors &&
      (n->size == 1 || mpq_cmp(n->gap, c->threshold) < 0)))) {
    c->consumed++;
    TRY(append(c, n->first, n->last, n->gap, n->count, n->size, n->first_id, fold || c->summarize));
  } else {
    TRY(walk(v, c, n->left, fold, depth + 1));
    if (!below(c, n->key) && !above(c, n->key))
      TRY(append(c, n->key, n->key, zero, n->weight, 1, n->id, fold || c->summarize));
    TRY(walk(v, c, n->right, fold, depth + 1));
  }
done:
  node_free(n); mpq_clear(zero); return rc;
}
static int lower_bound(Index *v, Cursor *c, sqlite3_int64 id, const mpq_t key, int has_key,
  int inclusive, mpq_t out, int *found) {
  Node *n = NULL;
  int rc = SQLITE_OK, depth = 0;
  *found = 0;
  while (id) {
    int cmp;
    if (++depth > MAX_DEPTH) return SQLITE_CORRUPT;
    c->visited++; TRY(node_get(v, id, &n));
    cmp = has_key ? mpq_cmp(n->key, key) : 1;
    if (cmp > 0 || (cmp == 0 && inclusive)) { mpq_set(out, n->key); *found = 1; id = n->left; }
    else id = n->right;
    node_free(n); n = NULL;
  }
done:
  node_free(n); return rc;
}
static int span(Index *v, Cursor *c, sqlite3_int64 root) {
  mpq_t anchor, end, original_lower, original_upper;
  int rc = SQLITE_OK, found, has_lower = c->has_lower, has_upper = c->has_upper;
  int inc_lower = c->include_lower, inc_upper = c->include_upper;
  mpq_inits(anchor, end, original_lower, original_upper, NULL);
  mpq_set(original_lower, c->lower); mpq_set(original_upper, c->upper);
  TRY(lower_bound(v, c, root, c->lower, has_lower, inc_lower, anchor, &found));
  while (found) {
    int clipped;
    c->has_upper = has_upper; c->include_upper = inc_upper; mpq_set(c->upper, original_upper);
    if (above(c, anchor)) break;
    mpq_add(end, anchor, c->threshold);
    clipped = has_upper && mpq_cmp(original_upper, end) < 0;
    c->has_lower = c->has_upper = 1; c->include_lower = 1;
    mpq_set(c->lower, anchor); mpq_set(c->upper, clipped ? original_upper : end);
    c->include_upper = clipped && inc_upper;
    /* Fold fragments merge within this group, but never into the prior group. */
    {
      Cursor part;
      int i;
      memset(&part, 0, sizeof(part)); mpq_inits(part.lower, part.upper, part.threshold, NULL);
      part.has_lower = part.has_upper = 1; part.include_lower = 1; part.include_upper = c->include_upper;
      mpq_set(part.lower, c->lower); mpq_set(part.upper, c->upper); mpq_set(part.threshold, c->threshold);
      rc = walk(v, &part, root, 1, 0);
      c->visited += part.visited; c->consumed += part.consumed;
      for (i = 0; rc == SQLITE_OK && i < part.length; i++) {
        Row *r = &part.rows[i]; rc = append(c, r->first, r->last, r->gap, r->count, r->size, r->id, 0);
      }
      rows_clear(&part); mpq_clears(part.lower, part.upper, part.threshold, NULL);
      if (rc != SQLITE_OK) goto done;
    }
    if (clipped) break;
    TRY(lower_bound(v, c, root, end, 1, 1, anchor, &found));
  }
done:
  c->has_lower = has_lower; c->has_upper = has_upper; c->include_lower = inc_lower; c->include_upper = inc_upper;
  mpq_set(c->lower, original_lower); mpq_set(c->upper, original_upper);
  mpq_clears(anchor, end, original_lower, original_upper, NULL); return rc;
}
static void statements_free(Index *v) {
  sqlite3_finalize(v->get); sqlite3_finalize(v->save); sqlite3_finalize(v->erase);
  sqlite3_finalize(v->root_get); sqlite3_finalize(v->root_set); sqlite3_finalize(v->insert);
  sqlite3_finalize(v->payload); sqlite3_finalize(v->change);
}
static int prepare(Index *v, sqlite3_stmt **out, const char *format, const char *name) {
  char *sql = sqlite3_mprintf(format, name);
  int rc;
  if (!sql) return SQLITE_NOMEM;
  rc = sqlite3_prepare_v2(v->db, sql, -1, out, NULL); sqlite3_free(sql); return rc;
}
static int disconnect(sqlite3_vtab *table) {
  Index *v = (Index *)table;
  statements_free(v); sqlite3_free(v->nodes); sqlite3_free(v->meta); sqlite3_free(v); return SQLITE_OK;
}
static int connect_impl(sqlite3 *db, int argc, const char *const *argv, sqlite3_vtab **out, char **error, int create) {
  Index *v = sqlite3_malloc64(sizeof(*v));
  int rc = SQLITE_OK;
  char *sql = NULL;
  if (!v) return SQLITE_NOMEM;
  memset(v, 0, sizeof(*v)); v->db = db;
  if (argc != 3) { *error = sqlite3_mprintf("rational_index accepts no schema arguments"); rc = SQLITE_ERROR; goto done; }
  v->nodes = sqlite3_mprintf("\"%w\".\"%w_nodes\"", argv[1], argv[2]);
  v->meta = sqlite3_mprintf("\"%w\".\"%w_meta\"", argv[1], argv[2]);
  if (!v->nodes || !v->meta) { rc = SQLITE_NOMEM; goto done; }
  if (create) {
    sql = sqlite3_mprintf(
      "CREATE TABLE %s(id INTEGER PRIMARY KEY,time TEXT NOT NULL,value,weight INTEGER NOT NULL,"
      "l INTEGER NOT NULL,r INTEGER NOT NULL,height INTEGER NOT NULL,first TEXT NOT NULL,last TEXT NOT NULL,"
      "count INTEGER NOT NULL,size INTEGER NOT NULL,gap TEXT NOT NULL,first_id INTEGER NOT NULL);"
      "CREATE TABLE %s(singleton INTEGER PRIMARY KEY CHECK(singleton=1),root INTEGER NOT NULL,next_id INTEGER NOT NULL);"
      "INSERT INTO %s VALUES(1,0,1)", v->nodes, v->meta, v->meta);
    if (!sql) { rc = SQLITE_NOMEM; goto done; }
    TRY(sqlite3_exec(db, sql, NULL, NULL, error));
  }
  TRY(sqlite3_declare_vtab(db,
    "CREATE TABLE x(time TEXT COLLATE RATIONAL_V1,value,weight INTEGER,last_time TEXT COLLATE RATIONAL_V1,"
    "distinct_count INTEGER,max_gap TEXT COLLATE RATIONAL_V1,lower HIDDEN,upper HIDDEN,threshold HIDDEN,"
    "mode HIDDEN,include_lower HIDDEN,include_upper HIDDEN,visited_nodes HIDDEN)"));
  TRY(sqlite3_vtab_config(db, SQLITE_VTAB_CONSTRAINT_SUPPORT, 1));
  TRY(prepare(v, &v->get, "SELECT time,weight,l,r,height,first,last,count,size,gap,first_id FROM %s WHERE id=?1", v->nodes));
  TRY(prepare(v, &v->save, "UPDATE %s SET l=?1,r=?2,height=?3,first=?4,last=?5,count=?6,size=?7,gap=?8,first_id=?9 WHERE id=?10", v->nodes));
  TRY(prepare(v, &v->erase, "DELETE FROM %s WHERE id=?1", v->nodes));
  TRY(prepare(v, &v->root_get, "SELECT root,next_id FROM %s WHERE singleton=1", v->meta));
  TRY(prepare(v, &v->root_set, "UPDATE %s SET root=?1,next_id=?2 WHERE singleton=1", v->meta));
  TRY(prepare(v, &v->insert, "INSERT INTO %s VALUES(?1,?2,?3,?4,0,0,1,?2,?2,?4,1,'0/1',?1)", v->nodes));
  TRY(prepare(v, &v->payload, "SELECT value FROM %s WHERE id=?1", v->nodes));
  TRY(prepare(v, &v->change, "UPDATE %s SET value=?1,count=count-weight+?2,weight=?2 WHERE id=?3", v->nodes));
  *out = &v->base; v = NULL;
done:
  sqlite3_free(sql); if (v) disconnect(&v->base); return rc;
}
static int create_table(sqlite3 *db, void *aux, int argc, const char *const *argv, sqlite3_vtab **v, char **error) {
  (void)aux; return connect_impl(db, argc, argv, v, error, 1);
}
static int connect_table(sqlite3 *db, void *aux, int argc, const char *const *argv, sqlite3_vtab **v, char **error) {
  (void)aux; return connect_impl(db, argc, argv, v, error, 0);
}
static int destroy(sqlite3_vtab *table) {
  Index *v = (Index *)table;
  char *sql = sqlite3_mprintf("DROP TABLE %s;DROP TABLE %s", v->nodes, v->meta);
  int rc;
  if (!sql) return SQLITE_NOMEM;
  rc = sqlite3_exec(v->db, sql, NULL, NULL, NULL); sqlite3_free(sql);
  if (rc == SQLITE_OK) disconnect(table);
  return rc;
}
static int best_index(sqlite3_vtab *table, sqlite3_index_info *info) {
  char *plan = sqlite3_malloc64((sqlite3_uint64)info->nConstraint + 1);
  int i, n = 0;
  (void)table;
  if (!plan) return SQLITE_NOMEM;
  for (i = 0; i < info->nConstraint; i++) {
    const struct sqlite3_index_constraint *c = &info->aConstraint[i];
    char flag = 0;
    if (!c->usable) continue;
    if (c->iColumn == 0 && sqlite3_stricmp(sqlite3_vtab_collation(info, i), "RATIONAL_V1") == 0) {
      switch (c->op) {
        case SQLITE_INDEX_CONSTRAINT_EQ: flag = 'E'; break;
        case SQLITE_INDEX_CONSTRAINT_GE: flag = 'A'; break;
        case SQLITE_INDEX_CONSTRAINT_GT: flag = 'B'; break;
        case SQLITE_INDEX_CONSTRAINT_LT: flag = 'C'; break;
        case SQLITE_INDEX_CONSTRAINT_LE: flag = 'D'; break;
        default: break;
      }
    } else if (c->op == SQLITE_INDEX_CONSTRAINT_EQ) {
      switch (c->iColumn) {
        case -1: flag = 'r'; break;
        case 6: flag = 'l'; break; case 7: flag = 'u'; break;
        case 8: flag = 't'; break; case 9: flag = 'm'; break;
        case 10: flag = 'i'; break; case 11: flag = 'j'; break;
        default: break;
      }
    }
    if (flag) {
      plan[n++] = flag; info->aConstraintUsage[i].argvIndex = n;
      info->aConstraintUsage[i].omit = 1;
    }
  }
  plan[n] = 0; info->idxStr = plan; info->needToFreeIdxStr = 1;
  info->estimatedCost = n ? 100.0 : 1000000.0; info->estimatedRows = n ? 100 : 1000000;
  if (info->nOrderBy == 1 && info->aOrderBy[0].iColumn == 0 && !info->aOrderBy[0].desc)
    info->orderByConsumed = 1;
  return SQLITE_OK;
}
static int open_cursor(sqlite3_vtab *table, sqlite3_vtab_cursor **out) {
  Cursor *c = sqlite3_malloc64(sizeof(*c));
  (void)table;
  if (!c) return SQLITE_NOMEM;
  memset(c, 0, sizeof(*c)); mpq_inits(c->lower, c->upper, c->threshold, NULL); *out = &c->base;
  return SQLITE_OK;
}
static int close_cursor(sqlite3_vtab_cursor *cursor) {
  Cursor *c = (Cursor *)cursor;
  rows_clear(c); mpq_clears(c->lower, c->upper, c->threshold, NULL); sqlite3_free(c); return SQLITE_OK;
}
static int argument(mpq_t out, sqlite3_value *arg) {
  return sqlite3_value_type(arg) == SQLITE_TEXT
    ? q_parse(out, (const char *)sqlite3_value_text(arg), sqlite3_value_bytes(arg)) : SQLITE_MISMATCH;
}
static void set_bound(Cursor *c, const mpq_t value, int lower, int inclusive) {
  int has = lower ? c->has_lower : c->has_upper;
  mpq_ptr dest = lower ? c->lower : c->upper;
  int cmp = has ? mpq_cmp(value, dest) : 0;
  int replace = !has || (lower ? cmp > 0 : cmp < 0);
  if (replace) {
    mpq_set(dest, value);
    if (lower) { c->has_lower = 1; c->include_lower = inclusive; }
    else { c->has_upper = 1; c->include_upper = inclusive; }
  } else if (cmp == 0) {
    if (lower) c->include_lower &= inclusive; else c->include_upper &= inclusive;
  }
}
static int filter(sqlite3_vtab_cursor *cursor, int plan_number, const char *plan, int argc, sqlite3_value **argv) {
  Cursor *c = (Cursor *)cursor;
  Index *v = (Index *)cursor->pVtab;
  sqlite3_int64 root = 0, next = 1, target = 0;
  int i, rc = SQLITE_OK, inc_lower = 1, inc_upper = 0;
  mpq_t value, zero;
  (void)plan_number; rows_clear(c);
  c->has_lower = c->has_upper = c->summarize = c->neighbors = c->empty = 0;
  c->include_lower = 1; c->include_upper = 0; c->visited = c->consumed = 0;
  mpq_inits(value, zero, NULL);
  for (i = 0; i < argc; i++) {
    if (plan[i] == 'i' || plan[i] == 'j') {
      int b = sqlite3_value_int(argv[i]);
      if (sqlite3_value_type(argv[i]) != SQLITE_INTEGER || (b != 0 && b != 1)) { rc = SQLITE_MISMATCH; goto done; }
      if (plan[i] == 'i') inc_lower = b; else inc_upper = b;
    } else if (plan[i] == 't' && sqlite3_value_type(argv[i]) != SQLITE_NULL) {
      TRY(argument(c->threshold, argv[i]));
      if (mpq_sgn(c->threshold) < 0) { rc = SQLITE_MISMATCH; goto done; }
      c->summarize = 1;
    } else if (plan[i] == 'm') {
      const char *mode = (const char *)sqlite3_value_text(argv[i]);
      int len = sqlite3_value_bytes(argv[i]);
      if (sqlite3_value_type(argv[i]) != SQLITE_TEXT ||
        !((len == 9 && memcmp(mode, "neighbors", 9) == 0) || (len == 4 && memcmp(mode, "span", 4) == 0))) {
        rc = SQLITE_MISMATCH; goto done;
      }
      c->neighbors = len == 9;
    } else if (plan[i] == 'r') {
      int type = sqlite3_value_numeric_type(argv[i]);
      sqlite3_int64 candidate = sqlite3_value_int64(argv[i]);
      if ((type != SQLITE_INTEGER && type != SQLITE_FLOAT) || candidate <= 0 ||
          (type == SQLITE_FLOAT && ((double)candidate != sqlite3_value_double(argv[i]) ||
            sqlite3_value_double(argv[i]) >= 9223372036854775808.0))) c->empty = 1;
      if (target && target != candidate) c->empty = 1;
      target = candidate;
    }
  }
  c->include_lower = inc_lower; c->include_upper = inc_upper;
  for (i = 0; i < argc; i++) {
    char f = plan[i];
    if (f == 'l' || f == 'u' || f == 'A' || f == 'B' || f == 'C' || f == 'D' || f == 'E') {
      if (sqlite3_value_type(argv[i]) == SQLITE_NULL) {
        if (f != 'l' && f != 'u') c->empty = 1;
        continue;
      }
      TRY(argument(value, argv[i]));
      if (f == 'l' || f == 'A' || f == 'B' || f == 'E') set_bound(c, value, 1, f == 'l' ? inc_lower : f != 'B');
      if (f == 'u' || f == 'C' || f == 'D' || f == 'E') set_bound(c, value, 0, f == 'u' ? inc_upper : f != 'C');
    }
  }
  if (c->has_lower && c->has_upper) {
    int cmp = mpq_cmp(c->lower, c->upper);
    if (cmp > 0 || (cmp == 0 && !(c->include_lower && c->include_upper))) c->empty = 1;
  }
  if (c->empty) goto done;
  TRY(roots(v, &root, &next));
  if (target) {
    Node *n = NULL;
    sqlite3_bind_int64(v->get, 1, target);
    i = sqlite3_step(v->get); sqlite3_reset(v->get);
    if (i == SQLITE_DONE) goto done;
    if (i != SQLITE_ROW) { rc = i; goto done; }
    rc = node_get(v, target, &n);
    if (rc == SQLITE_OK && !below(c, n->key) && !above(c, n->key))
      rc = append(c, n->key, n->key, zero, n->weight, 1, n->id, 0);
    node_free(n);
  } else if (!c->summarize || c->neighbors || mpq_sgn(c->threshold) == 0) {
    if (c->summarize && mpq_sgn(c->threshold) == 0) c->neighbors = 1;
    TRY(walk(v, c, root, 0, 0));
  } else TRY(span(v, c, root));
done:
  if (rc != SQLITE_OK) {
    sqlite3_free(v->base.zErrMsg);
    v->base.zErrMsg = sqlite3_mprintf("rational_index: invalid query argument or index error (%d)", rc);
  }
  mpq_clears(value, zero, NULL); return rc;
}
static int next_row(sqlite3_vtab_cursor *cursor) { ((Cursor *)cursor)->position++; return SQLITE_OK; }
static int eof(sqlite3_vtab_cursor *cursor) { Cursor *c = (Cursor *)cursor; return c->position >= c->length; }
static int rowid(sqlite3_vtab_cursor *cursor, sqlite3_int64 *id) {
  Cursor *c = (Cursor *)cursor; *id = c->rows[c->position].id; return SQLITE_OK;
}
static int column(sqlite3_vtab_cursor *cursor, sqlite3_context *ctx, int col) {
  Cursor *c = (Cursor *)cursor;
  Index *v = (Index *)cursor->pVtab;
  Row *r = &c->rows[c->position];
  if (sqlite3_vtab_nochange(ctx)) return SQLITE_OK;
  switch (col) {
    case 0: q_result(ctx, r->first); break;
    case 1:
      if (r->size == 1) {
        int rc;
        sqlite3_bind_int64(v->payload, 1, r->id); rc = sqlite3_step(v->payload);
        if (rc == SQLITE_ROW) sqlite3_result_value(ctx, sqlite3_column_value(v->payload, 0));
        else sqlite3_result_error_code(ctx, rc == SQLITE_DONE ? SQLITE_CORRUPT : rc);
        sqlite3_reset(v->payload);
      } else sqlite3_result_null(ctx);
      break;
    case 2: sqlite3_result_int64(ctx, r->count); break;
    case 3: q_result(ctx, r->last); break;
    case 4: sqlite3_result_int64(ctx, r->size); break;
    case 5: q_result(ctx, r->gap); break;
    case 6: if (c->has_lower) q_result(ctx, c->lower); break;
    case 7: if (c->has_upper) q_result(ctx, c->upper); break;
    case 8: if (c->summarize) q_result(ctx, c->threshold); break;
    case 9: sqlite3_result_text(ctx, c->neighbors ? "neighbors" : "span", -1, SQLITE_STATIC); break;
    case 10: sqlite3_result_int(ctx, c->include_lower); break;
    case 11: sqlite3_result_int(ctx, c->include_upper); break;
    case 12: sqlite3_result_int64(ctx, c->visited); break;
    default: break;
  }
  return SQLITE_OK;
}
static int update(sqlite3_vtab *table, int argc, sqlite3_value **argv, sqlite3_int64 *rowid_out) {
  Index *v = (Index *)table;
  Node *old = NULL;
  sqlite3_int64 root = 0, next = 1, id, found, weight = 1;
  int rc = SQLITE_OK, i, same_key = 0;
  mpq_t key;
  mpq_init(key); TRY(roots(v, &root, &next));
  if (sqlite3_value_type(argv[0]) != SQLITE_NULL) {
    TRY(node_get(v, sqlite3_value_int64(argv[0]), &old));
    if (!old) { rc = SQLITE_CORRUPT; goto done; }
  }
  if (argc == 1) { TRY(delete_tree(v, root, old->key, &root, 0)); goto metadata; }
  if (sqlite3_value_type(argv[1]) != SQLITE_NULL &&
      (sqlite3_value_type(argv[1]) != SQLITE_INTEGER || sqlite3_value_int64(argv[1]) <= 0)) {
    rc = SQLITE_CONSTRAINT; goto done;
  }
  id = sqlite3_value_type(argv[1]) == SQLITE_NULL ? next : sqlite3_value_int64(argv[1]);
  if (old && id != old->id) { rc = SQLITE_CONSTRAINT; goto done; }
  if (!old && id >= INT64_MAX) { rc = SQLITE_TOOBIG; goto done; }
  if (old && sqlite3_value_nochange(argv[2])) mpq_set(key, old->key);
  else { TRY(argument(key, argv[2])); }
  if (old && sqlite3_value_nochange(argv[4])) weight = old->weight;
  else if (sqlite3_value_type(argv[4]) != SQLITE_NULL) {
    if (sqlite3_value_type(argv[4]) != SQLITE_INTEGER || sqlite3_value_int64(argv[4]) <= 0) { rc = SQLITE_CONSTRAINT; goto done; }
    weight = sqlite3_value_int64(argv[4]);
  } else if (old) { rc = SQLITE_CONSTRAINT; goto done; }
  for (i = 5; i < argc; i++) if (!sqlite3_value_nochange(argv[i]) && (old || sqlite3_value_type(argv[i]) != SQLITE_NULL)) {
    rc = SQLITE_CONSTRAINT; goto done;
  }
  TRY(find(v, root, key, &found));
  if (found && (!old || found != old->id)) { rc = SQLITE_CONSTRAINT; goto done; }
  same_key = old && mpq_equal(old->key, key);
  if (!old) {
    sqlite3_bind_int64(v->get, 1, id); i = sqlite3_step(v->get); sqlite3_reset(v->get);
    if (i == SQLITE_ROW) { rc = SQLITE_CONSTRAINT; goto done; }
    if (i != SQLITE_DONE) { rc = i; goto done; }
  }
  /* Reject count overflow before any writes. */
  {
    Node *top = NULL;
    sqlite3_int64 total;
    TRY(node_get(v, root, &top));
    total = top ? top->count : 0; node_free(top);
    if (old) total -= old->weight;
    TRY(checked_add(total, weight, &total));
  }
  if (same_key) {
    if (sqlite3_value_nochange(argv[3])) {
      int step;
      sqlite3_bind_int64(v->payload, 1, id); step = sqlite3_step(v->payload);
      if (step != SQLITE_ROW) { sqlite3_reset(v->payload); rc = SQLITE_CORRUPT; goto done; }
      sqlite3_bind_value(v->change, 1, sqlite3_column_value(v->payload, 0)); sqlite3_reset(v->payload);
    } else sqlite3_bind_value(v->change, 1, argv[3]);
    sqlite3_bind_int64(v->change, 2, weight); sqlite3_bind_int64(v->change, 3, id);
    TRY(finish(v->change)); TRY(insert_tree(v, root, id, key, &root, 0));
  } else {
    sqlite3_value *payload = NULL;
    if (old && sqlite3_value_nochange(argv[3])) {
      int step;
      sqlite3_bind_int64(v->payload, 1, old->id); step = sqlite3_step(v->payload);
      if (step == SQLITE_ROW) payload = sqlite3_value_dup(sqlite3_column_value(v->payload, 0));
      sqlite3_reset(v->payload);
      if (step != SQLITE_ROW || !payload) { rc = step == SQLITE_ROW ? SQLITE_NOMEM : SQLITE_CORRUPT; goto done; }
    }
    if (old) rc = delete_tree(v, root, old->key, &root, 0);
    if (rc == SQLITE_OK) {
      sqlite3_bind_int64(v->insert, 1, id); rc = bind_q(v->insert, 2, key);
      sqlite3_bind_value(v->insert, 3, payload ? payload : argv[3]); sqlite3_bind_int64(v->insert, 4, weight);
      if (rc == SQLITE_OK) rc = finish(v->insert);
    }
    sqlite3_value_free(payload);
    if (rc != SQLITE_OK) goto done;
    TRY(insert_tree(v, root, id, key, &root, 0));
  }
  if (id >= next) next = id + 1;
  *rowid_out = id;
metadata:
  sqlite3_bind_int64(v->root_set, 1, root); sqlite3_bind_int64(v->root_set, 2, next);
  TRY(finish(v->root_set));
done:
  sqlite3_reset(v->insert); sqlite3_clear_bindings(v->insert);
  sqlite3_reset(v->change); sqlite3_clear_bindings(v->change);
  if (rc != SQLITE_OK) {
    sqlite3_free(v->base.zErrMsg); v->base.zErrMsg = sqlite3_mprintf("rational_index: invalid mutation or index error (%d)", rc);
  }
  node_free(old); mpq_clear(key); return rc;
}
static int transaction(sqlite3_vtab *table) { (void)table; return SQLITE_OK; }
static int savepoint(sqlite3_vtab *table, int number) { (void)table; (void)number; return SQLITE_OK; }
static int shadow(const char *name) { return sqlite3_stricmp(name, "nodes") == 0 || sqlite3_stricmp(name, "meta") == 0; }
int q_index_register(sqlite3 *db) {
  static const sqlite3_module module = {
    .iVersion = 3, .xCreate = create_table, .xConnect = connect_table, .xBestIndex = best_index,
    .xDisconnect = disconnect, .xDestroy = destroy, .xOpen = open_cursor, .xClose = close_cursor,
    .xFilter = filter, .xNext = next_row, .xEof = eof, .xColumn = column, .xRowid = rowid,
    .xUpdate = update, .xBegin = transaction, .xSync = transaction, .xCommit = transaction,
    .xRollback = transaction, .xSavepoint = savepoint, .xRelease = savepoint,
    .xRollbackTo = savepoint, .xShadowName = shadow
  };
  return sqlite3_create_module_v2(db, "rational_index", &module, NULL, NULL);
}
