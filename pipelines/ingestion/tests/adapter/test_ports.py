"""The nine ports and their `NotWiredPort` stand-ins (deliverable 6/7)."""

from __future__ import annotations

import copy

import pytest
from taxrag_pipeline_ingestion.adapter import (
    PORT_IMPLEMENTORS,
    PORTS,
    AdapterRunContext,
    NotWiredPort,
    PortNotWiredError,
)

PORT_FIELDS = {
    "fetcher": "Fetcher",
    "artifacts": "ArtifactStore",
    "licence": "LicenceGate",
    "parser": "ParserHost",
    "quarantine": "QuarantineSink",
    "records": "RecordSink",
    "runs": "RunRecorder",
    "history": "RunHistoryPort",
    "clock": "Clock",
}


def _protocol_methods(protocol: type) -> list[str]:
    return [
        name
        for name, value in vars(protocol).items()
        if not name.startswith("_") and callable(value)
    ]


def test_ports_and_implementors_cover_exactly_the_nine() -> None:
    assert set(PORTS) == set(PORT_IMPLEMENTORS)
    assert len(PORTS) == 9
    assert set(PORT_IMPLEMENTORS.values()) == {"INGF-02", "INGF-03", "INGF-04", "INGF-05", "INGF-06"}


@pytest.mark.parametrize("port_name", sorted(PORTS))
def test_every_port_method_raises_naming_the_port_and_the_ticket(port_name: str) -> None:
    stand_in = NotWiredPort(port_name)
    methods = _protocol_methods(PORTS[port_name])
    assert methods, f"{port_name} declares no method"
    for method in methods:
        with pytest.raises(PortNotWiredError) as excinfo:
            getattr(stand_in, method)()
        message = str(excinfo.value)
        assert port_name in message
        assert method in message
        assert PORT_IMPLEMENTORS[port_name] in message


def test_an_unknown_port_name_fails_at_construction() -> None:
    with pytest.raises(KeyError):
        NotWiredPort("NoSuchPort")


def test_dunder_access_raises_attribute_error_not_a_raising_callable() -> None:
    """`copy`, `pickle` and `dataclasses` probe dunders; they must get a real AttributeError."""
    stand_in = NotWiredPort("Fetcher")
    with pytest.raises(AttributeError):
        stand_in.__deepcopy__
    with pytest.raises(AttributeError):
        stand_in.__copy__
    with pytest.raises(AttributeError):
        stand_in.__setstate__
    assert copy.deepcopy(stand_in).port == "Fetcher"
    assert "Fetcher" in repr(stand_in)


def test_unwired_context_has_a_not_wired_port_in_every_port_field() -> None:
    ctx = AdapterRunContext.unwired("AU_CTH_DEMO")
    assert ctx.group_id == "AU_CTH_DEMO"
    assert ctx.run_id == "unwired"
    for field, port_name in PORT_FIELDS.items():
        value = getattr(ctx, field)
        assert isinstance(value, NotWiredPort), field
        assert value.port == port_name


def test_using_a_port_from_an_unwired_context_raises() -> None:
    ctx = AdapterRunContext.unwired("AU_CTH_DEMO")
    with pytest.raises(PortNotWiredError) as excinfo:
        ctx.fetcher.fetch(None)
    assert "INGF-02" in str(excinfo.value)
