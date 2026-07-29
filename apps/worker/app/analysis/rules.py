from app.schemas.analysis import DiagnosisResult


NO_RETENTION_LIMITATION = "当前没有逐秒留存数据，不能定位真实流失秒数。"


def build_rule_result(record: dict, duration: float) -> DiagnosisResult:
    completion_rate = record.get("completion_rate")
    completion_text = (
        f"{completion_rate * 100:.2f}%" if completion_rate is not None else "暂无"
    )
    end = max(1.0, duration)
    return DiagnosisResult.model_validate(
        {
            "executiveSummary": "先压缩开头信息路径，再用转写和关键帧复核中段重复与结尾动作。",
            "dataAssessment": {
                "performanceLevel": "normal",
                "sampleConfidence": "low",
                "facts": [
                    f"该视频完播率为 {completion_text}。",
                    f"视频总时长为 {duration:.1f} 秒。",
                    "当前结论来自整体指标与内容特征，不包含逐秒留存。",
                ],
            },
            "primaryProblems": [
                {
                    "category": "hook",
                    "severity": "high",
                    "startSecond": 0,
                    "endSecond": min(3, end),
                    "contentEvidence": ["需结合 0～3 秒关键帧确认主题进入时间。"],
                    "dataEvidence": [f"整体完播率为 {completion_text}。"],
                    "inference": "开头可能存在影响观看动力的结构问题，但不能据此断言真实流失。",
                    "recommendation": "0～1 秒展示结果，3 秒内说明对象和收益。",
                    "expectedMetric": "completion_rate",
                    "confidence": "low",
                }
            ],
            "editingPlan": [
                {
                    "startSecond": 0,
                    "endSecond": min(3, end),
                    "originalContent": "原片开头",
                    "problem": "主题进入时间需要复核。",
                    "action": "replace",
                    "replacementContent": "使用结果画面和一句话利益点。",
                    "requiresReshoot": True,
                }
            ],
            "revisedOpening": [
                {
                    "startSecond": 0,
                    "endSecond": min(1, end),
                    "visual": "结果画面；无素材时补拍。",
                    "voiceover": "先说结果或痛点。",
                    "subtitle": "一句话利益点",
                    "audio": "首字即入，人声优先。",
                    "editingRhythm": "1 秒内第一次视觉变化。",
                    "requiresReshoot": True,
                }
            ],
            "hookAlternatives": [
                {
                    "type": "result",
                    "voiceover": "先看结果，这个改动解决了最影响体验的问题。",
                    "subtitle": "结果先给你看",
                    "visual": "结果近景",
                },
                {
                    "type": "pain_point",
                    "voiceover": "如果你也遇到这个问题，先别急着花冤枉钱。",
                    "subtitle": "先避开这个坑",
                    "visual": "问题场景",
                },
            ],
            "copySuggestions": {
                "originalSummary": record.get("description", ""),
                "revisedFullScript": "结果先行，方法和证据随后，结尾只保留一个 CTA。",
                "subtitleVersion": "结果｜方法｜证据｜CTA",
                "cta": "收藏这份清单。",
            },
            "audioSuggestions": {
                "currentIssues": ["尚未完成语义级音频诊断。"],
                "musicMood": "清晰、克制、有推进感",
                "bpmRange": "90–110 BPM",
                "openingAudioAction": "前 0.3 秒不留无意义静音。",
                "voiceMusicBalance": "BGM 比人声低约 12–18 dB。",
                "transitionSuggestions": ["只在信息层级变化处使用轻量转场音。"],
                "avoid": ["未经确认的版权歌曲"],
            },
            "limitations": [
                NO_RETENTION_LIMITATION,
                "规则诊断不等同于因果结论，需人工复核内容证据。",
            ],
        }
    )
