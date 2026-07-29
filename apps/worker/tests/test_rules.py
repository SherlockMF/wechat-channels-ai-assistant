from app.analysis.rules import NO_RETENTION_LIMITATION, build_rule_result


def test_without_retention_does_not_claim_deterministic_dropoff():
    result = build_rule_result(
        {
            "description": "示例视频",
            "completion_rate": 0.0945,
        },
        30,
    )
    serialized = result.model_dump_json()
    assert NO_RETENTION_LIMITATION in result.limitations
    assert "大量流失" not in serialized
    assert "真实流失秒数" in serialized
