# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# pgmp, the PostgreSQL extension the server stores exact times with (#461): the same pinned
# commit as deploy/Dockerfile.postgres, built for the PostgreSQL whose package set calls this.
{
  lib,
  fetchFromGitHub,
  gmp,
  postgresql,
  postgresqlBuildExtension,
  python3,
}:

postgresqlBuildExtension {
  pname = "pgmp";
  version = "1.1-unstable-1849585";

  src = fetchFromGitHub {
    owner = "dvarrazzo";
    repo = "pgmp";
    rev = "1849585416f2bc3d070bf8cef6a659907687ec7f";
    hash = "sha256-D0zdDXFf8XJkRKOvxGuhy/sWAWoEquRmYv1wnD3Vz+I=";
  };

  nativeBuildInputs = [ python3 ];
  buildInputs = [ gmp ];

  # The extension's install scripts are generated, as the Dockerfiles generate them.
  preBuild = ''
    python3 tools/unmix.py < sql/pgmp.pysql > sql/pgmp--1.1.sql
    python3 tools/sql2extension.py --extname pgmp sql/pgmp--1.1.sql > sql/pgmp--unpackaged--1.1.sql
  '';
  makeFlags = [ "with_llvm=no" ];

  meta = {
    description = "Arbitrary precision integers and rationals for PostgreSQL";
    homepage = "https://github.com/dvarrazzo/pgmp";
    license = lib.licenses.lgpl3Plus;
    platforms = postgresql.meta.platforms;
  };
}
