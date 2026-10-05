#ifndef Q_INTERNAL_H
#define Q_INTERNAL_H
#include <sqlite3ext.h>
SQLITE_EXTENSION_INIT3
#include <gmp.h>
#include <stdint.h>
#include <string.h>
#include <limits.h>
#include <stdlib.h>
int q_parse(mpq_t out, const char *text, int length);
char *q_text(const mpq_t value);
void q_result(sqlite3_context *ctx, const mpq_t value);
int q_index_register(sqlite3 *db);
#endif
