import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Literal, Self
from uuid import UUID, uuid4

import numpy as np
from pydantic import BaseModel, Field, model_validator

PLOT_TYPES = Literal["scatter", "line", "line+markers"]
DATA_TYPES = Literal["pxrd", "gr", "fq", "sq", "iq"]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def get_filenumber_from_filepath(filepath: str) -> int:
    """Try to get a filenumber from the filepath
    Raises if it doesn't fine a filenumber

    """
    filename = Path(filepath).stem

    matches = re.findall(r"\d+", filename)

    if not matches:
        raise ValueError(f"No number found in filename: {filename}")

    return int(matches[-1])


def get_instrument_session_from_filepath(filepath: str) -> str:
    """
    Extract the INSTRUMENT_SESSION component from a file path.

    Expects: /dls/BEAMLINE/data/YEAR/INSTRUMENT_SESSION/...

    Returns the instrument session string, e.g. "cm12345-1"

    Raises if the path doesn't find a instrument sesh.
    """
    parts = Path(filepath).parts

    # Regex for each relevant path segment
    beamline_re = re.compile(r"^[a-zA-Z]\d+(-\d+)?$")
    year_re = re.compile(r"^\d{4}$")
    session_re = re.compile(r"^[a-zA-Z]{2}\d+-\d+$")

    # Find 'dls' as an anchor, then walk forward from there
    try:
        dls_index = next(i for i, p in enumerate(parts) if p.lower() == "dls")
    except StopIteration as e:
        raise ValueError(f"Path does not contain a 'dls' root: {filepath!r}") from e

    try:
        beamline = parts[dls_index + 1]
        data_segment = parts[dls_index + 2]
        year = parts[dls_index + 3]
        instrument_session = parts[dls_index + 4]
    except IndexError as e:
        raise ValueError(
            f"Path is too short to contain expected structure: {filepath!r}, {e}"  # noqa
        ) from e

    if not beamline_re.match(beamline):
        raise ValueError(f"Unexpected BEAMLINE format: {beamline!r}")

    if data_segment.lower() != "data":
        raise ValueError(f"Expected 'data' segment, got: {data_segment!r}")

    if not year_re.match(year):
        raise ValueError(f"Unexpected YEAR format: {year!r}")

    if not session_re.match(instrument_session):
        raise ValueError(
            f"Unexpected INSTRUMENT_SESSION format: {instrument_session!r}"
        )

    return instrument_session


class XYEData(BaseModel):
    """A single 1D trace: x, y and optional y errors."""

    title: str
    x: list[float]
    y: list[float]
    e: list[float] | None = None

    @model_validator(mode="after")
    def _check_lengths(self) -> Self:
        if not self.x:
            raise ValueError("x must contain at least one point")
        if len(self.x) != len(self.y):
            raise ValueError(
                f"x and y must be the same length (got {len(self.x)} and {len(self.y)})"
            )
        if self.e is not None and len(self.e) != len(self.x):
            raise ValueError(
                f"e must be the same length as x (got {len(self.e)} and {len(self.x)})"
            )
        return self


class DataPlot(XYEData):
    """An :class:`XYEData` trace plus everything needed to plot and locate it.

    This is what actually gets drawn - as opposed to ``XYEData``, which is
    just the numbers.
    """

    filepath: str | None = None
    # explicit override for get_filenumber() - usually left unset and derived
    # from filepath instead
    filenumber: int | None = None
    # explicit override for get_instrument_session() - usually left unset and
    # derived from filepath instead
    instrument_session: str | None = None
    # axis labels for the frontend, e.g. "2θ / °" and "Intensity / counts"
    x_label: str | None = None
    y_label: str | None = "Intensity (Arb. Units)"
    data_type: DATA_TYPES | str | None = None
    plot_type: PLOT_TYPES = Field(default="line")
    # replace an existing plot that has the same title rather than adding a
    # new one - useful for live scans that push repeated updates of one trace
    upsert: bool = False

    def get_instrument_session(self) -> str | None:
        """Return instrument session if its not none, otherwise
        try and determine it from the filepath"""

        if self.instrument_session is not None:
            return self.instrument_session
        elif self.filepath is not None:
            try:
                return get_instrument_session_from_filepath(self.filepath)
            except ValueError:
                # filepath doesn't match the expected /dls/BEAMLINE/data/YEAR/SESSION
                # shape - not every plot has a Diamond-style path, so this is
                # expected rather than exceptional
                return None
        else:
            return None

    def get_filenumber(self) -> int | None:
        if self.filenumber is not None:
            return self.filenumber
        elif self.filepath is not None:
            try:
                return get_filenumber_from_filepath(self.filepath)
            except ValueError:
                # there is no filenumber in the filepath or no
                return None
        else:
            return None


class FittedDataPlot(DataPlot):
    """A :class:`DataPlot` with a fit: a calculated curve sharing ``x`` with
    the observed data, plus the difference, background and reflection-marker
    curves conventionally drawn alongside it (as in a Rietveld refinement
    plot)."""

    calc: list[float]
    diff: list[float] | None = None
    background: list[float] | float | None = None
    markers: list[float] | None = None

    @property
    def obs(self):
        return self.y

    @property
    def difference(self) -> list[float]:
        """returns obs-calc"""
        if self.diff is not None:
            return self.diff
        else:
            difference = np.array(self.y) - np.array(self.calc)
            return difference.tolist()


# Body of a POST to ``/plot``: a single flat document, either a plain
# DataPlot or (if it carries ``calc``) a FittedDataPlot. ``union_mode`` is
# pinned to try FittedDataPlot first - otherwise DataPlot, which ignores
# unknown fields, would silently swallow ``calc``/``diff``/etc and parse
# every fitted document as an unfitted one.
PlotRequest = Annotated[FittedDataPlot | DataPlot, Field(union_mode="left_to_right")]


class PlotResponse(BaseModel):
    name: str
    plotted: bool = False
    error: str | None = None
    id: UUID | None = None
    expires_at: datetime | None = None
    # ids dropped to stay within plots.max_plots
    evicted: list[UUID] = Field(default_factory=list)


class PlotUpdate(BaseModel):
    """Fields of a stored plot that may be edited after the fact."""

    name: str | None = None
    plot_type: PLOT_TYPES | None = None
    colour_index: int | None = Field(default=None, ge=0)
    data_type: DATA_TYPES | str | None = None
    # when true, this plot is exempt from ttl_seconds expiry (see ResultStore)
    pinned: bool | None = None


class PlotData(BaseModel):
    data: Annotated[FittedDataPlot | DataPlot, Field(union_mode="left_to_right")]
    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    # bumped whenever the underlying arrays change, so clients know to
    # re-fetch a trace they have already cached
    version: int = 1
    # index into the frontend's fixed categorical palette. Assigned by the
    # store and held for the life of the plot, so a colour follows the plot
    # rather than its position in the list.
    colour_index: int = 0
    # a pinned plot is skipped by ttl expiry (and, while any unpinned plot
    # remains, by max_plots eviction) until it is unpinned or removed by hand
    pinned: bool = False

    def age_seconds(self, now: datetime | None = None) -> float:
        """Seconds elapsed since this result was created."""
        return ((now or _utcnow()) - self.created_at).total_seconds()

    def expires_at(self, ttl_seconds: int) -> datetime:
        """The moment this result becomes eligible for removal."""
        return self.created_at + timedelta(seconds=ttl_seconds)

    def is_expired(self, ttl_seconds: int, now: datetime | None = None) -> bool:
        return self.age_seconds(now) > ttl_seconds

    def summary(self, ttl_seconds: int, now: datetime | None = None) -> "PlotSummary":
        now = now or _utcnow()
        age = self.age_seconds(now)
        return PlotSummary(
            id=self.id,
            name=self.data.title,
            plot_type=self.data.plot_type,
            data_type=self.data.data_type,
            points=len(self.data.x),
            x_min=min(self.data.x),
            x_max=max(self.data.x),
            y_min=min(self.data.y),
            y_max=max(self.data.y),
            has_errors=self.data.e is not None,
            has_fit=isinstance(self.data, FittedDataPlot),
            filepath=self.data.filepath,
            filenumber=self.data.get_filenumber(),
            instrument_session=self.data.get_instrument_session(),
            created_at=self.created_at,
            updated_at=self.updated_at,
            version=self.version,
            colour_index=self.colour_index,
            pinned=self.pinned,
            age_seconds=age,
            expires_at=self.expires_at(ttl_seconds),
            ttl_remaining_seconds=max(0.0, ttl_seconds - age),
        )


class PlotSummary(BaseModel):
    """Metadata for the table on the left of the frontend - no arrays."""

    id: UUID
    name: str
    plot_type: PLOT_TYPES
    data_type: DATA_TYPES | str | None
    points: int
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    has_errors: bool
    has_fit: bool
    filepath: str | None
    filenumber: int | None
    instrument_session: str | None
    created_at: datetime
    updated_at: datetime
    version: int
    colour_index: int
    pinned: bool
    age_seconds: float
    expires_at: datetime
    ttl_remaining_seconds: float


class LivePlots(BaseModel):
    plots: list[PlotSummary]
    max_plots: int
    ttl_seconds: int
    revision: int
