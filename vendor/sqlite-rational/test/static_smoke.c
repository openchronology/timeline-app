#include "sqlite_rational.h"
#include <stdio.h>
#include <string.h>

int main(void) {
  sqlite3 *db = NULL;
  sqlite3_stmt *s = NULL;
  char *error = NULL;
  int rc = sqlite3_open(":memory:", &db), result = 1;
  if (rc != SQLITE_OK || sqlite_rational_register(db) != SQLITE_OK) goto done;
  rc = sqlite3_exec(db,
    "CREATE VIRTUAL TABLE points USING rational_index;"
    "INSERT INTO points(time,value,weight) VALUES('0','first',2),('1/1000000','next',3);",
    NULL, NULL, &error);
  if (rc != SQLITE_OK) { fprintf(stderr, "%s\n", error ? error : "SQL failed"); goto done; }
  rc = sqlite3_prepare_v2(db,
    "SELECT weight,distinct_count,visited_nodes,time,last_time FROM points"
    " WHERE lower='-1' AND upper='1' AND threshold='1/1000' AND mode='neighbors';",
    -1, &s, NULL);
  if (rc != SQLITE_OK || sqlite3_step(s) != SQLITE_ROW) goto done;
  if (sqlite3_column_int64(s, 0) != 5 || sqlite3_column_int64(s, 1) != 2 ||
      sqlite3_column_int64(s, 2) != 1 ||
      strcmp((const char *)sqlite3_column_text(s, 3), "0/1") ||
      strcmp((const char *)sqlite3_column_text(s, 4), "1/1000000")) goto done;
  if (sqlite3_step(s) != SQLITE_DONE) goto done;
  result = 0;
done:
  sqlite3_free(error);
  sqlite3_finalize(s);
  if (db && result) fprintf(stderr, "static registration/query failed: %s\n", sqlite3_errmsg(db));
  sqlite3_close(db);
  return result;
}
