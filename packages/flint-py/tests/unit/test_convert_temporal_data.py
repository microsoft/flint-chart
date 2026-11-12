from datetime import datetime, timezone

from flint.core.resolve_semantics import convert_temporal_data


def test_no_conversion_returns_original_and_ignores_later_keys():
    rows = [{"value": 1}, {"value": 2, "later_date": "2024-01-01"}]
    assert convert_temporal_data(rows, {"later_date": "Date"}) is rows
    no_first_row_keys = [{}, {"year": 2020}]
    assert convert_temporal_data(no_first_row_keys, {"year": "Year"}) is no_first_row_keys
    empty = []
    assert convert_temporal_data(empty, {}) is empty


def test_explicit_year_and_non_temporal_year_name():
    rows = [{"period": " 49 ", "year": 2020}, {"period": "50", "year": 2020}]
    assert convert_temporal_data(rows, {"period": "Year"}) == [
        {"period": "2049", "year": 2020},
        {"period": "1950", "year": 2020},
    ]


def test_explicit_datetime_and_temporal_booleans():
    rows = [{"date": datetime(2020, 1, 1, tzinfo=timezone.utc), "stamp": True}]
    assert convert_temporal_data(rows, {"date": "Date", "stamp": "Timestamp"}) == [
        {"date": "2020-01-01T00:00:00.000Z", "stamp": "true"}
    ]
    assert rows[0]["stamp"] is True


def test_conversion_covers_all_first_row_fields_and_missing_values():
    rows = [
        {"calendar_year": 2020, "decade": " 99 ", "stamp": 1_700_000_000, "date": "2020-01-01"},
        {"calendar_year": 2021, "decade": 2000, "stamp": 1_700_000_000_000, "date": None},
        {"calendar_year": None, "stamp": None},
    ]
    result = convert_temporal_data(rows, {"decade": "Decade", "stamp": "Timestamp"})
    assert result == [
        {"calendar_year": "2020", "decade": "1999", "stamp": "2023-11-14T22:13:20.000Z", "date": "2020-01-01"},
        {"calendar_year": "2021", "decade": "2000", "stamp": "2023-11-14T22:13:20.000Z", "date": "null"},
        {"calendar_year": "null", "decade": "null", "stamp": "null", "date": "null"},
    ]
    assert rows[0]["calendar_year"] == 2020
    assert "decade" not in rows[2]


def test_deepcopy_preserves_shared_nested_values_and_repeated_rows():
    shared = {"children": [1]}
    first = {"year": 2020, "left": shared, "right": shared}
    second = {"year": 2021, "left": shared}
    rows = [first, second, first]
    result = convert_temporal_data(rows, {})
    assert result is not rows
    assert result[0] is result[2]
    assert result[0]["left"] is result[0]["right"] is result[1]["left"]
    assert result[0]["left"] is not shared
    result[0]["left"]["children"].append(2)
    assert shared == {"children": [1]}
    assert first["year"] == 2020
