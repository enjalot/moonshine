import os
import tempfile
import unittest

from scanner import system_tool


class SystemToolTest(unittest.TestCase):
    def test_prefers_an_executable_in_system_directories(self):
        with tempfile.TemporaryDirectory() as root:
            first = os.path.join(root, "first")
            second = os.path.join(root, "second")
            os.makedirs(first)
            os.makedirs(second)
            candidate = os.path.join(second, "ss")
            with open(candidate, "w", encoding="utf-8"):
                pass
            os.chmod(candidate, 0o700)
            self.assertEqual(system_tool("ss", (first, second)), candidate)

    def test_falls_back_to_path_lookup(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertEqual(system_tool("missing-tool", (root,)), "missing-tool")


if __name__ == "__main__":
    unittest.main()
