from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

PLOT_TYPES = Literal["scatter", "line"]


class XYEData(BaseModel):
    name: str
    x: list[float]
    y: list[float]
    e: list[float] | None
    filepath: str | None
    filenumber: int | None


class PlotResponse(BaseModel):
    name: str
    plotted: bool = False
    error: str | None = None


class PlotData(BaseModel):
    data: XYEData
    fit: XYEData | None
    plot_type: PLOT_TYPES = Field(default="line")
    id: UUID | None = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def age_seconds(self, now: datetime | None = None) -> float:
        """Seconds elapsed since this result was created."""
        return ((now or datetime.now(UTC)) - self.created_at).total_seconds()

    def expires_at(self, ttl_seconds: int) -> datetime:
        """The moment this result becomes eligible for removal."""
        return self.created_at + timedelta(seconds=ttl_seconds)

    def is_expired(self, ttl_seconds: int, now: datetime | None = None) -> bool:
        return self.age_seconds(now) > ttl_seconds
