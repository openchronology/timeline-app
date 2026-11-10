#include <sqlite3ext.h>
SQLITE_EXTENSION_INIT1
#include "internal.h"
static void gmp_free(void *p, size_t size) {
  void (*release)(void *, size_t);
  mp_get_memory_functions(NULL, NULL, &release); release(p, size);
}
int q_parse(mpq_t out, const char *text, int length) {
  int i = 0, slash = -1;
  char *copy;
  if (!text || length <= 0) return SQLITE_MISMATCH;
  if (text[i] == '+' || text[i] == '-') i++;
  if (i == length || text[i] < '0' || text[i] > '9') return SQLITE_MISMATCH;
  while (i < length && text[i] >= '0' && text[i] <= '9') i++;
  if (i < length && text[i] == '/') {
    slash = i++;
    if (i < length && (text[i] == '+' || text[i] == '-')) i++;
    if (i == length || text[i] < '0' || text[i] > '9') return SQLITE_MISMATCH;
    while (i < length && text[i] >= '0' && text[i] <= '9') i++;
  }
  if (i != length) return SQLITE_MISMATCH;
  copy = sqlite3_malloc64((sqlite3_uint64)length + 1);
  if (!copy) return SQLITE_NOMEM;
  memcpy(copy, text, (size_t)length); copy[length] = 0;
  if (slash >= 0) copy[slash] = 0;
  if (mpz_set_str(mpq_numref(out), copy + (copy[0] == '+'), 10) != 0) {
    sqlite3_free(copy); return SQLITE_MISMATCH;
  }
  if (slash >= 0) {
    const char *d = copy + slash + 1;
    if (mpz_set_str(mpq_denref(out), d + (d[0] == '+'), 10) != 0) {
      sqlite3_free(copy); return SQLITE_MISMATCH;
    }
  } else mpz_set_ui(mpq_denref(out), 1);
  sqlite3_free(copy);
  if (mpz_sgn(mpq_denref(out)) == 0) return SQLITE_MISMATCH;
  mpq_canonicalize(out); return SQLITE_OK;
}
char *q_text(const mpq_t value) {
  char *raw = mpq_get_str(NULL, 10, value);
  char *result = strchr(raw, '/') ? sqlite3_mprintf("%s", raw) : sqlite3_mprintf("%s/1", raw);
  gmp_free(raw, strlen(raw) + 1); return result;
}
void q_result(sqlite3_context *ctx, const mpq_t value) {
  char *text = q_text(value);
  if (!text) sqlite3_result_error_nomem(ctx);
  else sqlite3_result_text(ctx, text, -1, sqlite3_free);
}
/* The longest argument the functions read, and the largest decimal exponent q_decimal takes.
   Exact values stay far larger than any time needs (the editor takes 20,000 characters and
   exponents to 10,000), but no single call can ask GMP for a number so large that allocating
   or computing it exhausts memory or kills the process: 1e99999999999 would. Larger inputs are
   refused with SQLITE_TOOBIG. */
#define Q_ARGUMENT_BYTES 1048576
#define Q_DECIMAL_EXPONENT 10000UL
static int q_arg(mpq_t out, sqlite3_value *arg) {
  if (sqlite3_value_type(arg) != SQLITE_TEXT) return SQLITE_MISMATCH;
  if (sqlite3_value_bytes(arg) > Q_ARGUMENT_BYTES) return SQLITE_TOOBIG;
  return q_parse(out, (const char *)sqlite3_value_text(arg), sqlite3_value_bytes(arg));
}
static int decimal(mpq_t out, const char *s, int len) {
  int i = 0, j = 0, neg = 0, frac = 0, digits = 0, exp_neg = 0;
  unsigned long exponent = 0;
  char *coefficient;
  mpz_t power;
  if (!s || len <= 0) return SQLITE_MISMATCH;
  coefficient = sqlite3_malloc64((sqlite3_uint64)len + 1);
  if (!coefficient) return SQLITE_NOMEM;
  if (s[i] == '+' || s[i] == '-') { neg = s[i] == '-'; i++; }
  while (i < len && s[i] >= '0' && s[i] <= '9') { coefficient[j++] = s[i++]; digits++; }
  if (i < len && s[i] == '.') {
    i++;
    while (i < len && s[i] >= '0' && s[i] <= '9') {
      coefficient[j++] = s[i++]; digits++; frac++;
    }
  }
  if (!digits) { sqlite3_free(coefficient); return SQLITE_MISMATCH; }
  if (i < len && (s[i] == 'e' || s[i] == 'E')) {
    i++;
    if (i < len && (s[i] == '+' || s[i] == '-')) { exp_neg = s[i] == '-'; i++; }
    if (i == len || s[i] < '0' || s[i] > '9') { sqlite3_free(coefficient); return SQLITE_MISMATCH; }
    while (i < len && s[i] >= '0' && s[i] <= '9') {
      exponent = exponent * 10 + (unsigned)(s[i++] - '0');
      if (exponent > Q_DECIMAL_EXPONENT) { sqlite3_free(coefficient); return SQLITE_TOOBIG; }
    }
  }
  if (i != len) { sqlite3_free(coefficient); return SQLITE_MISMATCH; }
  coefficient[j] = 0; mpz_set_str(mpq_numref(out), coefficient, 10);
  sqlite3_free(coefficient); mpz_set_ui(mpq_denref(out), 1);
  if (mpz_sgn(mpq_numref(out)) == 0) return SQLITE_OK;
  if (neg) mpz_neg(mpq_numref(out), mpq_numref(out));
  mpz_init(power);
  if (exp_neg || exponent < (unsigned long)frac) {
    mpz_ui_pow_ui(mpq_denref(out), 10, exp_neg ? exponent + (unsigned long)frac : (unsigned long)frac - exponent);
  } else {
    mpz_ui_pow_ui(power, 10, exponent - (unsigned long)frac);
    mpz_mul(mpq_numref(out), mpq_numref(out), power);
  }
  mpz_clear(power); mpq_canonicalize(out); return SQLITE_OK;
}
enum { Q_NORMALIZE, Q_MAKE, Q_DECIMAL, Q_VALID, Q_CMP, Q_ADD, Q_SUB, Q_MUL, Q_DIV,
       Q_NEG, Q_ABS, Q_FLOOR, Q_CEIL, Q_NUM, Q_DEN, Q_MIN, Q_MAX };
static void scalar(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
  int op = (int)(intptr_t)sqlite3_user_data(ctx), rc = SQLITE_OK, i;
  mpq_t a, b;
  mpq_inits(a, b, NULL);
  for (i = 0; i < argc; i++) if (sqlite3_value_type(argv[i]) == SQLITE_NULL) {
    if (op == Q_VALID) sqlite3_result_int(ctx, 0); else sqlite3_result_null(ctx);
    goto done;
  }
  if (op == Q_DECIMAL) {
    rc = sqlite3_value_type(argv[0]) != SQLITE_TEXT ? SQLITE_MISMATCH
      : sqlite3_value_bytes(argv[0]) > Q_ARGUMENT_BYTES ? SQLITE_TOOBIG
      : decimal(a, (const char *)sqlite3_value_text(argv[0]), sqlite3_value_bytes(argv[0]));
  } else rc = q_arg(a, argv[0]);
  if (op == Q_VALID) {
    char *normalized = rc == SQLITE_OK ? q_text(a) : NULL;
    if (rc == SQLITE_NOMEM || (rc == SQLITE_OK && !normalized)) sqlite3_result_error_nomem(ctx);
    else sqlite3_result_int(ctx, normalized && (int)strlen(normalized) == sqlite3_value_bytes(argv[0])
      && memcmp(normalized, sqlite3_value_text(argv[0]), strlen(normalized)) == 0);
    sqlite3_free(normalized); goto done;
  }
  if (rc == SQLITE_OK && argc == 2) rc = q_arg(b, argv[1]);
  if (rc != SQLITE_OK) {
    sqlite3_result_error(ctx, rc == SQLITE_TOOBIG ? "Rational argument or decimal exponent too large" : "Expected exact rational TEXT", -1);
    sqlite3_result_error_code(ctx, rc); goto done;
  }
  switch (op) {
    case Q_MAKE:
      if (strchr((const char *)sqlite3_value_text(argv[0]), '/') ||
          strchr((const char *)sqlite3_value_text(argv[1]), '/') || mpq_sgn(b) == 0) {
        sqlite3_result_error(ctx, "Expected integer TEXT components and nonzero denominator", -1); goto done;
      }
      mpq_div(a, a, b); break;
    case Q_CMP: { int c = mpq_cmp(a, b); sqlite3_result_int(ctx, (c > 0) - (c < 0)); goto done; }
    case Q_ADD: mpq_add(a, a, b); break;
    case Q_SUB: mpq_sub(a, a, b); break;
    case Q_MUL: mpq_mul(a, a, b); break;
    case Q_DIV:
      if (mpq_sgn(b) == 0) { sqlite3_result_error(ctx, "Division by zero", -1); goto done; }
      mpq_div(a, a, b); break;
    case Q_NEG: mpq_neg(a, a); break;
    case Q_ABS: mpq_abs(a, a); break;
    case Q_FLOOR: mpz_fdiv_q(mpq_numref(a), mpq_numref(a), mpq_denref(a)); mpz_set_ui(mpq_denref(a), 1); break;
    case Q_CEIL: mpz_cdiv_q(mpq_numref(a), mpq_numref(a), mpq_denref(a)); mpz_set_ui(mpq_denref(a), 1); break;
    case Q_NUM: case Q_DEN: {
      char *raw = mpz_get_str(NULL, 10, op == Q_NUM ? mpq_numref(a) : mpq_denref(a));
      sqlite3_result_text(ctx, raw, -1, SQLITE_TRANSIENT); gmp_free(raw, strlen(raw) + 1); goto done;
    }
    case Q_MIN: if (mpq_cmp(b, a) < 0) mpq_set(a, b); break;
    case Q_MAX: if (mpq_cmp(b, a) > 0) mpq_set(a, b); break;
    default: break;
  }
  q_result(ctx, a);
done:
  mpq_clears(a, b, NULL);
}
/* q_sum(x): the exact sum of the group's rationals, NULLs skipped, '0/1' over none. An
   argument that is not exact rational TEXT fails the query, as the scalar functions do. */
typedef struct { int ready, failed; mpq_t sum; } Sum;
static void sum_step(sqlite3_context *ctx, int argc, sqlite3_value **argv) {
  Sum *s = sqlite3_aggregate_context(ctx, sizeof(*s));
  mpq_t v;
  int rc;
  (void)argc;
  if (!s) { sqlite3_result_error_nomem(ctx); return; }
  if (!s->ready) { mpq_init(s->sum); s->ready = 1; }
  if (s->failed || sqlite3_value_type(argv[0]) == SQLITE_NULL) return;
  mpq_init(v); rc = q_arg(v, argv[0]);
  if (rc == SQLITE_OK) mpq_add(s->sum, s->sum, v); else s->failed = rc;
  mpq_clear(v);
}
static void sum_final(sqlite3_context *ctx) {
  Sum *s = sqlite3_aggregate_context(ctx, 0);
  if (s && s->failed) {
    sqlite3_result_error(ctx, s->failed == SQLITE_TOOBIG ? "Rational argument too large" : "Expected exact rational TEXT", -1);
    sqlite3_result_error_code(ctx, s->failed);
  } else if (!s || !s->ready) sqlite3_result_text(ctx, "0/1", -1, SQLITE_STATIC);
  else q_result(ctx, s->sum);
  if (s && s->ready) mpq_clear(s->sum);
}
static int collation(void *unused, int an, const void *ap, int bn, const void *bp) {
  int ar, br, result;
  mpq_t a, b;
  (void)unused; mpq_inits(a, b, NULL);
  ar = q_parse(a, ap, an); br = q_parse(b, bp, bn);
  if (ar == SQLITE_NOMEM || br == SQLITE_NOMEM) abort();
  if (ar == SQLITE_OK && br == SQLITE_OK) result = mpq_cmp(a, b);
  else if (ar == SQLITE_OK) result = -1;
  else if (br == SQLITE_OK) result = 1;
  else { result = memcmp(ap, bp, (size_t)(an < bn ? an : bn)); if (!result) result = (an > bn) - (an < bn); }
  mpq_clears(a, b, NULL); return (result > 0) - (result < 0);
}
int sqlite_rational_register(sqlite3 *db) {
  /* Only q_is_canonical may appear in a database's schema (its CHECK constraints), so only it
     is innocuous. The rest are direct-only: a file's views, triggers, defaults, indexes and
     generated columns cannot call them, so opening a crafted file never runs arithmetic its
     author chose. */
  static const struct { const char *name; int argc; int op; int flags; } functions[] = {
    {"q",1,Q_NORMALIZE,SQLITE_DIRECTONLY},{"q_make",2,Q_MAKE,SQLITE_DIRECTONLY},
    {"q_decimal",1,Q_DECIMAL,SQLITE_DIRECTONLY},{"q_is_canonical",1,Q_VALID,SQLITE_INNOCUOUS},
    {"q_cmp",2,Q_CMP,SQLITE_DIRECTONLY},{"q_add",2,Q_ADD,SQLITE_DIRECTONLY},
    {"q_sub",2,Q_SUB,SQLITE_DIRECTONLY},{"q_mul",2,Q_MUL,SQLITE_DIRECTONLY},
    {"q_div",2,Q_DIV,SQLITE_DIRECTONLY},{"q_neg",1,Q_NEG,SQLITE_DIRECTONLY},
    {"q_abs",1,Q_ABS,SQLITE_DIRECTONLY},{"q_floor",1,Q_FLOOR,SQLITE_DIRECTONLY},
    {"q_ceil",1,Q_CEIL,SQLITE_DIRECTONLY},{"q_num",1,Q_NUM,SQLITE_DIRECTONLY},
    {"q_den",1,Q_DEN,SQLITE_DIRECTONLY},{"q_min",2,Q_MIN,SQLITE_DIRECTONLY},
    {"q_max",2,Q_MAX,SQLITE_DIRECTONLY}
  };
  unsigned i;
  int rc = sqlite3_create_collation_v2(db, "RATIONAL_V1", SQLITE_UTF8, NULL, collation, NULL);
  for (i = 0; rc == SQLITE_OK && i < sizeof(functions)/sizeof(functions[0]); i++)
    rc = sqlite3_create_function_v2(db, functions[i].name, functions[i].argc,
      SQLITE_UTF8 | SQLITE_DETERMINISTIC | functions[i].flags,
      (void *)(intptr_t)functions[i].op, scalar, NULL, NULL, NULL);
  if (rc == SQLITE_OK)
    rc = sqlite3_create_function_v2(db, "q_sum", 1, SQLITE_UTF8 | SQLITE_DETERMINISTIC | SQLITE_DIRECTONLY,
      NULL, NULL, sum_step, sum_final, NULL);
  if (rc == SQLITE_OK) rc = q_index_register(db);
  return rc;
}
#ifdef _WIN32
__declspec(dllexport)
#endif
int sqlite3_sqliterational_init(sqlite3 *db, char **error, const sqlite3_api_routines *api) {
  int rc;
  SQLITE_EXTENSION_INIT2(api);
  rc = sqlite_rational_register(db);
  if (rc != SQLITE_OK && error) *error = sqlite3_mprintf("sqlite-rational: %s", sqlite3_errmsg(db));
  return rc;
}
