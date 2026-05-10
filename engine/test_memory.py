"""
Unit tests for memory retrieval mechanics — no LLM calls, no scenario knowledge.
Dummy memory content is arbitrary; only the scoring math is being tested.
"""
from engine.agent import Memory
from engine.memory import (
    retrieve_memories,
    score_recency,
    score_relevance,
    build_memory_context,
)


def test_recency_decay():
    assert score_recency(0, 0) == 1.0
    assert score_recency(0, 50) < score_recency(0, 10)
    assert score_recency(0, 200) < 0.5
    print("recency decay: OK")


def test_relevance_overlap():
    m = Memory("placeholder", 0, 5.0, ["home", "neighborhood", "event"])
    high = score_relevance(m, ["home", "neighborhood"])
    low  = score_relevance(m, ["weather", "sports"])
    assert high > low
    assert low == 0.0
    print(f"relevance scoring: OK  (overlap={high:.2f}, unrelated={low:.2f})")


def test_retrieval_ordering():
    # high importance, relevant keywords, recent
    m_high = Memory("A", 10, 9.5, ["event", "community"])
    # low importance, irrelevant, recent
    m_low  = Memory("B", 12, 1.0,  ["routine"])
    # medium importance, relevant, slightly older
    m_mid  = Memory("C", 8,  7.0,  ["event", "neighbor"])

    results = retrieve_memories(
        [m_high, m_low, m_mid],
        current_tick=15,
        query_keywords=["event"],
        top_k=2,
    )
    assert len(results) == 2
    assert m_low not in results  # low importance + irrelevant should be cut
    print("retrieval ordering: OK")


def test_old_memories_deprioritized():
    m_old    = Memory("X", 1,   2.0, ["event"])
    m_recent = Memory("Y", 100, 9.0, ["event"])
    results  = retrieve_memories([m_old, m_recent], current_tick=100, query_keywords=["event"], top_k=2)
    assert results[0].timestamp == 100
    print("old memory deprioritized: OK")


def test_empty_memories():
    assert retrieve_memories([], current_tick=10, query_keywords=["x"], top_k=5) == []
    assert "No relevant memories" in build_memory_context([])
    print("empty memory handling: OK")


if __name__ == "__main__":
    test_recency_decay()
    test_relevance_overlap()
    test_retrieval_ordering()
    test_old_memories_deprioritized()
    test_empty_memories()
    print("\nAll memory tests passed.")
