import os
import stat
import tempfile
import unittest
from unittest import mock

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
            with mock.patch("control_token.time.sleep"):
                with self.assertRaisesRegex(RuntimeError, "control token file is empty"):
                    load_or_create_control_token(None, path)

    def test_exclusive_create_loser_waits_for_winner_to_write(self):
        with tempfile.TemporaryDirectory() as root:
            path = os.path.join(root, "control-token")

            def lose_create_race(*_args):
                with open(path, "w", encoding="utf-8"):
                    pass
                raise FileExistsError(path)

            def finish_winner(_delay):
                with open(path, "w", encoding="utf-8") as token_file:
                    token_file.write("winner-token\n")

            with mock.patch("control_token.os.open", side_effect=lose_create_race):
                with mock.patch("control_token.time.sleep", side_effect=finish_winner) as sleep:
                    token, source = load_or_create_control_token(
                        None, path, token_factory=lambda: "loser-token"
                    )

            self.assertEqual((token, source), ("winner-token", "file"))
            sleep.assert_called_once()

    def test_control_url_encodes_the_token(self):
        self.assertEqual(
            control_url("moonshine.local", 8600, "a token/+"),
            "http://moonshine.local:8600/?token=a+token%2F%2B",
        )


if __name__ == "__main__":
    unittest.main()
