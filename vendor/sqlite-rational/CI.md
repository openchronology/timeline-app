# GitHub Actions

Publish **this directory's contents** as the repository root, including the hidden
.github directory. The workflow lives at .github/workflows/ci.yml and has no
dependency on the browser project or compatibility harness. This follows
[GitHub's workflow layout](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).

The workflow runs on pushes, pull requests, and manual dispatch:

- Workflow syntax is checked with checksum-verified actionlint; installed
  ShellCheck checks embedded shell commands.
- GCC Release on Ubuntu 22.04, GCC Debug on Ubuntu 24.04, and Clang Release on
  Ubuntu 24.04 build the loadable extension and static library.
- Both static registration and the full Python suite must run. CMake requires
  Python with BUILD_TESTING=ON; CTest fails if no tests are found.
- Each job installs libraries/header/notices and creates a source archive.
  The archive is extracted into a temporary directory, independently rebuilt,
  tested, and installed. Build directories and previous artifacts are excluded.
- Each matrix job uploads installed files and its tested source archive using a
  unique artifact name.

Native dependencies are installed explicitly from the runner's package repository.
Actions are pinned to release commit hashes. Jobs have timeouts and read access
to repository contents; no secrets, publication token, or external service is needed.
Download outputs from the workflow run's Artifacts section. CI does not create
GitHub releases or claim macOS/Windows/WASM binary support.

Local equivalents:

~~~sh
cmake -S . -B build -DBUILD_TESTING=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel 2
ctest --test-dir build --output-on-failure --no-tests=error
cmake --install build --prefix package
cpack --config build/CPackSourceConfig.cmake -B artifacts
python3 test/test_source_package.py artifacts/*.tar.gz
~~~

For Clang, configure a fresh build directory with -DCMAKE_C_COMPILER=clang.
Tests are enabled by default; embedding consumers that do not need Python
may configure with -DBUILD_TESTING=OFF.

The first [GitHub-hosted run](https://github.com/athanclark/sqlite-rational/actions/runs/37241059512)
passed every job, including workflow linting, the GCC/Clang matrix, required tests,
and independent source-archive builds. Subsequent pushes and pull requests run
the same workflow.

Cross-backend checks live in the independent rational-conformance project. Its CI
builds this repository's upstream default branch alongside rational-map and pgmp,
and can select explicit refs without adding sibling dependencies here.
