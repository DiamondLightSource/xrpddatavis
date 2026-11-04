"""Which instrument sessions a user may see.

Asked of Diamond's policy service (OPA) - the same service BlueAPI uses. Its
``diamond.policy.session.access`` rule is true when the token's user is on
the session's proposal, named on the session, an admin of its beamline, or a
super-admin.
"""

import asyncio
import re
import time
from collections.abc import Iterable

import requests

from xrpddatavis.logger import logger

# e.g. cm12345-1: proposal 12345, visit 1
SESSION_RE = re.compile(r"^[a-zA-Z]{2}(?P<proposal>\d+)-(?P<visit>\d+)$")

# how long an answer is reused, so a list refresh doesn't ask OPA every time
CACHE_SECONDS = 60
# drop expired answers once the cache holds this many
CACHE_PRUNE_SIZE = 10_000


class SessionAccess:
    def __init__(self, opa_url: str, audience: str):
        self.opa_url = opa_url
        # OPA checks the token itself, and needs the audience it was issued for
        self.audience = audience
        # (token, session) -> (when the answer expires, allowed)
        self._cache: dict[tuple[str, str], tuple[float, bool]] = {}

    def _ask_opa(self, token: str, session: str) -> bool | None:
        """True or False, or None if OPA couldn't be asked."""
        match = SESSION_RE.match(session)
        if not match:
            # not a session OPA can check, so it can't be shown
            return False

        try:
            response = requests.post(
                self.opa_url,
                json={
                    "input": {
                        "token": token,
                        "audience": self.audience,
                        "proposal": int(match["proposal"]),
                        "visit": int(match["visit"]),
                    }
                },
                timeout=5,
            )
            response.raise_for_status()
        except requests.RequestException as error:
            logger.warning("could not ask OPA about session %s: %s", session, error)
            return None

        # OPA leaves "result" out when it can't decide, e.g. for a bad token
        return response.json().get("result") is True

    async def allowed(self, token: str, sessions: Iterable[str]) -> set[str]:
        """The sessions, out of `sessions`, the token's user may see."""
        sessions = set(sessions)
        now = time.monotonic()

        def cached(session: str) -> bool | None:
            expires, allowed = self._cache.get((token, session), (0.0, False))
            return allowed if expires > now else None

        to_ask = [session for session in sessions if cached(session) is None]
        answers = await asyncio.gather(
            *(asyncio.to_thread(self._ask_opa, token, session) for session in to_ask)
        )

        if len(self._cache) > CACHE_PRUNE_SIZE:
            self._cache = {k: v for k, v in self._cache.items() if v[0] > now}

        allowed = {session for session in sessions if cached(session)}
        for session, answer in zip(to_ask, answers, strict=True):
            if answer is None:
                continue  # OPA was unreachable - hide it, and ask again next time
            self._cache[(token, session)] = (now + CACHE_SECONDS, answer)
            if answer:
                allowed.add(session)
        return allowed
