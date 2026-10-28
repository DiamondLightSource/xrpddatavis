"""Only plots in instrument sessions the user can see (per OPA), plus plots
with no session, are visible - against the stand-in Keycloak in conftest.py
and a stand-in OPA."""

import pytest
import requests
from fastapi.testclient import TestClient

from conftest import AUDIENCE, ISSUER, token, xye
from xrpddatavis.auth import sessions
from xrpddatavis.config import Config
from xrpddatavis.endpoints import CLEAR_PLOTS, LIVEPLOTS, PLOT
from xrpddatavis.server import start_api

OPA_URL = "https://opa.example.ac.uk/v1/data/diamond/policy/session/access"
TOKEN = token()
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


class FakeOpa:
    """Grants (proposal, visit) pairs in `granted`; records every question."""

    def __init__(self):
        self.granted = {(12345, 1)}
        self.questions: list[dict] = []
        self.down = False
        self.undecided = False

    def __call__(self, url, json, timeout):
        assert url == OPA_URL
        if self.down:
            raise requests.ConnectionError("OPA is down")
        question = json["input"]
        self.questions.append(question)
        response = requests.Response()
        response.status_code = 200
        if self.undecided:
            response._content = b"{}"
        else:
            allowed = (question["proposal"], question["visit"]) in self.granted
            response._content = b'{"result": %s}' % (b"true" if allowed else b"false")
        return response


@pytest.fixture
def opa(monkeypatch) -> FakeOpa:
    fake = FakeOpa()
    monkeypatch.setattr(sessions.requests, "post", fake)
    return fake


@pytest.fixture
def client(config: Config, fake_keycloak, opa):
    config.auth.enabled = True
    config.auth.issuer = ISSUER
    config.auth.client_audience = AUDIENCE
    config.auth.opa_url = OPA_URL
    config.plots.max_plots = 10
    with TestClient(start_api(config)) as test_client:
        yield test_client


def post(client: TestClient, title: str, session: str | None = None) -> str:
    body = xye(title)
    if session:
        body["filepath"] = f"/dls/i11/data/2026/{session}/{title}.xye"
    return client.post(PLOT, json=body).json()["id"]


def visible(client: TestClient) -> set[str]:
    plots = client.get(LIVEPLOTS, headers=HEADERS).json()["plots"]
    return {plot["name"] for plot in plots}


def test_only_allowed_sessions_and_sessionless_plots_are_listed(client):
    post(client, "mine", "cm12345-1")
    post(client, "theirs", "cm99999-1")
    post(client, "no-session")
    assert visible(client) == {"mine", "no-session"}


def test_opa_is_asked_with_the_users_token(client, opa):
    post(client, "mine", "cm12345-1")
    visible(client)
    assert opa.questions == [
        {"token": TOKEN, "audience": AUDIENCE, "proposal": 12345, "visit": 1}
    ]


def test_answers_are_reused(client, opa):
    post(client, "mine", "cm12345-1")
    visible(client)
    visible(client)
    assert len(opa.questions) == 1


def test_a_session_that_cant_be_checked_is_hidden(client, opa):
    client.post(PLOT, json=xye("odd", instrument_session="not-a-session"))
    assert visible(client) == set()
    assert opa.questions == []


@pytest.mark.parametrize("failure", ["down", "undecided"])
def test_sessions_are_hidden_when_opa_cant_answer(client, opa, failure):
    post(client, "mine", "cm12345-1")
    setattr(opa, failure, True)
    assert visible(client) == set()


def test_hidden_plots_cant_be_fetched_edited_or_deleted(client):
    theirs = post(client, "theirs", "cm99999-1")
    assert client.get(f"{PLOT}/{theirs}", headers=HEADERS).status_code == 404
    assert (
        client.patch(f"/edit/{theirs}", json={"name": "x"}, headers=HEADERS).status_code
        == 404
    )
    assert client.delete(f"/remove/{theirs}", headers=HEADERS).status_code == 404


def test_visible_plots_can_be_fetched_edited_and_deleted(client):
    mine = post(client, "mine", "cm12345-1")
    assert client.get(f"{PLOT}/{mine}", headers=HEADERS).status_code == 200
    assert (
        client.patch(f"/edit/{mine}", json={"name": "x"}, headers=HEADERS).status_code
        == 200
    )
    assert client.delete(f"/remove/{mine}", headers=HEADERS).status_code == 200


def test_delete_all_only_deletes_visible_plots(client, opa):
    post(client, "mine", "cm12345-1")
    post(client, "theirs", "cm99999-1")
    post(client, "no-session")

    assert client.delete(CLEAR_PLOTS, headers=HEADERS).json() == {"removed": 2}

    # another user, who can see cm99999-1, still has their plot
    opa.granted.add((99999, 1))
    other = {"Authorization": f"Bearer {token(fedid='xyz98765')}"}
    plots = client.get(LIVEPLOTS, headers=other).json()["plots"]
    assert [plot["name"] for plot in plots] == ["theirs"]
