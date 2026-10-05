"""Check the source distribution without any sibling project or existing build."""
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
import tempfile

def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 test/test_source_package.py SOURCE.tar.gz")
    archive_path = Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix="sqlite-rational-source-") as directory:
        temp = Path(directory)
        with tarfile.open(archive_path) as archive:
            members = archive.getmembers()
            for member in members:
                parts = PurePosixPath(member.name).parts
                if not parts or member.name.startswith("/") or ".." in parts:
                    raise AssertionError("Unsafe source archive path: " + member.name)
                if not (member.isfile() or member.isdir()):
                    raise AssertionError("Unexpected source archive entry: " + member.name)
                if any(part in {".git", "package", "artifacts", "__pycache__"}
                       or part.startswith("build") for part in parts[1:-1]):
                    raise AssertionError("Build product included in source archive: " + member.name)
            top = {PurePosixPath(m.name).parts[0] for m in members}
            if len(top) != 1:
                raise AssertionError("Expected exactly one source archive directory")
            # Python versions before extraction filters are supported by the checks above.
            options = {"filter": "data"} if hasattr(tarfile, "data_filter") else {}
            archive.extractall(temp, **options)
        source = temp / top.pop()
        for required in ["CMakeLists.txt", "LICENSE", "README.md", "THIRD_PARTY.md",
                         "include/sqlite_rational.h", "src/rational.c", "src/index.c",
                         "test/static_smoke.c", "test/test_extension.py"]:
            if not (source / required).is_file():
                raise AssertionError("Missing source distribution file: " + required)
        build, install = temp / "build", temp / "install"
        subprocess.run(["cmake", "-S", str(source), "-B", str(build),
                        "-DBUILD_TESTING=ON", "-DCMAKE_BUILD_TYPE=Release",
                        "-DPython3_EXECUTABLE=" + sys.executable], check=True)
        subprocess.run(["cmake", "--build", str(build), "--parallel", "2"], check=True)
        subprocess.run(["ctest", "--test-dir", str(build), "--output-on-failure",
                        "--no-tests=error"], check=True)
        subprocess.run(["cmake", "--install", str(build), "--prefix", str(install)], check=True)
        assert (install / "include/sqlite_rational.h").is_file()
        assert (install / "share/doc/sqlite-rational/THIRD_PARTY.md").is_file()
        assert (install / "lib/libsqlite_rational_static.a").is_file()
        assert list((install / "lib").glob("sqlite_rational.*"))
        print("PASS independent SQLite source distribution: build, tests, install")

if __name__ == "__main__":
    main()
