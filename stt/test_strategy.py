import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from strategy import FallbackConfig, PassMetrics, choose_better_pass, should_retry_without_vad


class StrategyTests(unittest.TestCase):
    def test_retry_triggers_for_long_audio_with_low_word_count(self):
        cfg = FallbackConfig(long_audio_seconds=6, min_words_long_audio=3)
        metrics = PassMetrics(text="hello", audio_duration_seconds=9.0, speech_seconds_kept=7.0)
        self.assertTrue(should_retry_without_vad(metrics, cfg))

    def test_retry_triggers_for_zero_fillers_in_long_audio(self):
        cfg = FallbackConfig(zero_fillers_seconds=10)
        metrics = PassMetrics(
            text="this is definitely a longer sentence with no disfluency markers",
            audio_duration_seconds=12.0,
            speech_seconds_kept=11.5,
        )
        self.assertTrue(should_retry_without_vad(metrics, cfg))

    def test_retry_triggers_for_low_speech_ratio(self):
        cfg = FallbackConfig(min_speech_ratio=0.25)
        metrics = PassMetrics(text="okay maybe", audio_duration_seconds=10.0, speech_seconds_kept=1.5)
        self.assertTrue(should_retry_without_vad(metrics, cfg))

    def test_retry_not_triggered_when_metrics_look_reasonable(self):
        cfg = FallbackConfig()
        metrics = PassMetrics(
            text="um i think this is okay and you know we can proceed",
            audio_duration_seconds=9.0,
            speech_seconds_kept=6.8,
        )
        self.assertFalse(should_retry_without_vad(metrics, cfg))

    def test_choose_prefers_more_words(self):
        pass_a = PassMetrics(text="um okay", audio_duration_seconds=8.0)
        pass_b = PassMetrics(text="um okay i think we should probably continue now", audio_duration_seconds=8.0)
        self.assertEqual(choose_better_pass(pass_a, pass_b), "no_vad")

    def test_choose_prefers_more_fillers_when_word_count_similar(self):
        pass_a = PassMetrics(text="i think we should continue now", audio_duration_seconds=8.0)
        pass_b = PassMetrics(text="um i think we should continue now", audio_duration_seconds=8.0)
        self.assertEqual(choose_better_pass(pass_a, pass_b), "no_vad")

    def test_choose_defaults_to_vad_on_tie(self):
        pass_a = PassMetrics(text="i think this works", audio_duration_seconds=8.0)
        pass_b = PassMetrics(text="i think this works", audio_duration_seconds=8.0)
        self.assertEqual(choose_better_pass(pass_a, pass_b), "vad")


if __name__ == "__main__":
    unittest.main()
