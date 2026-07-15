import os
import stat
import tempfile
import unittest

from control_token import control_url, load_or_create_control_token


class ControlTokenTest(unittest.TestCase):
    def test_explicit_token_wins_without_creating_a_file(self):
        with tempfile.TemporaryDirectory() as root:
            path = os.path.join(root, "control-token")
            token, source = load_or_create_control_token("configured", path)
            self.assertEqual((token, source), ("configured", "environment"))
            self.assertFalse(os.path.exists(path))

    def test_generated_token_is_private_and_reused(self):
        with tempfile.TemporaryDirectory() as root:
            path = os.path.join(root, "sites", "control-token")
            first, source = load_or_create_control_token(
                None, path, token_factory=lambda: "first-token"
            )
            second, second_source = load_or_create_control_token(
                None, path, token_factory=lambda: "different-token"
            )
            self.assertEqual((first, source), ("first-token", "file"))
            self.assertEqual((second, second_source), ("first-token", "file"))
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)

    def test_empty_token_file_fails_instead_of_rotating(self):
        with tempfile.TemporaryDirectory() as root:
            path = os.path.join(root, "control-token")
            with open(path, "w", encoding="utf-8"):
                pass
            with self.assertRaisesRegex(RuntimeError, "control token file is empty"):
                load_or_create_control_token(None, path)

    def test_control_url_encodes_the_token(self):
        self.assertEqual(
            control_url("moonshine.local", 8600, "a token/+"),
            "http://moonshine.local:8600/?token=a+token%2F%2B",
        )


if __name__ == "__main__":
    unittest.main()
